import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { ensureLocalCardPair } from './localCardPair';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const ADMIN_EMAIL = 'merveillematondo2027@gmail.com';
const ELIGIBLE_ROLES = new Set([
  'client',
  'agent',
  'marchand',
  'developer',
  'api_partner',
  'creator',
  'agent_administratif',
  'admin_general',
  'chef_agence',
  'designer_graphique',
  'livreur',
]);
const BLOCKED_STATUSES = new Set(['blocked', 'suspended', 'banned', 'deleted']);

async function requireAdmin(uid: string, email: string) {
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  if (email.trim().toLowerCase() === ADMIN_EMAIL) return;
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

async function listAllAuthUserIds() {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    page.users.forEach(user => { if (!user.disabled) ids.add(user.uid); });
    pageToken = page.pageToken;
  } while (pageToken);
  return ids;
}

export const adminProvisionLocalCardPairsV3 = onCall({ region: REGION, timeoutSeconds: 540 }, async request => {
  const adminUid = String(request.auth?.uid || '');
  const adminEmail = String(request.auth?.token?.email || '');
  await requireAdmin(adminUid, adminEmail);

  const users = await db.collection('users').get();
  const firestoreUsers = new Map(users.docs.map(doc => [doc.id, doc.data()]));
  const authUserIds = await listAllAuthUserIds();
  const accountIds = new Set<string>([...authUserIds, ...firestoreUsers.keys()]);
  const eligibleIds = [...accountIds].filter(uid => {
    const profile = firestoreUsers.get(uid);
    return profile ? isEligible(profile) : true;
  });

  let provisionedUsers = 0;
  let cardsReady = 0;
  const errors: Array<{ uid: string; message: string }> = [];

  for (let index = 0; index < eligibleIds.length; index += 5) {
    const batch = eligibleIds.slice(index, index + 5);
    const results = await Promise.allSettled(batch.map(async uid => {
      const cards = await ensureLocalCardPair(uid);
      return { uid, count: cards.length };
    }));

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        provisionedUsers += 1;
        cardsReady += result.value.count;
      } else {
        errors.push({
          uid: batch[i],
          message: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
  }

  await db.collection('audit_events').add({
    actorId: adminUid,
    action: 'ADMIN_LOCAL_CARD_PAIR_BULK_PROVISION',
    scannedUsers: accountIds.size,
    firestoreUsers: users.size,
    authUsers: authUserIds.size,
    eligibleUsers: eligibleIds.length,
    provisionedUsers,
    cardsReady,
    errorCount: errors.length,
    result: errors.length ? 'partial' : 'success',
    createdAt: Date.now(),
  });

  return {
    ok: errors.length === 0,
    scannedUsers: accountIds.size,
    eligibleUsers: eligibleIds.length,
    provisionedUsers,
    cardsReady,
    errors: errors.slice(0, 20),
  };
});

export const provisionLocalCardsOnUserCreatedV3 = onDocumentCreated({
  region: REGION,
  document: 'users/{uid}',
}, async event => {
  const snap = event.data;
  if (!snap || !isEligible(snap.data())) return;
  await ensureLocalCardPair(event.params.uid);
});

// Every active Market-Cash account must always have one USD and one CDF local card.
