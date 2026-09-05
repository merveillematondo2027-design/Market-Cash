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
const cardAccountId = (cardId: string, currency: Currency) => `card_${currency.toLowerCase()}_${cardId}`;
const localCardIdForUid = (uid: string) => `local_${sha256(`local-card:${uid}`).slice(0, 24)}`;
const securityRefForUid = (uid: string) => db.doc(`user_security/${uid}`);

function requireAuth(request: any) {
  const uid = String(request.auth?.uid || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  return uid;
}

function normalizeAppPin(value: any) {
  const pin = String(value || '').replace(/\D/g, '');
  if (!/^\d{4,6}$/.test(pin)) throw new HttpsError('invalid-argument', 'Le code secret de l’application doit contenir 4 à 6 chiffres.');
  return pin;
}

function normalizeCvv(value: any) {
  const cvv = String(value || '').replace(/\D/g, '');
  if (!/^\d{3}$/.test(cvv)) throw new HttpsError('invalid-argument', 'Le CVV doit contenir exactement 3 chiffres.');
  return cvv;
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

async function activeClient(uid: string) {
  const user = await db.doc(`users/${uid}`).get();
  if (!user.exists) throw new HttpsError('not-found', 'Compte introuvable.');
  const data = user.data()!;
  if (data.role !== 'client') throw new HttpsError('permission-denied', 'Compte client requis.');
  if (['blocked', 'suspended'].includes(String(data.accountStatus || ''))) throw new HttpsError('failed-precondition', 'Compte indisponible.');
  return user;
}

async function activeAgent(uid: string) {
  const [user, profile] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`agent_profiles/${uid}`).get(),
  ]);
  if (!user.exists || user.data()?.role !== 'agent' || !profile.exists || profile.data()?.status !== 'active') {
    throw new HttpsError('permission-denied', 'Compte Agent Market-Cash non autorisé.');
  }
  if (['blocked', 'suspended'].includes(String(user.data()?.accountStatus || ''))) throw new HttpsError('failed-precondition', 'Compte Agent indisponible.');
  return user;
}

async function ensureWallet(uid: string, currency: Currency, accountType: 'client' | 'agent' | 'business') {
  const ref = db.doc(`wallet_accounts/${walletId(uid, currency)}`);
  const snap = await ref.get();
  if (!snap.exists) {
    const now = Date.now();
    await ref.set({ id: ref.id, userId: uid, accountType, currency, availableBalance: 0, ledgerBalance: 0, heldBalance: 0, status: 'active', createdAt: now, updatedAt: now });
  }
  return ref;
}

function oneYearValidity(createdAt?: number) {
  const start = createdAt && Number.isFinite(createdAt) ? new Date(createdAt) : new Date();
  const end = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()));
  const fmt = (date: Date) => `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCFullYear()).slice(-2)}`;
  return { expiryStart: fmt(start), expiryEnd: fmt(end) };
}

