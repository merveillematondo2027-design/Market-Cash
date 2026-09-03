import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const withdrawalDocId = (code: string) => `wd_${sha256(`market-cash-withdraw:${code}`).slice(0, 32)}`;

export const inspectWithdrawalAuthorization = onCall({ region: REGION }, async request => {
  const agentUid = String(request.auth?.uid || '');
  if (!agentUid) throw new HttpsError('unauthenticated', 'Connexion requise.');

  const [agentProfile, agentUser] = await Promise.all([
    db.doc(`agent_profiles/${agentUid}`).get(),
    db.doc(`users/${agentUid}`).get(),
  ]);
  if (!agentProfile.exists || agentProfile.data()?.status !== 'active' || agentUser.data()?.role !== 'agent') {
    throw new HttpsError('permission-denied', 'Compte Agent point de vente non autorisé.');
  }

  const code = String(request.data?.code || '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(code)) throw new HttpsError('invalid-argument', 'Code de retrait invalide.');
  const authorization = await db.doc(`withdrawal_authorizations/${withdrawalDocId(code)}`).get();
  if (!authorization.exists || authorization.data()?.codeHash !== sha256(code)) {
    throw new HttpsError('not-found', 'Code de retrait introuvable.');
  }
  const data = authorization.data()!;
  if (data.status !== 'pending') throw new HttpsError('failed-precondition', 'Ce code a déjà été utilisé ou annulé.');
  if (Number(data.expiresAt || 0) < Date.now()) throw new HttpsError('deadline-exceeded', 'Ce code de retrait a expiré.');

  const client = await db.doc(`users/${String(data.clientUid || '')}`).get();
  if (!client.exists) throw new HttpsError('not-found', 'Client introuvable.');
  const phone = String(client.data()?.phone || '');
  const maskedPhone = phone.length > 4 ? `${'*'.repeat(Math.max(3, phone.length - 4))}${phone.slice(-4)}` : phone;

  return {
    authorizationId: authorization.id,
    clientId: data.clientUid,
    clientName: String(client.data()?.displayName || 'Client Market-Cash'),
    clientPhone: maskedPhone,
    amount: Number(data.amount || 0),
    currency: String(data.currency || 'CDF'),
    expiresAt: Number(data.expiresAt || 0),
  };
});
