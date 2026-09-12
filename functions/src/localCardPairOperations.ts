import { createHash, randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { cardAccountId, ensureLocalCardPair, getOwnedLocalCard, listLocalCardSummaries, type LocalCardCurrency } from './localCardPair';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const walletId = (uid: string, currency: LocalCardCurrency) => `wallet_${currency.toLowerCase()}_${uid}`;
const requireAuth = (request: any) => { const uid = String(request.auth?.uid || ''); if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.'); return uid; };

function publicProvisioningError(error: unknown, uid: string) {
  if (error instanceof HttpsError) return error;
  console.error('[LOCAL_CARD_PAIR_V3_PROVISION_ERROR]', { uid, error });
  return new HttpsError('internal', 'Impossible de préparer vos cartes locales pour le moment. Réessayez dans quelques secondes.');
}

async function verifyPin(uid: string, raw: unknown) {
  const pin = String(raw || '').replace(/\D/g, '');
  if (!/^\d{4,10}$/.test(pin)) throw new HttpsError('invalid-argument', 'Code secret invalide.');
  const user = await db.doc(`users/${uid}`).get();
  if (!user.exists || String(user.data()?.pinHash || '') !== sha256(pin)) throw new HttpsError('permission-denied', 'Code secret incorrect.');
}


async function verifyBiometricGrant(uid:string){
  const ref=db.doc(`biometric_grants/${uid}`);const snap=await ref.get();const data=snap.data();
  if(!snap.exists||Number(data?.expiresAt||0)<Date.now())throw new HttpsError('permission-denied','Vérification biométrique expirée.');
  await ref.delete();
}

async function ensureSharedCvv(uid: string) {
  const ref = db.doc(`user_security/${uid}`); const snap = await ref.get();
  const existing = String(snap.data()?.localTransactionCvv || '');
  if (/^\d{3}$/.test(existing)) return { cvv: existing, version: Number(snap.data()?.cvvVersion || 1) };
  const cvv = randomInt(100, 1000).toString(); const now = Date.now();
  await ref.set({ userId: uid, localTransactionCvv: cvv, localTransactionCvvHash: sha256(cvv), cvvVersion: 1, cvvUpdatedAt: now, createdAt: snap.data()?.createdAt || now, updatedAt: now }, { merge: true });
  return { cvv, version: 1 };
}

async function requireCvv(uid: string, raw: unknown) {
  const cvv = String(raw || '').replace(/\D/g, '');
  if (!/^\d{3}$/.test(cvv)) throw new HttpsError('invalid-argument', 'CVV invalide.');
  const secured = await ensureSharedCvv(uid);
  if (secured.cvv !== cvv) throw new HttpsError('permission-denied', 'CVV Market-Cash incorrect.');
}

export const ensureLocalCardPairV3 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  try {
    // listLocalCardSummaries performs provisioning itself. Calling ensure twice
    // caused unnecessary transactions and made first-login failures harder to recover from.
    const cards = await listLocalCardSummaries(uid);
    return { ok: true, cards };
  } catch (error) {
    throw publicProvisioningError(error, uid);
  }
});

export const getMyLocalCardPairV3 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  try {
    return { cards: await listLocalCardSummaries(uid) };
  } catch (error) {
    throw publicProvisioningError(error, uid);
  }
});

export const revealLocalCardV3 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request); if(request.data?.biometric===true)await verifyBiometricGrant(uid);else await verifyPin(uid, request.data?.pin);
  const card = await getOwnedLocalCard(uid, String(request.data?.cardId || ''));
  const { cvv } = await ensureSharedCvv(uid);
  await db.collection('audit_events').add({ actorId: uid, action: 'LOCAL_CARD_V3_REVEALED', cardId: card.cardId, currency: card.currency, result: 'success', createdAt: Date.now() });
  return { cardId: card.cardId, currency: card.currency, cardNumber: String(card.cardNumber || ''), cardHolder: String(card.cardHolder || ''), expiryStart: String(card.expiryStart || ''), expiryEnd: String(card.expiryEnd || ''), cvv };
});

