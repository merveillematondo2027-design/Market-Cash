import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { ensureRolePublicId } from './identifiers';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';

export const adminEnsureUserDefaultIdentifier = onCall({ region: REGION }, async request => {
  const adminUid = String(request.auth?.uid || '');
  if (!adminUid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const admin = await db.doc(`users/${adminUid}`).get();
  if (!admin.exists || !['admin_general', 'agent_administratif'].includes(String(admin.data()?.role || ''))) {
    throw new HttpsError('permission-denied', 'Accès administratif requis.');
  }
  const userId = String(request.data?.userId || '').trim();
  if (!userId) throw new HttpsError('invalid-argument', 'Utilisateur requis.');
  const user = await db.doc(`users/${userId}`).get();
  if (!user.exists) throw new HttpsError('not-found', 'Utilisateur introuvable.');
  const role = String(user.data()?.role || '');
  if (!['client', 'agent', 'marchand'].includes(role)) throw new HttpsError('failed-precondition', 'Type de compte non pris en charge.');
  return { ok: true, ...(await ensureRolePublicId(userId, role)) };
});
