import { createHash, randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const localCardId = (uid: string) => `local_${sha256(`local-card:${uid}`).slice(0, 24)}`;
const technicalRef = (uid: string) => `MCL-${sha256(`local-card-id:${uid}`).slice(0, 12).toUpperCase()}`;
const cardNumber = (uid: string) => {
  const body = (BigInt(`0x${sha256(`local-card-number:${uid}`).slice(0, 15)}`) % 100000000000000n)
    .toString()
    .padStart(14, '0');
  return `91${body}`;
};
const cardAccountId = (cardId: string, currency: string) => `card_${currency.toLowerCase()}_${cardId}`;
const requireAuth = (request: any) => {
  const uid = String(request.auth?.uid || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  return uid;
};

function validity(startValue?: number) {
  const start = new Date(startValue && Number.isFinite(startValue) ? startValue : Date.now());
  const end = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()));
  const fmt = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(-2)}`;
  return { expiryStart: fmt(start), expiryEnd: fmt(end) };
}

async function ensureCvv(uid: string) {
  const ref = db.doc(`user_security/${uid}`);
  const snap = await ref.get();
  const existing = String(snap.data()?.localTransactionCvv || '');
  if (/^\d{3}$/.test(existing)) {
    return {
      cvvVersion: Number(snap.data()?.cvvVersion || 1),
      cvvUpdatedAt: Number(snap.data()?.cvvUpdatedAt || Date.now()),
    };
  }
  const cvv = randomInt(100, 1000).toString();
  const now = Date.now();
  await ref.set({
    userId: uid,
    localTransactionCvv: cvv,
    localTransactionCvvHash: sha256(cvv),
    cvvVersion: 1,
    cvvUpdatedAt: now,
    createdAt: snap.data()?.createdAt || now,
    updatedAt: now,
  }, { merge: true });
  return { cvvVersion: 1, cvvUpdatedAt: now };
}

async function hasApprovedKycRequest(uid: string) {
  const direct = await db.doc(`kyc_requests/${uid}`).get();
  if (direct.exists && String(direct.data()?.status || '') === 'approved') return true;

  // Compatibility with historical requests whose document id was not the UID.
  const legacy = await db.collection('kyc_requests').where('userId', '==', uid).limit(10).get();
  return legacy.docs.some(docSnap => String(docSnap.data()?.status || '') === 'approved');
}

async function getVerifiedClient(uid: string) {
  const ref = db.doc(`users/${uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Compte introuvable.');
  const data = snap.data()!;
  if (data.role !== 'client') return null;

  const userApproved = String(data.kycStatus || '') === 'approved';
  const requestApproved = userApproved ? true : await hasApprovedKycRequest(uid);
  if (!requestApproved) throw new HttpsError('failed-precondition', 'Vérification KYC requise.');

  return { ref, data, needsKycSync: !userApproved };
}

