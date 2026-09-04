import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const sha256 = (value:string) => createHash('sha256').update(value).digest('hex');
const localCardDocId = (uid:string) => `local_${sha256(`local-card:${uid}`).slice(0,24)}`;

export const getMyLocalCardSummarySecure = onCall({ region: REGION }, async request => {
  const uid = String(request.auth?.uid || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const card = await db.doc(`local_cards/${localCardDocId(uid)}`).get();
  if (!card.exists || card.data()?.userId !== uid || card.data()?.status !== 'active') {
    throw new HttpsError('not-found', 'Carte locale introuvable.');
  }
  const data = card.data()!;
  const raw = String(data.cardNumber || '').replace(/\D/g,'');
  return {
    cards: [{
      cardId: card.id,
      cardIdentifier: String(data.cardIdentifier || ''),
      cardHolder: String(data.cardHolder || data.cardHolderName || 'Client Market-Cash'),
      maskedNumber: raw ? `•••• •••• •••• ${raw.slice(-4)}` : '•••• •••• •••• ••••',
      status: String(data.status || 'active'),
      qrData: String(data.qrData || ''),
      balances: {},
    }],
  };
});
