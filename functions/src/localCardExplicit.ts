import { createHash, randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
type Currency = typeof CURRENCIES[number];

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const walletId = (uid: string, currency: Currency) => `wallet_${currency.toLowerCase()}_${uid}`;
const localCardIdForUid = (uid: string) => `local_${sha256(`local-card:${uid}`).slice(0, 24)}`;
const localCardIdentifierForUid = (uid: string) => `MCL-${sha256(`local-card-id:${uid}`).slice(0, 12).toUpperCase()}`;
const localCardNumberForUid = (uid: string) => {
  const body = (BigInt(`0x${sha256(`local-card-number:${uid}`).slice(0, 15)}`) % 100000000000000n)
    .toString()
    .padStart(14, '0');
  return `91${body}`;
};
const cardAccountId = (cardId: string, currency: Currency) => `card_${currency.toLowerCase()}_${cardId}`;

function requireAuth(request: any) {
  const uid = String(request.auth?.uid || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  return uid;
}

function parseCurrency(value: any): Currency {
  const currency = String(value || '').toUpperCase() as Currency;
  if (!CURRENCIES.includes(currency)) throw new HttpsError('invalid-argument', 'Devise invalide.');
  return currency;
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

function requirePin(user: FirebaseFirestore.DocumentSnapshot, value: any, message = 'Code PIN incorrect.') {
  const pin = String(value || '');
  if (!pin || user.data()?.pinHash !== sha256(pin)) throw new HttpsError('permission-denied', message);
}

function assertActiveUser(user: FirebaseFirestore.DocumentSnapshot, expectedRole?: string) {
  if (!user.exists) throw new HttpsError('not-found', 'Compte introuvable.');
  const data = user.data()!;
  if (expectedRole && data.role !== expectedRole) throw new HttpsError('permission-denied', 'Type de compte non autorisé.');
  if (['blocked', 'suspended'].includes(String(data.accountStatus || ''))) {
    throw new HttpsError('failed-precondition', 'Compte indisponible.');
  }
}

async function requireClient(uid: string) {
  const user = await db.doc(`users/${uid}`).get();
  assertActiveUser(user, 'client');
  return user;
}

async function ensureWallet(uid: string, currency: Currency, accountType: 'client' | 'agent' | 'business') {
  const ref = db.doc(`wallet_accounts/${walletId(uid, currency)}`);
  const snap = await ref.get();
  if (!snap.exists) {
    const now = Date.now();
    await ref.set({
      id: ref.id,
      userId: uid,
      accountType,
      currency,
      availableBalance: 0,
      ledgerBalance: 0,
      heldBalance: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  }
  return ref;
}

function expiryValues() {
  const now = new Date();
  const startMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
  const startYear = String(now.getUTCFullYear()).slice(-2);
  const end = new Date(Date.UTC(now.getUTCFullYear() + 5, now.getUTCMonth(), 1));
  const endMonth = String(end.getUTCMonth() + 1).padStart(2, '0');
  const endYear = String(end.getUTCFullYear()).slice(-2);
  return { expiryStart: `${startMonth}/${startYear}`, expiryEnd: `${endMonth}/${endYear}` };
}

async function readCardAccounts(cardId: string) {
  const result: Record<Currency, FirebaseFirestore.DocumentSnapshot> = {} as Record<Currency, FirebaseFirestore.DocumentSnapshot>;
  for (const currency of CURRENCIES) {
    result[currency] = await db.doc(`card_wallet_accounts/${cardAccountId(cardId, currency)}`).get();
  }
  return result;
}

function accountHasFunds(account: FirebaseFirestore.DocumentSnapshot) {
  const data = account.data();
  if (!data) return false;
  return [data.availableBalance, data.ledgerBalance, data.heldBalance].some(value => Math.abs(Number(value || 0)) > 0.000001);
}

async function getExistingLocalCard(uid: string, cleanupLegacy = true) {
  const user = await requireClient(uid);
  const cardId = localCardIdForUid(uid);
  const cardRef = db.doc(`local_cards/${cardId}`);
  let cardSnap = await cardRef.get();
  if (!cardSnap.exists) return { user, cardRef, card: null as any, accounts: null as any };

  let card = cardSnap.data()!;
  if (String(card.userId || '') !== uid || String(card.program || '') !== 'market_cash_local') {
    throw new HttpsError('failed-precondition', 'Carte locale incohérente. Contactez le support.');
  }

  const accounts = await readCardAccounts(cardId);
  const creationMode = String(card.creationMode || '');
  if (cleanupLegacy && !creationMode) {
    const hasFunds = CURRENCIES.some(currency => accountHasFunds(accounts[currency]));
    const transactionSnap = await db.collection('wallet_transactions').where('cardId', '==', cardId).limit(1).get();

    if (!hasFunds && transactionSnap.empty) {
      const batch = db.batch();
      batch.delete(cardRef);
      for (const currency of CURRENCIES) {
        if (accounts[currency].exists) batch.delete(accounts[currency].ref);
      }
      batch.set(db.collection('audit_events').doc(), {
        actorId: uid,
        action: 'LEGACY_AUTO_LOCAL_CARD_REMOVED',
        cardId,
        result: 'success',
        reason: 'EXPLICIT_ACTIVATION_REQUIRED',
        createdAt: Date.now(),
      });
      await batch.commit();
      return { user, cardRef, card: null as any, accounts: null as any };
    }

    await cardRef.set({
      creationMode: 'legacy_preserved',
      migrationNote: 'Preserved because the card has balance or transaction history.',
      updatedAt: Date.now(),
    }, { merge: true });
    cardSnap = await cardRef.get();
    card = cardSnap.data()!;
  }

  return { user, cardRef, card, accounts };
}

async function activateLocalCard(uid: string) {
  const current = await getExistingLocalCard(uid, true);
  const now = Date.now();
  if (current.card) {
    await current.cardRef.set({
      creationMode: 'client_explicit',
      activatedAt: current.card.activatedAt || now,
      status: 'active',
      updatedAt: now,
    }, { merge: true });
    return (await current.cardRef.get()).data()!;
  }

  const user = current.user;
  if (user.data()?.kycStatus !== 'approved') {
    throw new HttpsError('failed-precondition', 'Vérification KYC requise avant d’obtenir une carte locale.');
  }

  const cardId = localCardIdForUid(uid);
  const holder = String(user.data()?.displayName || user.data()?.fullName || 'CLIENT MARKET-CASH').trim() || 'CLIENT MARKET-CASH';
  const cardIdentifier = localCardIdentifierForUid(uid);
  const cardNumber = localCardNumberForUid(uid);
  const expiry = expiryValues();
  const cardRef = db.doc(`local_cards/${cardId}`);
  const batch = db.batch();

  batch.set(cardRef, {
    id: cardId,
    cardId,
    cardIdentifier,
    program: 'market_cash_local',
    creationMode: 'client_explicit',
    userId: uid,
    userName: holder,
    cardNumber,
    cardHolder: holder,
    cardHolderName: holder,
    network: 'market_cash',
    type: 'local',
    status: 'active',
    qrData: `MARKET-CASH-CARD:${cardIdentifier}`,
    ...expiry,
    activatedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  for (const currency of CURRENCIES) {
    const accountRef = db.doc(`card_wallet_accounts/${cardAccountId(cardId, currency)}`);
    batch.set(accountRef, {
      id: accountRef.id,
      cardId,
      userId: uid,
      currency,
      availableBalance: 0,
      ledgerBalance: 0,
      heldBalance: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  }

  batch.set(db.collection('audit_events').doc(), {
    actorId: uid,
    action: 'LOCAL_CARD_EXPLICITLY_ACTIVATED',
    cardId,
    result: 'success',
    createdAt: now,
  });

  await batch.commit();
  return (await cardRef.get()).data()!;
}

async function resolveMerchant(value: any, payerUid: string) {
  const marketCashId = String(value || '').trim().toUpperCase();
  if (!/^MCW-[A-F0-9]{10}$/.test(marketCashId)) throw new HttpsError('invalid-argument', 'ID marchand invalide.');
  const mapping = await db.doc(`wallet_public_ids/${marketCashId}`).get();
  if (!mapping.exists) throw new HttpsError('not-found', 'Marchand introuvable.');
  const merchantUid = String(mapping.data()?.userId || '');
  if (!merchantUid || merchantUid === payerUid) throw new HttpsError('failed-precondition', 'Marchand invalide.');
  const [user, profile] = await Promise.all([
    db.doc(`users/${merchantUid}`).get(),
    db.doc(`merchant_profiles/${merchantUid}`).get(),
  ]);
  assertActiveUser(user, 'marchand');
  if (!profile.exists || profile.data()?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Ce compte n’est pas un marchand Market-Cash actif.');
  }
  return {
    merchantUid,
    marketCashId,
    displayName: String(profile.data()?.tradeName || user.data()?.displayName || 'Marchand Market-Cash'),
  };
}

export const activateLocalMarketCashCard = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const card = await activateLocalCard(uid);
  return { ok: true, cardId: card.cardId, cardIdentifier: card.cardIdentifier };
});

export const getMyLocalMarketCashCardsV2 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const current = await getExistingLocalCard(uid, true);
  if (!current.card || current.card.status !== 'active') return { cards: [] };

  const balances: Partial<Record<Currency, number>> = {};
  const accounts = current.accounts || await readCardAccounts(current.card.cardId);
  for (const currency of CURRENCIES) {
    balances[currency] = Number(accounts[currency]?.data()?.availableBalance || 0);
  }
  const raw = String(current.card.cardNumber || '').replace(/\D/g, '');
  return {
    cards: [{
      cardId: current.card.cardId,
      cardIdentifier: current.card.cardIdentifier,
      cardHolder: current.card.cardHolder,
      maskedNumber: raw ? `•••• •••• •••• ${raw.slice(-4)}` : 'Carte locale Market-Cash',
      status: current.card.status,
      qrData: current.card.qrData,
      balances,
    }],
  };
});

export const walletToLocalMarketCashCardV2 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const cardId = String(request.data?.cardId || '').trim();
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'localcardtopup', uid);
  const current = await getExistingLocalCard(uid, true);
  if (!current.card) throw new HttpsError('failed-precondition', 'Obtenez d’abord votre carte locale Market-Cash dans l’espace Cartes.');
  if (cardId !== current.card.cardId) throw new HttpsError('permission-denied', 'Carte locale non autorisée.');
  await ensureWallet(uid, currency, 'client');

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId };

    const walletRef = db.doc(`wallet_accounts/${walletId(uid, currency)}`);
    const cardRef = db.doc(`local_cards/${cardId}`);
    const cardBalanceRef = db.doc(`card_wallet_accounts/${cardAccountId(cardId, currency)}`);
    const [walletSnap, cardSnap, cardBalanceSnap] = await Promise.all([
      tx.get(walletRef),
      tx.get(cardRef),
      tx.get(cardBalanceRef),
    ]);
    requirePin(current.user, request.data?.pin);
    if (!cardSnap.exists || cardSnap.data()?.userId !== uid || cardSnap.data()?.program !== 'market_cash_local' || cardSnap.data()?.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Carte locale indisponible.');
    }
    const wallet = walletSnap.data();
    if (!wallet || wallet.status !== 'active' || Number(wallet.availableBalance || 0) < amount) {
      throw new HttpsError('failed-precondition', 'Solde portefeuille insuffisant.');
    }
    const cardBalance = Number(cardBalanceSnap.data()?.availableBalance || 0);
    const cardLedger = Number(cardBalanceSnap.data()?.ledgerBalance || cardBalance);
    const now = Date.now();
    const reference = `MC-LCARD-${now}`;

    tx.update(walletRef, {
      availableBalance: Number(wallet.availableBalance || 0) - amount,
      ledgerBalance: Number(wallet.ledgerBalance || 0) - amount,
      updatedAt: now,
    });
    tx.set(cardBalanceRef, {
      id: cardBalanceRef.id,
      cardId,
      userId: uid,
      currency,
      availableBalance: cardBalance + amount,
      ledgerBalance: cardLedger + amount,
      status: 'active',
      updatedAt: now,
      createdAt: cardBalanceSnap.data()?.createdAt || now,
    }, { merge: true });
    tx.set(txRef, {
      id: txId,
      reference,
      type: 'wallet_to_local_card',
      status: 'settled',
      currency,
      amount,
      userId: uid,
      userIds: [uid],
      cardId,
      sourceWalletId: walletRef.id,
      destinationCardWalletId: cardBalanceRef.id,
      rail: 'market_cash_local_card',
      createdAt: now,
      updatedAt: now,
    });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: walletRef.id, userId: uid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, cardWalletId: cardBalanceRef.id, userId: uid, direction: 'credit', amount, currency, createdAt: now });
    return { ok: true, reference, transactionId: txId };
  });
});

