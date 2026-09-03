import { createHash, randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
type Currency = typeof CURRENCIES[number];
type WalletAccountType = 'client' | 'agent' | 'business';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const walletId = (uid: string, currency: Currency) => `wallet_${currency.toLowerCase()}_${uid}`;
const rechargeNumberForUid = (uid: string) =>
  (BigInt(`0x${sha256(uid).slice(0, 15)}`) % 100000000000n).toString().padStart(11, '0');
const marketCashIdForUid = (uid: string) => `MCW-${sha256(`market-cash:${uid}`).slice(0, 10).toUpperCase()}`;

function requireAuth(request: any) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  return String(request.auth.uid);
}

function parseCurrency(value: any): Currency {
  if (!CURRENCIES.includes(value)) throw new HttpsError('invalid-argument', 'Devise invalide.');
  return value;
}

function parseAmount(value: any) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpsError('invalid-argument', 'Montant invalide.');
  return Math.round(amount * 100) / 100;
}

function parseIdempotencyKey(value: any, prefix: string, uid: string) {
  const raw = String(value || '').trim();
  if (!raw) return `${prefix}_${uid}_${Date.now()}_${randomInt(1000, 9999)}`;
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(raw)) throw new HttpsError('invalid-argument', 'Clé de transaction invalide.');
  return raw;
}

function requirePin(user: FirebaseFirestore.DocumentSnapshot, pin: any) {
  const value = String(pin || '');
  if (!value || user.data()?.pinHash !== sha256(value)) throw new HttpsError('permission-denied', 'Code PIN incorrect.');
}

async function getRole(uid: string) {
  return String((await db.doc(`users/${uid}`).get()).data()?.role || '');
}

async function requireAgent(uid: string) {
  const [profile, user] = await Promise.all([
    db.doc(`agent_profiles/${uid}`).get(),
    db.doc(`users/${uid}`).get(),
  ]);
  if (!profile.exists || profile.data()?.status !== 'active' || user.data()?.role !== 'agent') {
    throw new HttpsError('permission-denied', 'Compte Agent point de vente non autorisé.');
  }
  return { profile: profile.data()!, user };
}

