import { createHash, randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { ensureLocalCardIdentifier, ensureRolePublicId, normalizeMerchantPublicId } from './identifiers';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
type Currency = typeof CURRENCIES[number];

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const walletId = (uid: string, currency: Currency) => `wallet_${currency.toLowerCase()}_${uid}`;
const localCardDocId = (uid: string) => `local_${sha256(`local-card:${uid}`).slice(0, 24)}`;
const cardAccountId = (cardId: string, currency: Currency) => `card_${currency.toLowerCase()}_${cardId}`;
const localCardNumber = (uid: string) => {
  const body = (BigInt(`0x${sha256(`local-card-number:${uid}`).slice(0, 15)}`) % 100000000000000n).toString().padStart(14, '0');
  return `91${body}`;
};

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

function requirePin(user: FirebaseFirestore.DocumentSnapshot, value: any, message = 'Code secret incorrect.') {
  const pin = String(value || '');
  if (!pin || user.data()?.pinHash !== sha256(pin)) throw new HttpsError('permission-denied', message);
}

async function requireClient(uid: string) {
  const user = await db.doc(`users/${uid}`).get();
  if (!user.exists || user.data()?.role !== 'client') throw new HttpsError('permission-denied', 'Compte client requis.');
  if (['blocked', 'suspended'].includes(String(user.data()?.accountStatus || ''))) throw new HttpsError('failed-precondition', 'Compte indisponible.');
  return user;
}

async function ensureWallet(uid: string, currency: Currency, accountType: 'client' | 'business') {
  const identity = await ensureRolePublicId(uid, accountType === 'business' ? 'marchand' : 'client');
  const ref = db.doc(`wallet_accounts/${walletId(uid, currency)}`);
  const snap = await ref.get();
  const now = Date.now();
  if (!snap.exists) {
    await ref.set({ id: ref.id, userId: uid, accountType, currency, availableBalance: 0, ledgerBalance: 0, heldBalance: 0, status: 'active', publicId: identity.publicId, marketCashId: identity.publicId, createdAt: now, updatedAt: now });
  } else {
    await ref.set({ publicId: identity.publicId, marketCashId: identity.publicId, accountType, updatedAt: now }, { merge: true });
  }
  return ref;
}

function expiryValues() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear() + 5, now.getUTCMonth(), 1));
  return {
    expiryStart: `${String(now.getUTCMonth() + 1).padStart(2, '0')}/${String(now.getUTCFullYear()).slice(-2)}`,
    expiryEnd: `${String(end.getUTCMonth() + 1).padStart(2, '0')}/${String(end.getUTCFullYear()).slice(-2)}`,
  };
}

async function ensureLocalCardV2(uid: string) {
  const user = await requireClient(uid);
  await ensureRolePublicId(uid, 'client');
  const cardId = localCardDocId(uid);
  const cardRef = db.doc(`local_cards/${cardId}`);
  const existing = await cardRef.get();
  const data = existing.data() || {};
  const holder = String(user.data()?.displayName || user.data()?.fullName || 'CLIENT MARKET-CASH').trim() || 'CLIENT MARKET-CASH';
  const cardIdentifier = await ensureLocalCardIdentifier(uid, holder, data.cardIdentifier);
  const now = Date.now();
  const expiry = expiryValues();

  await cardRef.set({
    id: cardId,
    cardId,
    cardIdentifier,
    program: 'market_cash_local',
    userId: uid,
    userName: holder,
    cardNumber: String(data.cardNumber || localCardNumber(uid)),
    cardHolder: holder,
    cardHolderName: holder,
    network: 'market_cash',
    type: 'local',
    status: 'active',
    qrData: `MARKET-CASH-CARD:${cardIdentifier}`,
    expiryStart: data.expiryStart || expiry.expiryStart,
    expiryEnd: data.expiryEnd || expiry.expiryEnd,
    createdAt: data.createdAt || now,
    updatedAt: now,
  }, { merge: true });

  for (const currency of CURRENCIES) {
    const balanceRef = db.doc(`card_wallet_accounts/${cardAccountId(cardId, currency)}`);
    const balance = await balanceRef.get();
    if (!balance.exists) {
      await balanceRef.set({ id: balanceRef.id, cardId, userId: uid, currency, availableBalance: 0, ledgerBalance: 0, heldBalance: 0, status: 'active', createdAt: now, updatedAt: now });
    }
  }
  return (await cardRef.get()).data()!;
}

async function localBalances(cardId: string) {
  const balances: Partial<Record<Currency, number>> = {};
  for (const currency of CURRENCIES) {
    const snap = await db.doc(`card_wallet_accounts/${cardAccountId(cardId, currency)}`).get();
    balances[currency] = Number(snap.data()?.availableBalance || 0);
  }
  return balances;
}

async function resolveMerchant(value: any, payerUid: string) {
  const publicId = normalizeMerchantPublicId(value);
  const mapping = await db.doc(`wallet_public_ids/${publicId}`).get();
  if (!mapping.exists || mapping.data()?.role !== 'marchand') throw new HttpsError('not-found', 'Marchand introuvable.');
  const merchantUid = String(mapping.data()?.userId || '');
  if (!merchantUid || merchantUid === payerUid) throw new HttpsError('failed-precondition', 'Marchand invalide.');
  const [user, profile] = await Promise.all([db.doc(`users/${merchantUid}`).get(), db.doc(`merchant_profiles/${merchantUid}`).get()]);
  if (!user.exists || user.data()?.role !== 'marchand' || !profile.exists || profile.data()?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Ce compte n’est pas un marchand Market-Cash actif.');
  }
  await ensureRolePublicId(merchantUid, 'marchand');
  return {
    merchantUid,
    marketCashId: publicId,
    displayName: String(profile.data()?.tradeName || user.data()?.displayName || 'Marchand Market-Cash'),
    legalName: String(profile.data()?.legalName || user.data()?.displayName || ''),
  };
}

