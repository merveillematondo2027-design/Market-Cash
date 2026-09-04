import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { ensureRolePublicId, normalizeMerchantPublicId } from './identifiers';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';

export const lookupMerchantRecipientV2 = onCall({ region: REGION }, async request => {
  const payerUid = String(request.auth?.uid || '');
  if (!payerUid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const publicId = normalizeMerchantPublicId(request.data?.marketCashId);
  const mapping = await db.doc(`wallet_public_ids/${publicId}`).get();
  if (!mapping.exists || mapping.data()?.role !== 'marchand') throw new HttpsError('not-found', 'Marchand introuvable.');
  const merchantUid = String(mapping.data()?.userId || '');
  if (!merchantUid || merchantUid === payerUid) throw new HttpsError('failed-precondition', 'Marchand invalide.');
  const [user, profile] = await Promise.all([db.doc(`users/${merchantUid}`).get(), db.doc(`merchant_profiles/${merchantUid}`).get()]);
  if (!user.exists || user.data()?.role !== 'marchand' || !profile.exists || profile.data()?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Ce compte n’est pas un marchand Market-Cash actif.');
  }
  const identity = await ensureRolePublicId(merchantUid, 'marchand');
  return {
    userId: merchantUid,
    marketCashId: identity.publicId,
    displayName: String(profile.data()?.tradeName || user.data()?.displayName || 'Marchand Market-Cash'),
    legalName: String(profile.data()?.legalName || user.data()?.displayName || ''),
  };
});