async function syncLocalCardValidity(uid: string): Promise<any | null> {
  const ref = db.doc(`local_cards/${localCardIdForUid(uid)}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.userId !== uid || data.program !== 'market_cash_local') throw new HttpsError('failed-precondition', 'Carte locale incohérente.');
  const validity = oneYearValidity(Number(data.createdAt || data.activatedAt || Date.now()));
  if (data.expiryStart !== validity.expiryStart || data.expiryEnd !== validity.expiryEnd) {
    await ref.set({ ...validity, validityMonths: 12, updatedAt: Date.now() }, { merge: true });
  }
  return { ...data, ...validity, cardId: ref.id };
}

export async function verifyApplicationPinForUser(uid: string, rawPin: any) {
  const pin = normalizeAppPin(rawPin);
  const user = await db.doc(`users/${uid}`).get();
  if (!user.exists) throw new HttpsError('not-found', 'Compte introuvable.');
  const expected = String(user.data()?.pinHash || '');
  if (!expected || expected !== sha256(pin)) throw new HttpsError('permission-denied', 'Code secret de l’application incorrect.');
  return user;
}

function generateCvv(previous = '') {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const cvv = randomInt(100, 1000).toString();
    if (cvv !== previous) return cvv;
  }
  return ((Number(previous || 100) + 137) % 900 + 100).toString().slice(-3);
}

/**
 * Market-Cash Local uses an internal three-digit transaction code shown as CVV
 * in the product UI. It is separate from Visa scheme CVV values.
 * user_security is server-only under Firestore rules.
 */
export async function ensureMarketCashLocalCvv(uid: string) {
  await activeClient(uid);
  const ref = securityRefForUid(uid);
  const snap = await ref.get();
  const existing = String(snap.data()?.localTransactionCvv || '');
  if (/^\d{3}$/.test(existing)) return { cvv: existing, version: Number(snap.data()?.cvvVersion || 1), updatedAt: Number(snap.data()?.cvvUpdatedAt || snap.data()?.createdAt || Date.now()) };
  const cvv = generateCvv();
  const now = Date.now();
  await ref.set({ userId: uid, localTransactionCvv: cvv, localTransactionCvvHash: sha256(cvv), cvvVersion: 1, cvvUpdatedAt: now, createdAt: now, updatedAt: now }, { merge: true });
  return { cvv, version: 1, updatedAt: now };
}

export async function requireMarketCashTransactionCvv(uid: string, rawCvv: any) {
  const cvv = normalizeCvv(rawCvv);
  const secured = await ensureMarketCashLocalCvv(uid);
  const snap = await securityRefForUid(uid).get();
  const expectedHash = String(snap.data()?.localTransactionCvvHash || sha256(secured.cvv));
  if (sha256(cvv) !== expectedHash) throw new HttpsError('permission-denied', 'CVV Market-Cash incorrect.');
  return true;
}

async function getOwnedLocalCard(uid: string) {
  const card = await syncLocalCardValidity(uid);
  if (!card || card.userId !== uid || card.status !== 'active') throw new HttpsError('failed-precondition', 'Carte locale indisponible.');
  return card;
}

async function resolveMerchant(value: any, payerUid: string) {
  const marketCashId = String(value || '').trim().toUpperCase();
  if (!/^MCW-[A-F0-9]{10}$/.test(marketCashId)) throw new HttpsError('invalid-argument', 'ID marchand invalide.');
  const mapping = await db.doc(`wallet_public_ids/${marketCashId}`).get();
  if (!mapping.exists) throw new HttpsError('not-found', 'Marchand introuvable.');
  const merchantUid = String(mapping.data()?.userId || '');
  if (!merchantUid || merchantUid === payerUid) throw new HttpsError('failed-precondition', 'Marchand invalide.');
  const [user, profile] = await Promise.all([db.doc(`users/${merchantUid}`).get(), db.doc(`merchant_profiles/${merchantUid}`).get()]);
  if (!user.exists || user.data()?.role !== 'marchand' || !profile.exists || profile.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'Ce compte n’est pas un marchand Market-Cash actif.');
  return { merchantUid, marketCashId, displayName: String(profile.data()?.tradeName || user.data()?.displayName || 'Marchand Market-Cash'), legalName: String(profile.data()?.legalName || '') };
}

async function resolveLocalCard(reference: any) {
  const raw = String(reference || '').trim();
  const digits = raw.replace(/\D/g, '');
  let snap: FirebaseFirestore.DocumentSnapshot | null = null;
  if (/^\d{12,19}$/.test(digits)) {
    const found = await db.collection('local_cards').where('cardNumber', '==', digits).limit(1).get();
    if (!found.empty) snap = found.docs[0];
  }
  if (!snap) {
    const identifier = raw.replace(/^MARKET-CASH-CARD:/i, '').toUpperCase();
    const found = await db.collection('local_cards').where('cardIdentifier', '==', identifier).limit(1).get();
    if (!found.empty) snap = found.docs[0];
  }
  if (!snap?.exists) throw new HttpsError('not-found', 'Carte locale Market-Cash introuvable.');
  const card = snap.data()!;
  if (card.program !== 'market_cash_local' || card.status !== 'active') throw new HttpsError('failed-precondition', 'Carte locale indisponible.');
  return { snap, card, clientUid: String(card.userId || '') };
}

export const verifyApplicationSecret = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  await verifyApplicationPinForUser(uid, request.data?.pin);
  await db.collection('audit_events').add({ actorId: uid, action: 'APPLICATION_SECRET_VERIFIED', result: 'success', createdAt: Date.now() });
  return { ok: true };
});

export const syncLocalCardSecurityProfile = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  await activeClient(uid);
  const card = await syncLocalCardValidity(uid);
  if (!card) throw new HttpsError('failed-precondition', 'Carte locale non créée.');
  const secured = await ensureMarketCashLocalCvv(uid);
  await db.doc(`local_cards/${card.cardId}`).set({ cvvVersion: secured.version, cvvUpdatedAt: secured.updatedAt, validityMonths: 12, updatedAt: Date.now() }, { merge: true });
  return { ok: true, cardId: card.cardId, expiryStart: card.expiryStart, expiryEnd: card.expiryEnd, cvvVersion: secured.version };
});

export const getClientSecurityOverview = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const user = await activeClient(uid);
  const security = await securityRefForUid(uid).get();
  return { hasApplicationPin: Boolean(user.data()?.pinHash), hasLocalCvv: /^\d{3}$/.test(String(security.data()?.localTransactionCvv || '')), cvvVersion: Number(security.data()?.cvvVersion || 0), cvvUpdatedAt: Number(security.data()?.cvvUpdatedAt || 0) };
});

export const revealLocalCardSecureData = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  await verifyApplicationPinForUser(uid, request.data?.pin);
  const { cvv } = await ensureMarketCashLocalCvv(uid);
  const card = await getOwnedLocalCard(uid);
  await db.collection('audit_events').add({ actorId: uid, action: 'LOCAL_CARD_DETAILS_REVEALED', cardId: card.cardId, result: 'success', createdAt: Date.now() });
  return { cardId: card.cardId, cardNumber: String(card.cardNumber || ''), cardHolder: String(card.cardHolder || card.cardHolderName || ''), expiryStart: String(card.expiryStart || ''), expiryEnd: String(card.expiryEnd || ''), cvv };
});

export const rotateMarketCashLocalCvv = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  await verifyApplicationPinForUser(uid, request.data?.pin);
  await getOwnedLocalCard(uid);
  await ensureMarketCashLocalCvv(uid);
  const ref = securityRefForUid(uid);
  const snap = await ref.get();
  const next = generateCvv(String(snap.data()?.localTransactionCvv || ''));
  const version = Number(snap.data()?.cvvVersion || 1) + 1;
  const now = Date.now();
  await ref.set({ localTransactionCvv: next, localTransactionCvvHash: sha256(next), cvvVersion: version, cvvUpdatedAt: now, updatedAt: now }, { merge: true });
  await db.doc(`local_cards/${localCardIdForUid(uid)}`).set({ cvvVersion: version, cvvUpdatedAt: now, updatedAt: now }, { merge: true });
  await db.collection('audit_events').add({ actorId: uid, action: 'LOCAL_CVV_ROTATED', result: 'success', cvvVersion: version, createdAt: now });
  await db.collection('notifications').add({ userId: uid, title: 'Nouveau CVV Market-Cash', message: 'Votre CVV Market-Cash a été renouvelé. L’ancien code n’est plus valide.', type: 'success', category: 'security', read: false, createdAt: now });
  return { ok: true, cvv: next, version, updatedAt: now };
});

export const changeApplicationPin = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  await verifyApplicationPinForUser(uid, request.data?.currentPin);
  const nextPin = normalizeAppPin(request.data?.newPin);
  const userRef = db.doc(`users/${uid}`);
  const user = await userRef.get();
  if (String(user.data()?.pinHash || '') === sha256(nextPin)) throw new HttpsError('failed-precondition', 'Choisissez un nouveau code secret différent de l’ancien.');
  const now = Date.now();
  await userRef.set({ pinHash: sha256(nextPin), pinChangedAt: now, updatedAt: now }, { merge: true });
  await db.collection('audit_events').add({ actorId: uid, action: 'APPLICATION_PIN_CHANGED', result: 'success', createdAt: now });
  await db.collection('notifications').add({ userId: uid, title: 'Code secret modifié', message: 'Le code secret de votre application Market-Cash a été modifié.', type: 'success', category: 'security', read: false, createdAt: now });
  return { ok: true, pinChangedAt: now };
});

export const walletToLocalCardWithCvv = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'securecardtopup', uid);
  await activeClient(uid);
  await requireMarketCashTransactionCvv(uid, request.data?.cvv);
  const card = await getOwnedLocalCard(uid);
  const requestedCardId = String(request.data?.cardId || card.cardId);
  if (requestedCardId !== card.cardId) throw new HttpsError('permission-denied', 'Carte locale non autorisée.');
  await ensureWallet(uid, currency, 'client');

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId };
    const walletRef = db.doc(`wallet_accounts/${walletId(uid, currency)}`);
    const cardBalanceRef = db.doc(`card_wallet_accounts/${cardAccountId(card.cardId, currency)}`);
    const [walletSnap, cardBalanceSnap] = await Promise.all([tx.get(walletRef), tx.get(cardBalanceRef)]);
    const wallet = walletSnap.data();
    if (!wallet || wallet.status !== 'active' || Number(wallet.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde portefeuille insuffisant.');
    const cardBalance = Number(cardBalanceSnap.data()?.availableBalance || 0);
    const cardLedger = Number(cardBalanceSnap.data()?.ledgerBalance || cardBalance);
    const now = Date.now();
    const reference = `MC-LCARD-${now}`;
    tx.update(walletRef, { availableBalance: Number(wallet.availableBalance || 0) - amount, ledgerBalance: Number(wallet.ledgerBalance || 0) - amount, updatedAt: now });
    tx.set(cardBalanceRef, { id: cardBalanceRef.id, cardId: card.cardId, userId: uid, currency, availableBalance: cardBalance + amount, ledgerBalance: cardLedger + amount, status: 'active', updatedAt: now, createdAt: cardBalanceSnap.data()?.createdAt || now }, { merge: true });
    tx.set(txRef, { id: txId, reference, type: 'wallet_to_local_card', status: 'settled', currency, amount, userId: uid, userIds: [uid], cardId: card.cardId, sourceWalletId: walletRef.id, destinationCardWalletId: cardBalanceRef.id, rail: 'market_cash_local_card', authenticatedBy: 'local_cvv', createdAt: now, updatedAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: walletRef.id, userId: uid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, cardWalletId: cardBalanceRef.id, userId: uid, direction: 'credit', amount, currency, createdAt: now });
    return { ok: true, reference, transactionId: txId };
  });
});

export const marketCashTransferWithCvv = onCall({ region: REGION }, async request => {
  const senderUid = requireAuth(request);
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const marketCashId = String(request.data?.marketCashId || '').trim().toUpperCase();
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'securetransfer', senderUid);
  await activeClient(senderUid);
  await requireMarketCashTransactionCvv(senderUid, request.data?.cvv);
  const mapping = await db.doc(`wallet_public_ids/${marketCashId}`).get();
  if (!mapping.exists) throw new HttpsError('not-found', 'Bénéficiaire introuvable.');
  const recipientUid = String(mapping.data()?.userId || '');
  if (!recipientUid || recipientUid === senderUid) throw new HttpsError('failed-precondition', 'Bénéficiaire invalide.');
  await Promise.all([ensureWallet(senderUid, currency, 'client'), ensureWallet(recipientUid, currency, 'client')]);

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId };
    const senderWalletRef = db.doc(`wallet_accounts/${walletId(senderUid, currency)}`);
    const recipientWalletRef = db.doc(`wallet_accounts/${walletId(recipientUid, currency)}`);
    const [senderSnap, recipientSnap] = await Promise.all([tx.get(senderWalletRef), tx.get(recipientWalletRef)]);
    const sender = senderSnap.data();
    const recipient = recipientSnap.data();
    if (!sender || !recipient || sender.status !== 'active' || recipient.status !== 'active') throw new HttpsError('failed-precondition', 'Portefeuille indisponible.');
    if (Number(sender.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde insuffisant.');
    const now = Date.now();
    const reference = `MC-TRF-${now}`;
    tx.update(senderWalletRef, { availableBalance: Number(sender.availableBalance || 0) - amount, ledgerBalance: Number(sender.ledgerBalance || 0) - amount, updatedAt: now });
    tx.update(recipientWalletRef, { availableBalance: Number(recipient.availableBalance || 0) + amount, ledgerBalance: Number(recipient.ledgerBalance || 0) + amount, updatedAt: now });
    tx.set(txRef, { id: txId, reference, type: 'local_transfer', status: 'settled', currency, amount, senderId: senderUid, recipientId: recipientUid, userIds: [senderUid, recipientUid], sourceWalletId: senderWalletRef.id, destinationWalletId: recipientWalletRef.id, rail: 'market_cash_local', authenticatedBy: 'local_cvv', createdAt: now, updatedAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: senderWalletRef.id, userId: senderUid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: recipientWalletRef.id, userId: recipientUid, direction: 'credit', amount, currency, createdAt: now });
    tx.set(db.collection('notifications').doc(), { userId: recipientUid, title: 'Argent reçu', message: `Vous avez reçu ${amount} ${currency} sur votre portefeuille Market-Cash.`, type: 'success', category: 'general', read: false, transactionId: txId, createdAt: now });
    return { ok: true, reference, transactionId: txId };
  });
});

export const merchantPaymentFromLocalCardWithCvv = onCall({ region: REGION }, async request => {
  const payerUid = requireAuth(request);
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'securelocalpay', payerUid);
  await activeClient(payerUid);
  await requireMarketCashTransactionCvv(payerUid, request.data?.cvv);
  const card = await getOwnedLocalCard(payerUid);
  if (String(request.data?.cardId || '') !== card.cardId) throw new HttpsError('permission-denied', 'Carte locale obligatoire.');
  const merchant = await resolveMerchant(request.data?.marketCashId, payerUid);
  await ensureWallet(merchant.merchantUid, currency, 'business');

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId, merchantName: merchant.displayName };
    const cardBalanceRef = db.doc(`card_wallet_accounts/${cardAccountId(card.cardId, currency)}`);
    const merchantWalletRef = db.doc(`wallet_accounts/${walletId(merchant.merchantUid, currency)}`);
    const [cardBalanceSnap, merchantWalletSnap] = await Promise.all([tx.get(cardBalanceRef), tx.get(merchantWalletRef)]);
    const cardBalance = cardBalanceSnap.data();
    const merchantWallet = merchantWalletSnap.data();
    if (!cardBalance || cardBalance.status !== 'active') throw new HttpsError('failed-precondition', 'Solde de carte indisponible.');
    if (!merchantWallet || merchantWallet.status !== 'active') throw new HttpsError('failed-precondition', 'Compte marchand indisponible.');
    if (Number(cardBalance.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde de la carte locale insuffisant.');
    const now = Date.now();
    const reference = `MC-PAY-${now}`;
    tx.update(cardBalanceRef, { availableBalance: Number(cardBalance.availableBalance || 0) - amount, ledgerBalance: Number(cardBalance.ledgerBalance || 0) - amount, updatedAt: now });
    tx.update(merchantWalletRef, { availableBalance: Number(merchantWallet.availableBalance || 0) + amount, ledgerBalance: Number(merchantWallet.ledgerBalance || 0) + amount, updatedAt: now });
    tx.set(txRef, { id: txId, reference, type: 'merchant_payment', status: 'settled', currency, amount, senderId: payerUid, recipientId: merchant.merchantUid, merchantId: merchant.merchantUid, merchantMarketCashId: merchant.marketCashId, merchantName: merchant.displayName, cardId: card.cardId, userIds: [payerUid, merchant.merchantUid], sourceCardWalletId: cardBalanceRef.id, destinationWalletId: merchantWalletRef.id, rail: 'market_cash_local_card_merchant', authenticatedBy: 'local_cvv', createdAt: now, updatedAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, cardWalletId: cardBalanceRef.id, userId: payerUid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: merchantWalletRef.id, userId: merchant.merchantUid, direction: 'credit', amount, currency, createdAt: now });
    tx.set(db.collection('notifications').doc(), { userId: merchant.merchantUid, title: 'Paiement reçu', message: `Vous avez reçu ${amount} ${currency} par carte locale Market-Cash.`, type: 'success', category: 'general', read: false, transactionId: txId, createdAt: now });
    tx.set(db.collection('notifications').doc(), { userId: payerUid, title: 'Paiement confirmé', message: `Paiement de ${amount} ${currency} effectué avec votre carte locale Market-Cash.`, type: 'success', category: 'general', read: false, transactionId: txId, createdAt: now });
    return { ok: true, reference, transactionId: txId, merchantName: merchant.displayName };
  });
});

export const agentLocalCardCashOutWithCvv = onCall({ region: REGION }, async request => {
  const agentUid = requireAuth(request);
  await activeAgent(agentUid);
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'securecashout', agentUid);
  const resolved = await resolveLocalCard(request.data?.cardReference);
  if (!resolved.clientUid || resolved.clientUid === agentUid) throw new HttpsError('failed-precondition', 'Carte client invalide.');
  await activeClient(resolved.clientUid);
  await requireMarketCashTransactionCvv(resolved.clientUid, request.data?.clientCvv);
  await ensureWallet(agentUid, currency, 'agent');

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId, amount, currency };
    const cardBalanceRef = db.doc(`card_wallet_accounts/${cardAccountId(resolved.snap.id, currency)}`);
    const agentWalletRef = db.doc(`wallet_accounts/${walletId(agentUid, currency)}`);
    const [cardBalanceSnap, agentWalletSnap] = await Promise.all([tx.get(cardBalanceRef), tx.get(agentWalletRef)]);
    const cardBalance = cardBalanceSnap.data();
    const agentWallet = agentWalletSnap.data();
    if (!cardBalance || cardBalance.status !== 'active') throw new HttpsError('failed-precondition', 'Solde de carte indisponible.');
    if (!agentWallet || agentWallet.status !== 'active') throw new HttpsError('failed-precondition', 'Float agent indisponible.');
    if (Number(cardBalance.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde de la carte locale insuffisant.');
    const now = Date.now();
    const reference = `MC-RET-${now}`;
    tx.update(cardBalanceRef, { availableBalance: Number(cardBalance.availableBalance || 0) - amount, ledgerBalance: Number(cardBalance.ledgerBalance || 0) - amount, updatedAt: now });
    tx.update(agentWalletRef, { availableBalance: Number(agentWallet.availableBalance || 0) + amount, ledgerBalance: Number(agentWallet.ledgerBalance || 0) + amount, updatedAt: now });
    tx.set(txRef, { id: txId, reference, type: 'cash_out', status: 'settled', currency, amount, agentId: agentUid, clientId: resolved.clientUid, cardId: resolved.snap.id, cardIdentifier: resolved.card.cardIdentifier || resolved.snap.id, userIds: [agentUid, resolved.clientUid], sourceCardWalletId: cardBalanceRef.id, destinationWalletId: agentWalletRef.id, rail: 'agent_terminal_local_card', authenticatedBy: 'local_cvv_on_agent_terminal', createdAt: now, updatedAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, cardWalletId: cardBalanceRef.id, userId: resolved.clientUid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: agentWalletRef.id, userId: agentUid, direction: 'credit', amount, currency, createdAt: now });
    tx.set(db.collection('notifications').doc(), { userId: resolved.clientUid, title: 'Retrait confirmé', message: `Retrait de ${amount} ${currency} effectué depuis votre carte locale Market-Cash auprès d’un Agent.`, type: 'success', category: 'general', read: false, transactionId: txId, createdAt: now });
    return { ok: true, reference, transactionId: txId, amount, currency };
  });
});