export const setLocalCardBlockedV3 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request); const card = await getOwnedLocalCard(uid, String(request.data?.cardId || '')); const blocked = Boolean(request.data?.blocked); const now = Date.now();
  await db.doc(`local_cards/${card.cardId}`).set({ status: blocked ? 'blocked' : 'active', updatedAt: now }, { merge: true });
  await db.collection('audit_events').add({ actorId: uid, action: blocked ? 'LOCAL_CARD_V3_BLOCKED' : 'LOCAL_CARD_V3_UNBLOCKED', cardId: card.cardId, result: 'success', createdAt: now });
  return { ok: true, status: blocked ? 'blocked' : 'active' };
});

export const resetLocalCardSecurityV3 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request); const card = await getOwnedLocalCard(uid, String(request.data?.cardId || '')); const ref = db.doc(`user_security/${uid}`); const snap = await ref.get();
  const previous = String(snap.data()?.localTransactionCvv || ''); let cvv = randomInt(100, 1000).toString(); while (cvv === previous) cvv = randomInt(100, 1000).toString();
  const version = Number(snap.data()?.cvvVersion || 0) + 1; const now = Date.now();
  const batch = db.batch();
  batch.set(ref, { userId: uid, localTransactionCvv: cvv, localTransactionCvvHash: sha256(cvv), cvvVersion: version, cvvUpdatedAt: now, createdAt: snap.data()?.createdAt || now, updatedAt: now }, { merge: true });
  for (const local of await ensureLocalCardPair(uid)) batch.set(db.doc(`local_cards/${local.cardId}`), { cvvVersion: version, cvvUpdatedAt: now, updatedAt: now }, { merge: true });
  batch.set(db.collection('audit_events').doc(), { actorId: uid, action: 'LOCAL_CARD_V3_SECURITY_RESET', cardId: card.cardId, result: 'success', createdAt: now }); await batch.commit();
  return { ok: true, cvv, version };
});

export const fundLocalCardV3 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request); const card = await getOwnedLocalCard(uid, String(request.data?.cardId || '')); if (card.status !== 'active') throw new HttpsError('failed-precondition', 'Carte bloquée.');
  const currency = String(card.currency || '') as LocalCardCurrency; if (!['USD', 'CDF'].includes(currency)) throw new HttpsError('failed-precondition', 'Devise de carte invalide.');
  const amount = Math.round(Number(request.data?.amount || 0) * 100) / 100; if (!Number.isFinite(amount) || amount <= 0) throw new HttpsError('invalid-argument', 'Montant invalide.');
  await requireCvv(uid, request.data?.cvv); const idempotencyKey = String(request.data?.idempotencyKey || `localpair_${uid}_${Date.now()}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120);
  const walletRef = db.doc(`wallet_accounts/${walletId(uid, currency)}`); const cardBalanceRef = db.doc(`card_wallet_accounts/${cardAccountId(card.cardId, currency)}`); const txRef = db.doc(`wallet_transactions/${idempotencyKey}`);
  return db.runTransaction(async tx => {
    const [prior, wallet, balance] = await Promise.all([tx.get(txRef), tx.get(walletRef), tx.get(cardBalanceRef)]); if (prior.exists) return { ok: true, duplicate: true, reference: prior.data()?.reference, transactionId: txRef.id };
    if (!wallet.exists || wallet.data()?.status !== 'active' || Number(wallet.data()?.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde Wallet insuffisant.');
    const now = Date.now(); const reference = `MC-LCARD-${currency}-${now}`; const current = balance.data() || {};
    tx.update(walletRef, { availableBalance: Number(wallet.data()?.availableBalance || 0) - amount, ledgerBalance: Number(wallet.data()?.ledgerBalance || 0) - amount, updatedAt: now });
    tx.set(cardBalanceRef, { id: cardBalanceRef.id, cardId: card.cardId, userId: uid, currency, availableBalance: Number(current.availableBalance || 0) + amount, ledgerBalance: Number(current.ledgerBalance || 0) + amount, heldBalance: Number(current.heldBalance || 0), status: 'active', createdAt: current.createdAt || now, updatedAt: now }, { merge: true });
    tx.set(txRef, { id: txRef.id, reference, type: 'wallet_to_local_card', status: 'settled', currency, amount, userId: uid, userIds: [uid], cardId: card.cardId, sourceWalletId: walletRef.id, destinationCardWalletId: cardBalanceRef.id, rail: 'market_cash_local_card_v3', authenticatedBy: 'local_cvv', createdAt: now, updatedAt: now });
    return { ok: true, reference, transactionId: txRef.id };
  });
});
