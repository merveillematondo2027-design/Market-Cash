import { createHash, randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { ensureRolePublicId, normalizeClientPublicId } from './identifiers';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
type Currency = typeof CURRENCIES[number];
type AccountType = 'client' | 'agent' | 'business';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const walletId = (uid: string, currency: Currency) => `wallet_${currency.toLowerCase()}_${uid}`;
const rechargeNumberForUid = (uid: string) =>
  (BigInt(`0x${sha256(`recharge:${uid}`).slice(0, 15)}`) % 100000000000n).toString().padStart(11, '0');

function requireAuth(request: any) {
  const uid = String(request.auth?.uid || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  return uid;
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

function requirePin(user: FirebaseFirestore.DocumentSnapshot, pin: any) {
  const value = String(pin || '');
  if (!value || user.data()?.pinHash !== sha256(value)) throw new HttpsError('permission-denied', 'Code secret incorrect.');
}

async function roleAndType(uid: string): Promise<{ role: string; accountType: AccountType }> {
  const user = await db.doc(`users/${uid}`).get();
  if (!user.exists) throw new HttpsError('not-found', 'Compte introuvable.');
  const role = String(user.data()?.role || 'client');
  if (role === 'agent') return { role, accountType: 'agent' };
  if (role === 'marchand') return { role, accountType: 'business' };
  return { role: 'client', accountType: 'client' };
}

async function ensureWalletDocsV2(uid: string, forcedType?: AccountType) {
  const resolved = await roleAndType(uid);
  const accountType = forcedType || resolved.accountType;
  const identityRole = accountType === 'agent' ? 'agent' : accountType === 'business' ? 'marchand' : 'client';
  const identity = await ensureRolePublicId(uid, identityRole);
  const rechargeNumber = rechargeNumberForUid(uid);
  const now = Date.now();
  const batch = db.batch();

  for (const currency of CURRENCIES) {
    const ref = db.doc(`wallet_accounts/${walletId(uid, currency)}`);
    const snap = await ref.get();
    const base = {
      id: ref.id,
      userId: uid,
      accountType,
      currency,
      status: 'active',
      rechargeNumber,
      publicId: identity.publicId,
      marketCashId: identity.publicId,
      updatedAt: now,
    };
    if (!snap.exists) {
      batch.set(ref, { ...base, availableBalance: 0, ledgerBalance: 0, heldBalance: 0, createdAt: now });
    } else {
      batch.set(ref, base, { merge: true });
    }
  }

  const rechargeRef = db.doc(`wallet_recharge_numbers/${rechargeNumber}`);
  const recharge = await rechargeRef.get();
  batch.set(rechargeRef, { userId: uid, rechargeNumber, publicId: identity.publicId, updatedAt: now, createdAt: recharge.data()?.createdAt || now }, { merge: true });
  await batch.commit();
  return { rechargeNumber, marketCashId: identity.publicId, publicId: identity.publicId, role: identity.role };
}

async function getWalletSnapshot(uid: string) {
  const wallets: Record<string, any> = {};
  for (const currency of CURRENCIES) {
    wallets[currency] = (await db.doc(`wallet_accounts/${walletId(uid, currency)}`).get()).data() || null;
  }
  return wallets;
}

export const ensureWalletProfileV2 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const identity = await ensureWalletDocsV2(uid);
  return { ok: true, ...identity, isAgent: identity.role === 'agent', wallets: await getWalletSnapshot(uid) };
});

export const getMyWalletsV2 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const identity = await ensureWalletDocsV2(uid);
  return { ...identity, isAgent: identity.role === 'agent', wallets: await getWalletSnapshot(uid) };
});

export const getMyMarketCashIdentityV2 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const identity = await ensureWalletDocsV2(uid);
  return { marketCashId: identity.marketCashId, publicId: identity.publicId, role: identity.role };
});

