import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
const DIRECT_FEATURES = ['payments.create', 'transactions.read', 'balance.read'] as const;
const PROVIDER_FEATURES = [...DIRECT_FEATURES, 'developers.create', 'developers.read'] as const;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const developerAccountId = (uid: string) => `DEV-${sha256(`developer:${uid}`).slice(0, 10).toUpperCase()}`;
const normalize = (value: unknown) => String(value || '').trim();

function requireAuth(request: any) {
  const uid = String(request.auth?.uid || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  return uid;
}

export const updateDeveloperAppSettings = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const appId = normalize(request.data?.appId).toUpperCase();
  if (!appId) throw new HttpsError('invalid-argument', 'Application requise.');

  const appRef = db.doc(`developer_apps/${appId}`);
  const appSnap = await appRef.get();
  if (!appSnap.exists) throw new HttpsError('not-found', 'Application introuvable.');
  const app = appSnap.data() || {};
  if (String(app.userId || '') !== uid || String(app.developerId || '') !== developerAccountId(uid)) {
    throw new HttpsError('permission-denied', 'Cette application ne vous appartient pas.');
  }

  const allowedFeatures = app.businessType === 'api_provider' ? PROVIDER_FEATURES : DIRECT_FEATURES;
  const requestedFeatures = Array.isArray(request.data?.enabledFeatures) ? request.data.enabledFeatures.map(normalize) : [];
  const enabledFeatures = allowedFeatures.filter(feature => requestedFeatures.includes(feature));
  const requestedCurrencies = Array.isArray(request.data?.allowedCurrencies) ? request.data.allowedCurrencies.map((v: unknown) => normalize(v).toUpperCase()) : [];
  const allowedCurrencies = CURRENCIES.filter(currency => requestedCurrencies.includes(currency));
  const apiEnabled = request.data?.apiEnabled !== false;

  if (apiEnabled && !enabledFeatures.length) {
    throw new HttpsError('invalid-argument', 'Activez au moins une fonctionnalité API.');
  }
  if (apiEnabled && !allowedCurrencies.length) {
    throw new HttpsError('invalid-argument', 'Activez au moins une devise.');
  }

  const now = Date.now();
  await appRef.set({
    status: apiEnabled ? 'active' : 'disabled',
    apiEnabled,
    enabledFeatures,
    allowedCurrencies,
    updatedAt: now,
  }, { merge: true });

  await db.collection('audit_events').add({
    actorId: uid,
    actorType: 'developer',
    action: 'DEVELOPER_APP_SETTINGS_UPDATED',
    resourceId: appId,
    apiEnabled,
    enabledFeatures,
    allowedCurrencies,
    createdAt: now,
  });

  return { ok: true, appId, apiEnabled, status: apiEnabled ? 'active' : 'disabled', enabledFeatures, allowedCurrencies };
});
