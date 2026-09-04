import { createHash, randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
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

async function activeClient(uid: string) {
  const user = await db.doc(`users/${uid}`).get();
  if (!user.exists) throw new HttpsError('not-found', 'Compte introuvable.');
  const data = user.data()!;
  if (data.role !== 'client') throw new HttpsError('permission-denied', 'Compte client requis.');
  if (['blocked', 'suspended'].includes(String(data.accountStatus || ''))) throw new HttpsError('failed-precondition', 'Compte indisponible.');
  return user;
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
 * in the product UI. This is not the scheme CVV of Visa Standard/Gold cards.
 * The document is server-only (Firestore rules deny all client access).
 */
export async function ensureMarketCashLocalCvv(uid: string) {
  const user = await activeClient(uid);
  if (user.data()?.kycStatus !== 'approved') throw new HttpsError('failed-precondition', 'Vérification KYC requise.');

  const ref = securityRefForUid(uid);
  const snap = await ref.get();
  const existing = String(snap.data()?.localTransactionCvv || '');
  if (/^\d{3}$/.test(existing)) {
    return {
      cvv: existing,
      version: Number(snap.data()?.cvvVersion || 1),
      updatedAt: Number(snap.data()?.cvvUpdatedAt || snap.data()?.createdAt || Date.now()),
    };
  }

  const cvv = generateCvv();
  const now = Date.now();
  await ref.set({
    userId: uid,
    localTransactionCvv: cvv,
    localTransactionCvvHash: sha256(cvv),
    cvvVersion: 1,
    cvvUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
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

export const verifyApplicationSecret = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  await verifyApplicationPinForUser(uid, request.data?.pin);
  await db.collection('audit_events').add({ actorId: uid, action: 'APPLICATION_SECRET_VERIFIED', result: 'success', createdAt: Date.now() });
  return { ok: true };
});

export const getClientSecurityOverview = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const user = await activeClient(uid);
  const security = await securityRefForUid(uid).get();
  return {
    hasApplicationPin: Boolean(user.data()?.pinHash),
    hasLocalCvv: /^\d{3}$/.test(String(security.data()?.localTransactionCvv || '')),
    cvvVersion: Number(security.data()?.cvvVersion || 0),
    cvvUpdatedAt: Number(security.data()?.cvvUpdatedAt || 0),
  };
});

export const revealLocalCardSecureData = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  await verifyApplicationPinForUser(uid, request.data?.pin);
  const { cvv } = await ensureMarketCashLocalCvv(uid);
  const card = await db.doc(`local_cards/${localCardIdForUid(uid)}`).get();
  if (!card.exists || card.data()?.userId !== uid || card.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'Carte locale indisponible.');
  const data = card.data()!;
  await db.collection('audit_events').add({ actorId: uid, action: 'LOCAL_CARD_DETAILS_REVEALED', cardId: card.id, result: 'success', createdAt: Date.now() });
  return {
    cardId: card.id,
    cardNumber: String(data.cardNumber || ''),
    cardHolder: String(data.cardHolder || data.cardHolderName || ''),
    expiryStart: String(data.expiryStart || ''),
    expiryEnd: String(data.expiryEnd || data.expiry || ''),
    cvv,
  };
});

export const rotateMarketCashLocalCvv = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  await verifyApplicationPinForUser(uid, request.data?.pin);
  await ensureMarketCashLocalCvv(uid);
  const ref = securityRefForUid(uid);
  const snap = await ref.get();
  const previous = String(snap.data()?.localTransactionCvv || '');
  const next = generateCvv(previous);
  const version = Number(snap.data()?.cvvVersion || 1) + 1;
  const now = Date.now();
  await ref.set({
    localTransactionCvv: next,
    localTransactionCvvHash: sha256(next),
    cvvVersion: version,
    cvvUpdatedAt: now,
    updatedAt: now,
  }, { merge: true });
  await db.doc(`local_cards/${localCardIdForUid(uid)}`).set({ cvvVersion: version, cvvUpdatedAt: now, updatedAt: now }, { merge: true });
  await db.collection('audit_events').add({ actorId: uid, action: 'LOCAL_CVV_ROTATED', result: 'success', cvvVersion: version, createdAt: now });
  await db.collection('notifications').add({
    userId: uid,
    title: 'Nouveau CVV Market-Cash',
    message: 'Votre CVV Market-Cash a été renouvelé. L’ancien code n’est plus valide.',
    type: 'success',
    category: 'security',
    read: false,
    createdAt: now,
  });
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
