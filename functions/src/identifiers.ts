import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';

type PublicRole = 'client' | 'agent' | 'marchand';
export type PublicPrefix = 'MCW' | 'MCA' | 'MCM' | 'MCL';

export const CLIENT_PUBLIC_ID_RE = /^MCW-\d{10}[A-Z]$/;
export const AGENT_PUBLIC_ID_RE = /^MCA-\d{10}[A-Z]$/;
export const MERCHANT_PUBLIC_ID_RE = /^MCM-\d{10}[A-Z]$/;
export const LOCAL_CARD_ID_RE = /^MCL-\d{10}[A-Z]$/;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const rolePrefix = (role: PublicRole): Exclude<PublicPrefix, 'MCL'> => role === 'agent' ? 'MCA' : role === 'marchand' ? 'MCM' : 'MCW';

export function normalizeInitial(value: unknown) {
  const text = String(value || '').trim();
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const letter = normalized.match(/[A-Z]/)?.[0];
  return letter || 'X';
}

function digitsFor(seed: string, attempt = 0) {
  const hex = sha256(`${seed}:${attempt}`).slice(0, 15);
  return (BigInt(`0x${hex}`) % 10_000_000_000n).toString().padStart(10, '0');
}

export function makeFormattedId(prefix: PublicPrefix, uid: string, name: unknown, namespace = prefix.toLowerCase(), attempt = 0) {
  return `${prefix}-${digitsFor(`${namespace}:${uid}`, attempt)}${normalizeInitial(name)}`;
}

function regexFor(prefix: PublicPrefix) {
  if (prefix === 'MCW') return CLIENT_PUBLIC_ID_RE;
  if (prefix === 'MCA') return AGENT_PUBLIC_ID_RE;
  if (prefix === 'MCM') return MERCHANT_PUBLIC_ID_RE;
  return LOCAL_CARD_ID_RE;
}

async function displayNameForRole(uid: string, role: PublicRole, userData: FirebaseFirestore.DocumentData) {
  if (role === 'marchand') {
    const merchant = await db.doc(`merchant_profiles/${uid}`).get();
    return String(merchant.data()?.tradeName || merchant.data()?.legalName || userData.displayName || userData.fullName || 'Marchand');
  }
  return String(userData.displayName || userData.fullName || userData.name || (role === 'agent' ? 'Agent' : 'Client'));
}

async function availableCandidate(prefix: PublicPrefix, uid: string, name: unknown, namespace: string) {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = makeFormattedId(prefix, uid, name, namespace, attempt);
    const mapping = await db.doc(`wallet_public_ids/${candidate}`).get();
    if (!mapping.exists || String(mapping.data()?.userId || '') === uid) return candidate;
  }
  throw new HttpsError('resource-exhausted', 'Impossible de générer un identifiant Market-Cash unique.');
}

export async function ensureRolePublicId(uid: string, explicitRole?: string) {
  const userRef = db.doc(`users/${uid}`);
  const user = await userRef.get();
  if (!user.exists) throw new HttpsError('not-found', 'Compte introuvable.');
  const userData = user.data()!;
  const role = String(explicitRole || userData.role || '') as PublicRole;
  if (!['client', 'agent', 'marchand'].includes(role)) {
    throw new HttpsError('failed-precondition', 'Ce type de compte ne possède pas d’identifiant public Market-Cash.');
  }

  const prefix = rolePrefix(role);
  const current = String(userData.publicId || userData.marketCashId || '').trim().toUpperCase();
  const name = await displayNameForRole(uid, role, userData);
  const publicId = regexFor(prefix).test(current)
    ? current
    : await availableCandidate(prefix, uid, name, `public-${role}`);
  const now = Date.now();

  const mappingRef = db.doc(`wallet_public_ids/${publicId}`);
  const mapping = await mappingRef.get();
  if (mapping.exists && String(mapping.data()?.userId || '') !== uid) {
    throw new HttpsError('already-exists', 'Collision d’identifiant Market-Cash.');
  }

  const batch = db.batch();
  batch.set(mappingRef, {
    userId: uid,
    role,
    publicId,
    marketCashId: publicId,
    updatedAt: now,
    createdAt: mapping.data()?.createdAt || now,
  }, { merge: true });
  batch.set(userRef, {
    publicId,
    marketCashId: publicId,
    publicIdPrefix: prefix,
    publicIdUpdatedAt: now,
    updatedAt: now,
  }, { merge: true });

  for (const currency of ['USD', 'CDF'] as const) {
    const walletRef = db.doc(`wallet_accounts/wallet_${currency.toLowerCase()}_${uid}`);
    if ((await walletRef.get()).exists) {
      batch.set(walletRef, { publicId, marketCashId: publicId, updatedAt: now }, { merge: true });
    }
  }
  await batch.commit();
  return { role, prefix, publicId, marketCashId: publicId, displayName: name };
}

export async function ensureLocalCardIdentifier(uid: string, name: unknown, current?: unknown) {
  const existing = String(current || '').trim().toUpperCase();
  if (LOCAL_CARD_ID_RE.test(existing)) return existing;
  return availableCandidate('MCL', uid, name, 'local-card');
}

export function normalizeClientPublicId(value: unknown) {
  const id = String(value || '').trim().toUpperCase();
  if (!CLIENT_PUBLIC_ID_RE.test(id)) throw new HttpsError('invalid-argument', 'ID client invalide. Format : MCW-1234567890A.');
  return id;
}

export function normalizeMerchantPublicId(value: unknown) {
  const id = String(value || '').trim().toUpperCase();
  if (!MERCHANT_PUBLIC_ID_RE.test(id)) throw new HttpsError('invalid-argument', 'ID marchand invalide. Format : MCM-1234567890A.');
  return id;
}

export const ensureMyDefaultIdentifiers = onCall({ region: REGION }, async request => {
  const uid = String(request.auth?.uid || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  return { ok: true, ...(await ensureRolePublicId(uid)) };
});