async function ensureWalletDocs(uid: string, accountType: WalletAccountType) {
  const rechargeNumber = rechargeNumberForUid(uid);
  const marketCashId = marketCashIdForUid(uid);
  const now = Date.now();
  const batch = db.batch();

  for (const currency of CURRENCIES) {
    const ref = db.doc(`wallet_accounts/${walletId(uid, currency)}`);
    const snap = await ref.get();
    if (!snap.exists) {
      batch.set(ref, {
        id: ref.id,
        userId: uid,
        accountType,
        currency,
        availableBalance: 0,
        ledgerBalance: 0,
        heldBalance: 0,
        status: 'active',
        rechargeNumber,
        marketCashId,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      batch.set(ref, { accountType, rechargeNumber, marketCashId, updatedAt: now }, { merge: true });
    }
  }

  const rechargeRef = db.doc(`wallet_recharge_numbers/${rechargeNumber}`);
  if (!(await rechargeRef.get()).exists) batch.set(rechargeRef, { userId: uid, rechargeNumber, createdAt: now });

  const publicRef = db.doc(`wallet_public_ids/${marketCashId}`);
  const publicSnap = await publicRef.get();
  if (publicSnap.exists && publicSnap.data()?.userId !== uid) {
    throw new HttpsError('already-exists', 'Collision d’identifiant Market-Cash. Contactez le support.');
  }
  batch.set(publicRef, { userId: uid, marketCashId, updatedAt: now, createdAt: publicSnap.data()?.createdAt || now }, { merge: true });
  await batch.commit();
  return { rechargeNumber, marketCashId };
}

async function resolveActiveMerchant(marketCashId: string, payerUid?: string) {
  const normalized = String(marketCashId || '').trim().toUpperCase();
  if (!/^MCW-[A-F0-9]{10}$/.test(normalized)) throw new HttpsError('invalid-argument', 'ID marchand invalide.');
  const mapping = await db.doc(`wallet_public_ids/${normalized}`).get();
  if (!mapping.exists) throw new HttpsError('not-found', 'Marchand introuvable.');
  const merchantUid = String(mapping.data()?.userId || '');
  if (!merchantUid || merchantUid === payerUid) throw new HttpsError('failed-precondition', 'Marchand invalide.');

  const [user, profile] = await Promise.all([
    db.doc(`users/${merchantUid}`).get(),
    db.doc(`merchant_profiles/${merchantUid}`).get(),
  ]);
  if (!user.exists || user.data()?.role !== 'marchand' || !profile.exists || profile.data()?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Ce compte n’est pas un marchand Market-Cash actif.');
  }
  await ensureWalletDocs(merchantUid, 'business');
  return {
    merchantUid,
    marketCashId: normalized,
    displayName: String(profile.data()?.tradeName || user.data()?.displayName || 'Marchand Market-Cash'),
    legalName: String(profile.data()?.legalName || user.data()?.displayName || ''),
  };
}

export const lookupMerchantRecipient = onCall({ region: REGION }, async request => {
  const payerUid = requireAuth(request);
  const merchant = await resolveActiveMerchant(request.data?.marketCashId, payerUid);
  return {
    userId: merchant.merchantUid,
    marketCashId: merchant.marketCashId,
    displayName: merchant.displayName,
    legalName: merchant.legalName,
  };
});

export const merchantPayment = onCall({ region: REGION }, async request => {
  const payerUid = requireAuth(request);
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'merchantpay', payerUid);
  const payerProfile = await db.doc(`users/${payerUid}`).get();
  if (!payerProfile.exists || payerProfile.data()?.role !== 'client') throw new HttpsError('permission-denied', 'Compte client requis.');
  if (payerProfile.data()?.kycStatus !== 'approved') throw new HttpsError('failed-precondition', 'Vérification KYC requise.');
  const merchant = await resolveActiveMerchant(request.data?.marketCashId, payerUid);
  await ensureWalletDocs(payerUid, 'client');

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId };

    const payerUserRef = db.doc(`users/${payerUid}`);
    const payerWalletRef = db.doc(`wallet_accounts/${walletId(payerUid, currency)}`);
    const merchantWalletRef = db.doc(`wallet_accounts/${walletId(merchant.merchantUid, currency)}`);
    const [payerUser, payerWallet, merchantWallet] = await Promise.all([
      tx.get(payerUserRef),
      tx.get(payerWalletRef),
      tx.get(merchantWalletRef),
    ]);
    requirePin(payerUser, request.data?.pin);
    if (!payerWallet.exists || !merchantWallet.exists) throw new HttpsError('failed-precondition', 'Portefeuille indisponible.');
    const payer = payerWallet.data()!;
    const merchantBalance = merchantWallet.data()!;
    if (payer.status !== 'active' || merchantBalance.status !== 'active') throw new HttpsError('failed-precondition', 'Portefeuille indisponible.');
    if (Number(payer.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde insuffisant.');

    const now = Date.now();
    const reference = `MC-PAY-${now}`;
    tx.update(payerWalletRef, {
      availableBalance: Number(payer.availableBalance || 0) - amount,
      ledgerBalance: Number(payer.ledgerBalance || 0) - amount,
      updatedAt: now,
    });
    tx.update(merchantWalletRef, {
      availableBalance: Number(merchantBalance.availableBalance || 0) + amount,
      ledgerBalance: Number(merchantBalance.ledgerBalance || 0) + amount,
      updatedAt: now,
    });
    tx.set(txRef, {
      id: txId,
      reference,
      type: 'merchant_payment',
      status: 'settled',
      currency,
      amount,
      senderId: payerUid,
      recipientId: merchant.merchantUid,
      merchantId: merchant.merchantUid,
      merchantMarketCashId: merchant.marketCashId,
      merchantName: merchant.displayName,
      userIds: [payerUid, merchant.merchantUid],
      sourceWalletId: payerWalletRef.id,
      destinationWalletId: merchantWalletRef.id,
      rail: 'market_cash_merchant',
      createdAt: now,
      updatedAt: now,
    });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: payerWalletRef.id, userId: payerUid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: merchantWalletRef.id, userId: merchant.merchantUid, direction: 'credit', amount, currency, createdAt: now });
    tx.set(db.collection('notifications').doc(), {
      userId: merchant.merchantUid,
      title: 'Paiement reçu',
      message: `Vous avez reçu ${amount} ${currency} par paiement marchand Market-Cash.`,
      type: 'success',
      category: 'general',
      read: false,
      transactionId: txId,
      createdAt: now,
    });
    tx.set(db.collection('audit_events').doc(), { actorId: payerUid, action: 'MERCHANT_PAYMENT', resourceId: txId, merchantId: merchant.merchantUid, amount, currency, result: 'success', createdAt: now });
    return { ok: true, reference, transactionId: txId, merchantName: merchant.displayName };
  });
});

