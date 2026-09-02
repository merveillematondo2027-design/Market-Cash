import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (process.env.CONFIRM_MARKET_CASH_RESET !== 'YES') {
  console.error('ABORTED: set CONFIRM_MARKET_CASH_RESET=YES to run this destructive reset.');
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const ADMIN_EMAIL = 'merveillematondo2027@gmail.com';
const now = Date.now();

async function deleteCollection(name, batchSize = 250) {
  let total = 0;
  while (true) {
    const snap = await db.collection(name).limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    console.log(`[RESET] ${name}: ${total} deleted`);
  }
}

console.log('[RESET] Normalizing users...');
const users = await db.collection('users').get();
for (const d of users.docs) {
  const data = d.data();
  const isAdmin = String(data.email || '').toLowerCase() === ADMIN_EMAIL;
  await d.ref.set({
    role: isAdmin ? 'admin_general' : 'client',
    kycStatus: 'not_started',
    agencyId: null,
    agencyName: null,
    updatedAt: now,
  }, { merge: true });
}

// Financial and operational state is reset to a clean MVP baseline.
for (const name of [
  'wallet_accounts','card_wallet_accounts','wallet_transactions','ledger_entries','audit_events',
  'wallet_public_ids','wallet_recharge_numbers','agent_profiles','account_upgrade_requests','kyc_requests',
  'cards','card_purchase_requests','physical_card_requests','notifications'
]) await deleteCollection(name);

console.log(`[RESET] DONE. ${users.size} Authentication-linked user profiles preserved; only ${ADMIN_EMAIL} remains admin_general. All other existing profiles are client with zero/recreated financial state.`);