export const lookupMarketCashRecipientV2 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const publicId = normalizeClientPublicId(request.data?.marketCashId);
  const mapping = await db.doc(`wallet_public_ids/${publicId}`).get();
  if (!mapping.exists || mapping.data()?.role !== 'client') throw new HttpsError('not-found', 'Bénéficiaire Market-Cash introuvable.');
  const userId = String(mapping.data()?.userId || '');
  if (!userId || userId === uid) throw new HttpsError('failed-precondition', 'Bénéficiaire invalide.');
  const profile = await db.doc(`users/${userId}`).get();
  if (!profile.exists || profile.data()?.role !== 'client') throw new HttpsError('not-found', 'Profil bénéficiaire introuvable.');
  await ensureWalletDocsV2(userId, 'client');
  return { userId, marketCashId: publicId, displayName: profile.data()?.displayName || profile.data()?.fullName || 'Utilisateur Market-Cash' };
});

export const marketCashTransferV2 = onCall({ region: REGION }, async request => {
  const senderUid = requireAuth(request);
  const recipientPublicId = normalizeClientPublicId(request.data?.marketCashId);
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'transfer', senderUid);
  await ensureWalletDocsV2(senderUid, 'client');
  const mapping = await db.doc(`wallet_public_ids/${recipientPublicId}`).get();
  if (!mapping.exists || mapping.data()?.role !== 'client') throw new HttpsError('not-found', 'Bénéficiaire introuvable.');
  const recipientUid = String(mapping.data()?.userId || '');
  if (!recipientUid || recipientUid === senderUid) throw new HttpsError('failed-precondition', 'Bénéficiaire invalide.');
  await ensureWalletDocsV2(recipientUid, 'client');

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId };
    const senderUserRef = db.doc(`users/${senderUid}`);
    const senderWalletRef = db.doc(`wallet_accounts/${walletId(senderUid, currency)}`);
    const recipientWalletRef = db.doc(`wallet_accounts/${walletId(recipientUid, currency)}`);
    const [senderUser, senderWallet, recipientWallet] = await Promise.all([tx.get(senderUserRef), tx.get(senderWalletRef), tx.get(recipientWalletRef)]);
    if (!senderUser.exists || senderUser.data()?.role !== 'client') throw new HttpsError('permission-denied', 'Compte client requis.');
    if (!senderWallet.exists || !recipientWallet.exists) throw new HttpsError('failed-precondition', 'Portefeuille non initialisé.');
    requirePin(senderUser, request.data?.pin);
    const sender = senderWallet.data()!;
    const recipient = recipientWallet.data()!;
    if (sender.status !== 'active' || recipient.status !== 'active') throw new HttpsError('failed-precondition', 'Portefeuille indisponible.');
    if (Number(sender.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde insuffisant.');
    const now = Date.now();
    const reference = `MC-TRF-${now}`;
    tx.update(senderWalletRef, { availableBalance: Number(sender.availableBalance || 0) - amount, ledgerBalance: Number(sender.ledgerBalance || 0) - amount, updatedAt: now });
    tx.update(recipientWalletRef, { availableBalance: Number(recipient.availableBalance || 0) + amount, ledgerBalance: Number(recipient.ledgerBalance || 0) + amount, updatedAt: now });
    tx.set(txRef, { id: txId, reference, type: 'local_transfer', status: 'settled', currency, amount, senderId: senderUid, recipientId: recipientUid, recipientPublicId, userIds: [senderUid, recipientUid], sourceWalletId: senderWalletRef.id, destinationWalletId: recipientWalletRef.id, rail: 'market_cash_local', createdAt: now, updatedAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: senderWalletRef.id, userId: senderUid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: recipientWalletRef.id, userId: recipientUid, direction: 'credit', amount, currency, createdAt: now });
    tx.set(db.collection('notifications').doc(), { userId: recipientUid, title: 'Argent reçu', message: `Vous avez reçu ${amount} ${currency} sur votre portefeuille Market-Cash.`, type: 'success', category: 'general', read: false, transactionId: txId, createdAt: now });
    tx.set(db.collection('audit_events').doc(), { actorId: senderUid, action: 'WALLET_TRANSFER_V2', resourceId: txId, result: 'success', recipientId: recipientUid, recipientPublicId, amount, currency, createdAt: now });
    return { ok: true, reference, transactionId: txId };
  });
});
