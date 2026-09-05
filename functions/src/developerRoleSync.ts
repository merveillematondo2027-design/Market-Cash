import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const sha256 = (value:string) => createHash('sha256').update(value).digest('hex');
const developerIdForUid = (uid:string) => `DEV-${sha256(`developer:${uid}`).slice(0,10).toUpperCase()}`;

/**
 * Keeps the public Market-Cash role aligned with the approved Developer account.
 * Older records used role="marchand" for Developer accounts; this upgrades them
 * transparently the next time the Developer Console is opened.
 */
export const syncMyDeveloperRole = onCall({ region: REGION }, async request => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');

  const developerId = developerIdForUid(uid);
  const developerSnap = await db.doc(`developer_accounts/${developerId}`).get();
  if (!developerSnap.exists) return { ok:true, changed:false, role:null };

  const developer = developerSnap.data() || {};
  if (developer.status !== 'active') return { ok:true, changed:false, role:null, status:developer.status || 'pending' };

  const businessType = developer.businessType === 'api_provider' ? 'api_provider' : 'direct_developer';
  const role = businessType === 'api_provider' ? 'api_partner' : 'developer';
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError('not-found', 'Compte utilisateur Market-Cash introuvable.');

  const current = userSnap.data() || {};
  const changed = current.role !== role
    || current.businessAccountType !== businessType
    || current.developerEnabled !== true
    || Boolean(current.apiProviderEnabled) !== (businessType === 'api_provider');

  if (changed) {
    const now = Date.now();
    await userRef.set({
      role,
      businessAccountType: businessType,
      developerEnabled: true,
      apiProviderEnabled: businessType === 'api_provider',
      updatedAt: now,
    }, { merge:true });
    await db.collection('audit_events').add({
      actorId: uid,
      action: 'DEVELOPER_ROLE_SYNCHRONIZED',
      developerId,
      previousRole: current.role || null,
      role,
      businessType,
      result: 'success',
      createdAt: now,
    });
  }

  return { ok:true, changed, role, businessType, developerId };
});