export const ensureLocalMarketCashCardV2 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const card = await ensureLocalCardV2(uid);
  return { ok: true, cardId: card.cardId, cardIdentifier: card.cardIdentifier };
});

export const getMyLocalMarketCashCardsV2 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const card = await ensureLocalCardV2(uid);
  const raw = String(card.cardNumber || '').replace(/\D/g, '');
  return {
    cards: [{
      cardId: card.cardId,
      cardIdentifier: card.cardIdentifier,
      cardHolder: card.cardHolder,
      maskedNumber: raw ? `•••• •••• •••• ${raw.slice(-4)}` : 'Carte locale Market-Cash',
      status: card.status,
      qrData: card.qrData,
      balances: await localBalances(card.cardId),
    }],
  };
});

export const revealLocalMarketCashCardBalance = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const user = await requireClient(uid);
  requirePin(user, request.data?.pin, 'Code secret Market-Cash incorrect.');
  const card = await ensureLocalCardV2(uid);
  return { ok: true, cardId: card.cardId, cardIdentifier: card.cardIdentifier, balances: await localBalances(card.cardId), revealedAt: Date.now() };
});

export const merchantPaymentFromLocalCardV2 = onCall({ region: REGION }, async request => {
  const payerUid = requireAuth(request);
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'localcardpay', payerUid);
  const payer = await requireClient(payerUid);
  if (payer.data()?.kycStatus !== 'approved') throw new HttpsError('failed-precondition', 'Vérification KYC requise.');
  requirePin(payer, request.data?.pin);
  const localCard = await ensureLocalCardV2(payerUid);
  const cardId = String(request.data?.cardId || localCard.cardId).trim();
  if (cardId !== localCard.cardId) throw new HttpsError('permission-denied', 'Carte locale obligatoire.');
  const merchant = await resolveMerchant(request.data?.marketCashId, payerUid);
  await ensureWallet(merchant.merchantUid, currency, 'business');

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId, merchantName: merchant.displayName };
    const cardRef = db.doc(`local_cards/${cardId}`);
    const cardBalanceRef = db.doc(`card_wallet_accounts/${cardAccountId(cardId, currency)}`);
    const merchantWalletRef = db.doc(`wallet_accounts/${walletId(merchant.merchantUid, currency)}`);
    const [cardSnap, cardBalanceSnap, merchantWalletSnap] = await Promise.all([tx.get(cardRef), tx.get(cardBalanceRef), tx.get(merchantWalletRef)]);
    if (!cardSnap.exists || cardSnap.data()?.userId !== payerUid || cardSnap.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'Carte locale indisponible.');
    const cardBalance = cardBalanceSnap.data();
    const merchantWallet = merchantWalletSnap.data();
    if (!cardBalance || cardBalance.status !== 'active') throw new HttpsError('failed-precondition', 'Solde de carte indisponible.');
    if (!merchantWallet || merchantWallet.status !== 'active') throw new HttpsError('failed-precondition', 'Compte marchand indisponible.');
    if (Number(cardBalance.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde de la carte locale insuffisant.');
    const now = Date.now();
    const reference = `MC-PAY-${now}`;
    tx.update(cardBalanceRef, { availableBalance: Number(cardBalance.availableBalance || 0) - amount, ledgerBalance: Number(cardBalance.ledgerBalance || 0) - amount, updatedAt: now });
    tx.update(merchantWalletRef, { availableBalance: Number(merchantWallet.availableBalance || 0) + amount, ledgerBalance: Number(merchantWallet.ledgerBalance || 0) + amount, updatedAt: now });
    tx.set(txRef, { id: txId, reference, type: 'merchant_payment', status: 'settled', currency, amount, senderId: payerUid, recipientId: merchant.merchantUid, merchantId: merchant.merchantUid, merchantMarketCashId: merchant.marketCashId, merchantName: merchant.displayName, cardId, userIds: [payerUid, merchant.merchantUid], sourceCardWalletId: cardBalanceRef.id, destinationWalletId: merchantWalletRef.id, rail: 'market_cash_local_card_merchant', createdAt: now, updatedAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, cardWalletId: cardBalanceRef.id, userId: payerUid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: merchantWalletRef.id, userId: merchant.merchantUid, direction: 'credit', amount, currency, createdAt: now });
    tx.set(db.collection('notifications').doc(), { userId: merchant.merchantUid, title: 'Paiement reçu', message: `Vous avez reçu ${amount} ${currency} par carte locale Market-Cash.`, type: 'success', category: 'general', read: false, transactionId: txId, createdAt: now });
    tx.set(db.collection('notifications').doc(), { userId: payerUid, title: 'Paiement confirmé', message: `Paiement de ${amount} ${currency} effectué avec votre carte locale Market-Cash.`, type: 'success', category: 'general', read: false, transactionId: txId, createdAt: now });
    tx.set(db.collection('audit_events').doc(), { actorId: payerUid, action: 'LOCAL_CARD_MERCHANT_PAYMENT_V2', resourceId: txId, merchantId: merchant.merchantUid, merchantPublicId: merchant.marketCashId, cardId, amount, currency, result: 'success', createdAt: now });
    return { ok: true, reference, transactionId: txId, merchantName: merchant.displayName };
  });
});