function withdrawalDocId(code: string) {
  return `wd_${sha256(`market-cash-withdraw:${code}`).slice(0, 32)}`;
}

export const createWithdrawalAuthorization = onCall({ region: REGION }, async request => {
  const clientUid = requireAuth(request);
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const userRef = db.doc(`users/${clientUid}`);
  const user = await userRef.get();
  if (!user.exists || user.data()?.role !== 'client') throw new HttpsError('permission-denied', 'Compte client requis.');
  if (user.data()?.kycStatus !== 'approved') throw new HttpsError('failed-precondition', 'Vérification KYC requise.');
  requirePin(user, request.data?.pin);
  await ensureWalletDocs(clientUid, 'client');
  const wallet = await db.doc(`wallet_accounts/${walletId(clientUid, currency)}`).get();
  if (!wallet.exists || wallet.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'Portefeuille indisponible.');
  if (Number(wallet.data()?.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde insuffisant.');

  let code = '';
  let authorizationId = '';
  for (let attempt = 0; attempt < 6; attempt += 1) {
    code = randomInt(0, 100_000_000).toString().padStart(8, '0');
    authorizationId = withdrawalDocId(code);
    if (!(await db.doc(`withdrawal_authorizations/${authorizationId}`).get()).exists) break;
    code = '';
  }
  if (!code) throw new HttpsError('resource-exhausted', 'Impossible de créer un code de retrait. Réessayez.');

  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000;
  await db.doc(`withdrawal_authorizations/${authorizationId}`).set({
    id: authorizationId,
    clientUid,
    currency,
    amount,
    status: 'pending',
    codeHash: sha256(code),
    rechargeNumber: rechargeNumberForUid(clientUid),
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
  await db.collection('audit_events').add({ actorId: clientUid, action: 'WITHDRAWAL_AUTH_CREATED', resourceId: authorizationId, amount, currency, result: 'success', createdAt: now });
  return { ok: true, authorizationId, code, currency, amount, expiresAt };
});

export const cancelWithdrawalAuthorization = onCall({ region: REGION }, async request => {
  const clientUid = requireAuth(request);
  const authorizationId = String(request.data?.authorizationId || '').trim();
  if (!authorizationId.startsWith('wd_')) throw new HttpsError('invalid-argument', 'Autorisation invalide.');
  const ref = db.doc(`withdrawal_authorizations/${authorizationId}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.clientUid !== clientUid) throw new HttpsError('not-found', 'Autorisation introuvable.');
    if (snap.data()?.status !== 'pending') throw new HttpsError('failed-precondition', 'Cette autorisation n’est plus active.');
    tx.update(ref, { status: 'cancelled', cancelledAt: Date.now(), updatedAt: Date.now() });
  });
  return { ok: true };
});

export const redeemWithdrawalAuthorization = onCall({ region: REGION }, async request => {
  const agentUid = requireAuth(request);
  const code = String(request.data?.code || '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(code)) throw new HttpsError('invalid-argument', 'Code de retrait invalide.');
  const { user: agentUser } = await requireAgent(agentUid);
  requirePin(agentUser, request.data?.pin);
  const authRef = db.doc(`withdrawal_authorizations/${withdrawalDocId(code)}`);
  const initialAuthorization = await authRef.get();
  if (!initialAuthorization.exists || initialAuthorization.data()?.codeHash !== sha256(code)) throw new HttpsError('not-found', 'Code de retrait introuvable.');
  const clientUid = String(initialAuthorization.data()?.clientUid || '');
  if (!clientUid || clientUid === agentUid) throw new HttpsError('failed-precondition', 'Autorisation invalide.');
  const currency = parseCurrency(initialAuthorization.data()?.currency);
  const amount = parseAmount(initialAuthorization.data()?.amount);
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'cashout', agentUid);
  await Promise.all([ensureWalletDocs(clientUid, 'client'), ensureWalletDocs(agentUid, 'agent')]);

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId };

    const authorization = await tx.get(authRef);
    if (!authorization.exists || authorization.data()?.codeHash !== sha256(code)) throw new HttpsError('not-found', 'Code de retrait introuvable.');
    const authData = authorization.data()!;
    if (authData.status !== 'pending') throw new HttpsError('failed-precondition', 'Ce code de retrait a déjà été utilisé ou annulé.');
    if (Number(authData.expiresAt || 0) < Date.now()) throw new HttpsError('deadline-exceeded', 'Ce code de retrait a expiré.');
    if (authData.clientUid !== clientUid || authData.currency !== currency || Number(authData.amount) !== amount) throw new HttpsError('failed-precondition', 'Autorisation de retrait incohérente.');

    const clientWalletRef = db.doc(`wallet_accounts/${walletId(clientUid, currency)}`);
    const agentWalletRef = db.doc(`wallet_accounts/${walletId(agentUid, currency)}`);
    const [clientWallet, agentWallet] = await Promise.all([tx.get(clientWalletRef), tx.get(agentWalletRef)]);
    if (!clientWallet.exists || !agentWallet.exists) throw new HttpsError('failed-precondition', 'Portefeuille indisponible.');
    const client = clientWallet.data()!;
    const agent = agentWallet.data()!;
    if (client.status !== 'active' || agent.status !== 'active') throw new HttpsError('failed-precondition', 'Portefeuille indisponible.');
    if (Number(client.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde client insuffisant au moment du retrait.');

    const now = Date.now();
    const reference = `MC-RET-${now}`;
    tx.update(clientWalletRef, {
      availableBalance: Number(client.availableBalance || 0) - amount,
      ledgerBalance: Number(client.ledgerBalance || 0) - amount,
      updatedAt: now,
    });
    tx.update(agentWalletRef, {
      availableBalance: Number(agent.availableBalance || 0) + amount,
      ledgerBalance: Number(agent.ledgerBalance || 0) + amount,
      updatedAt: now,
    });
    tx.set(txRef, {
      id: txId,
      reference,
      type: 'cash_out',
      status: 'settled',
      currency,
      amount,
      agentId: agentUid,
      clientId: clientUid,
      userIds: [agentUid, clientUid],
      authorizationId: authRef.id,
      sourceWalletId: clientWalletRef.id,
      destinationWalletId: agentWalletRef.id,
      rail: 'agent_terminal_authorized',
      createdAt: now,
      updatedAt: now,
    });
    tx.update(authRef, { status: 'settled', redeemedBy: agentUid, transactionId: txId, reference, redeemedAt: now, updatedAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: clientWalletRef.id, userId: clientUid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: agentWalletRef.id, userId: agentUid, direction: 'credit', amount, currency, createdAt: now });
    tx.set(db.collection('notifications').doc(), { userId: clientUid, title: 'Retrait confirmé', message: `Retrait de ${amount} ${currency} effectué auprès d’un point de vente Market-Cash.`, type: 'success', category: 'general', read: false, transactionId: txId, createdAt: now });
    tx.set(db.collection('audit_events').doc(), { actorId: agentUid, actorType: 'agent', action: 'AUTHORIZED_CASH_OUT', resourceId: txId, authorizationId: authRef.id, clientId: clientUid, amount, currency, result: 'success', createdAt: now });
    return { ok: true, reference, transactionId: txId, amount, currency };
  });
});
