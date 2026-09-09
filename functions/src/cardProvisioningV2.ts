import { getApps, initializeApp } from 'firebase-admin/app';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { ensureLocalCardPair, listLocalCardSummaries } from './localCardPair';

if (!getApps().length) initializeApp();
const REGION = 'europe-west1';

const requireAuth = (request: any) => {
  const uid = String(request.auth?.uid || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  return uid;
};

// Conservés pour les anciens déploiements : une approbation KYC ne change plus
// l’éligibilité des cartes locales, mais garantit simplement que le nouveau duo
// USD/CDF existe pour le compte.
export const onClientKycApproved = onDocumentUpdated({ document: 'users/{uid}', region: REGION }, async event => {
  const after = event.data?.after.data();
  const uid = String(event.params.uid || '');
  if (!uid || after?.role !== 'client') return;
  try { await ensureLocalCardPair(uid); } catch (error) { console.error('[LOCAL_CARD_PAIR_SYNC_FAILED]', uid, error); }
});

export const onKycRequestApproved = onDocumentUpdated({ document: 'kyc_requests/{requestId}', region: REGION }, async event => {
  const after = event.data?.after.data();
  const uid = String(after?.userId || event.params.requestId || '');
  if (!uid) return;
  try { await ensureLocalCardPair(uid); } catch (error) { console.error('[LOCAL_CARD_PAIR_KYC_SYNC_FAILED]', uid, error); }
});

export const activateLocalMarketCashCardV2 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const cards = await ensureLocalCardPair(uid);
  return { ok: true, cards: cards.map(card => ({ cardId: card.cardId, cardIdentifier: card.cardIdentifier, currency: card.currency, status: card.status })) };
});

export const getMyLocalMarketCashCardsV3 = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  return { cards: await listLocalCardSummaries(uid) };
});
