import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { ensureLocalCardPair } from './localCardPair';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const ELIGIBLE_ROLES = new Set(['client', 'agent', 'marchand', 'developer', 'api_partner', 'creator']);
const BLOCKED_STATUSES = new Set(['blocked', 'suspended', 'banned', 'deleted']);

async function requireAdmin(uid: string) {
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists || snap.data()?.role !== 'admin_general') {
    throw new HttpsError('permission-denied', 'Administrateur général requis.');
  }
}

function isEligible(data: FirebaseFirestore.DocumentData) {
  const role = String(data.role || 'client');
  const status = String(data.accountStatus || 'active');
  return ELIGIBLE_ROLES.has(role) && !BLOCKED_STATUSES.has(status);
}

export const adminProvisionLocalCardPairsV3 = onCall({ region: REGION, timeoutSeconds: 540 }, async request => {
  const adminUid = String(request.auth?.uid || '');
  await requireAdmin(adminUid);

  const users = await db.collection('users').get();
  const eligible = users.docs.filter(doc => isEligible(doc.data()));
  let provisionedUsers = 0;
  let cardsReady = 0;
  const errors: Array<{ uid: string; message: string }> = [];

  for (let index = 0; index < eligible.length; index += 5) {
    const batch = eligible.slice(index, index + 5);
    const results = await Promise.allSettled(batch.map(async userDoc => {
      const cards = await ensureLocalCardPair(userDoc.id);
      return { uid: userDoc.id, count: cards.length };
    }));

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        provisionedUsers += 1;
        cardsReady += result.value.count;
      } else {
        errors.push({
          uid: batch[i].id,
          message: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
  }

  await db.collection('audit_events').add({
    actorId: adminUid,
    action: 'ADMIN_LOCAL_CARD_PAIR_BULK_PROVISION',
    scannedUsers: users.size,
    eligibleUsers: eligible.length,
    provisionedUsers,
    cardsReady,
    errorCount: errors.length,
    result: errors.length ? 'partial' : 'success',
    createdAt: Date.now(),
  });

  return {
    ok: errors.length === 0,
    scannedUsers: users.size,
    eligibleUsers: eligible.length,
    provisionedUsers,
    cardsReady,
    errors: errors.slice(0, 20),
  };
});

export const provisionLocalCardsOnUserCreatedV3 = onDocumentCreated({
  region: REGION,
  document: 'users/{uid}',
  retry: true,
}, async event => {
  const snap = event.data;
  if (!snap || !isEligible(snap.data())) return;
  await ensureLocalCardPair(event.params.uid);
});