export const merchantPaymentFromLocalCardV2 = onCall({ region: REGION }, async request => {
  const payerUid = requireAuth(request);
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const cardId = String(request.data?.cardId || '').trim();
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'localcardpay', payerUid);
  const current = await getExistingLocalCard(payerUid, true);
  if (!current.card) throw new HttpsError('failed-precondition', 'Obtenez d’abord votre carte locale Market-Cash dans l’espace Cartes.');
  if (current.user.data()?.kycStatus !== 'approved') throw new HttpsError('failed-precondition', 'Vérification KYC requise.');
  requirePin(current.user, request.data?.pin);
  if (!cardId || cardId !== current.card.cardId) throw new HttpsError('permission-denied', 'Carte locale obligatoire.');
  const merchant = await resolveMerchant(request.data?.marketCashId, payerUid);
  await ensureWallet(merchant.merchantUid, currency, 'business');

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId, merchantName: merchant.displayName };

    const cardRef = db.doc(`local_cards/${cardId}`);
    const cardBalanceRef = db.doc(`card_wallet_accounts/${cardAccountId(cardId, currency)}`);
    const merchantWalletRef = db.doc(`wallet_accounts/${walletId(merchant.merchantUid, currency)}`);
    const [cardSnap, cardBalanceSnap, merchantWalletSnap] = await Promise.all([
      tx.get(cardRef),
      tx.get(cardBalanceRef),
      tx.get(merchantWalletRef),
    ]);
    if (!cardSnap.exists || cardSnap.data()?.userId !== payerUid || cardSnap.data()?.program !== 'market_cash_local' || cardSnap.data()?.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Carte locale indisponible.');
    }
    const cardBalance = cardBalanceSnap.data();
    const merchantWallet = merchantWalletSnap.data();
    if (!cardBalance || cardBalance.status !== 'active') throw new HttpsError('failed-precondition', 'Solde de carte indisponible.');
    if (!merchantWallet || merchantWallet.status !== 'active') throw new HttpsError('failed-precondition', 'Compte marchand indisponible.');
    if (Number(cardBalance.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde de la carte locale insuffisant.');

    const now = Date.now();
    const reference = `MC-PAY-${now}`;
    tx.update(cardBalanceRef, {
      availableBalance: Number(cardBalance.availableBalance || 0) - amount,
      ledgerBalance: Number(cardBalance.ledgerBalance || 0) - amount,
      updatedAt: now,
    });
    tx.update(merchantWalletRef, {
      availableBalance: Number(merchantWallet.availableBalance || 0) + amount,
      ledgerBalance: Number(merchantWallet.ledgerBalance || 0) + amount,
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
      cardId,
      userIds: [payerUid, merchant.merchantUid],
      sourceCardWalletId: cardBalanceRef.id,
      destinationWalletId: merchantWalletRef.id,
      rail: 'market_cash_local_card_merchant',
      createdAt: now,
      updatedAt: now,
    });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, cardWalletId: cardBalanceRef.id, userId: payerUid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: merchantWalletRef.id, userId: merchant.merchantUid, direction: 'credit', amount, currency, createdAt: now });
    tx.set(db.collection('notifications').doc(), {
      userId: merchant.merchantUid,
      title: 'Paiement reçu',
      message: `Vous avez reçu ${amount} ${currency} par carte locale Market-Cash.`,
      type: 'success',
      category: 'general',
      read: false,
      transactionId: txId,
      createdAt: now,
    });
    tx.set(db.collection('notifications').doc(), {
      userId: payerUid,
      title: 'Paiement confirmé',
      message: `Paiement de ${amount} ${currency} effectué avec votre carte locale Market-Cash.`,
      type: 'success',
      category: 'general',
      read: false,
      transactionId: txId,
      createdAt: now,
    });
    tx.set(db.collection('audit_events').doc(), {
      actorId: payerUid,
      action: 'LOCAL_CARD_MERCHANT_PAYMENT',
      resourceId: txId,
      merchantId: merchant.merchantUid,
      cardId,
      amount,
      currency,
      result: 'success',
      createdAt: now,
    });
    return { ok: true, reference, transactionId: txId, merchantName: merchant.displayName };
  });
});