export async function provisionVerifiedLocalCard(uid: string, notify = true) {
  const verified = await getVerifiedClient(uid);
  if (!verified) return null;

  const { ref: userRef, data, needsKycSync } = verified;
  const id = localCardId(uid);
  const ref = db.doc(`local_cards/${id}`);
  const existing = await ref.get();
  const now = Date.now();
  const createdAt = Number(existing.data()?.createdAt || existing.data()?.activatedAt || now);
  const dates = validity(createdAt);
  const holder = String(data.displayName || data.fullName || 'CLIENT MARKET-CASH').trim() || 'CLIENT MARKET-CASH';
  const security = await ensureCvv(uid);
  const batch = db.batch();

  batch.set(ref, {
    id,
    cardId: id,
    cardIdentifier: technicalRef(uid),
    program: 'market_cash_local',
    creationMode: existing.data()?.creationMode || 'kyc_auto',
    userId: uid,
    userName: holder,
    cardNumber: String(existing.data()?.cardNumber || cardNumber(uid)),
    cardHolder: holder,
    cardHolderName: holder,
    network: 'market_cash',
    type: 'local',
    status: 'active',
    qrData: `MARKET-CASH-CARD:${technicalRef(uid)}`,
    ...dates,
    validityMonths: 12,
    cvvVersion: security.cvvVersion,
    cvvUpdatedAt: security.cvvUpdatedAt,
    activatedAt: Number(existing.data()?.activatedAt || now),
    createdAt,
    updatedAt: now,
  }, { merge: true });

  for (const currency of CURRENCIES) {
    const account = db.doc(`card_wallet_accounts/${cardAccountId(id, currency)}`);
    const accountSnap = await account.get();
    if (!accountSnap.exists) {
      batch.set(account, {
        id: account.id,
        cardId: id,
        userId: uid,
        currency,
        availableBalance: 0,
        ledgerBalance: 0,
        heldBalance: 0,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (!existing.exists) {
    batch.set(db.collection('audit_events').doc(), {
      actorId: uid,
      action: 'LOCAL_CARD_AUTO_PROVISIONED_AFTER_KYC',
      cardId: id,
      result: 'success',
      createdAt: now,
    });
    if (notify) {
      batch.set(db.collection('notifications').doc(), {
        userId: uid,
        title: 'Votre carte locale est prête',
        message: 'Votre identité est vérifiée. Votre carte Market-Cash Locale gratuite a été créée automatiquement.',
        type: 'success',
        category: 'security',
        read: false,
        createdAt: now,
      });
    }
  }

  await batch.commit();

  // Historical KYC approvals sometimes updated only kyc_requests. Repair users/{uid}
  // after the card exists so the users trigger cannot create duplicate notifications.
  if (needsKycSync) {
    await userRef.set({ kycStatus: 'approved', updatedAt: Date.now() }, { merge: true });
  }

  return {
    cardId: id,
    cardIdentifier: technicalRef(uid),
    expiryStart: dates.expiryStart,
    expiryEnd: dates.expiryEnd,
  };
}

export const onClientKycApproved = onDocumentUpdated({ document: 'users/{uid}', region: REGION }, async event => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  const uid = String(event.params.uid || '');
  if (!uid || before?.kycStatus === 'approved' || after?.kycStatus !== 'approved' || after?.role !== 'client') return;
  try {
    await provisionVerifiedLocalCard(uid, true);
  } catch (error) {
    console.error('[KYC_LOCAL_CARD_PROVISION_FAILED]', uid, error);
  }
});

export const onKycRequestApproved = onDocumentUpdated({ document: 'kyc_requests/{requestId}', region: REGION }, async event => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (before?.status === 'approved' || after?.status !== 'approved') return;
  const uid = String(after?.userId || event.params.requestId || '');
  if (!uid) return;
  try {
    await provisionVerifiedLocalCard(uid, true);
  } catch (error) {
    console.error('[KYC_REQUEST_LOCAL_CARD_PROVISION_FAILED]', uid, error);
  }
});

export const activateLocalMarketCashCardV2 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const card = await provisionVerifiedLocalCard(uid, true);
  if (!card) throw new HttpsError('failed-precondition', 'Compte Client requis.');
  return { ok: true, ...card };
});

export const getMyLocalMarketCashCardsV3 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const id = localCardId(uid);
  let card = await db.doc(`local_cards/${id}`).get();

  // Self-heal verified historical accounts even when the activation call was skipped.
  if (!card.exists) {
    try {
      await provisionVerifiedLocalCard(uid, false);
      card = await db.doc(`local_cards/${id}`).get();
    } catch (error: any) {
      if (error instanceof HttpsError && error.code === 'failed-precondition') return { cards: [] };
      throw error;
    }
  }

  if (!card.exists || card.data()?.userId !== uid || card.data()?.status !== 'active') return { cards: [] };
  const data = card.data()!;
  const dates = validity(Number(data.createdAt || data.activatedAt || Date.now()));
  const balances: Record<string, number> = {};
  for (const currency of CURRENCIES) {
    balances[currency] = Number((await db.doc(`card_wallet_accounts/${cardAccountId(id, currency)}`).get()).data()?.availableBalance || 0);
  }
  const raw = String(data.cardNumber || '').replace(/\D/g, '');
  return {
    cards: [{
      cardId: id,
      cardIdentifier: String(data.cardIdentifier || technicalRef(uid)),
      cardHolder: String(data.cardHolder || data.cardHolderName || 'CLIENT MARKET-CASH'),
      maskedNumber: raw ? `•••• •••• •••• ${raw.slice(-4)}` : '•••• •••• •••• ••••',
      status: String(data.status || 'active'),
      qrData: String(data.qrData || ''),
      expiryStart: String(data.expiryStart || dates.expiryStart),
      expiryEnd: String(data.expiryEnd || dates.expiryEnd),
      balances,
    }],
  };
});
