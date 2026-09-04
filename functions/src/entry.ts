import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

// Keep second-generation functions while using the lighter CPU allocation
// model of first-generation functions. This reduces regional Cloud Run CPU
// pressure and keeps Market-Cash deployable on the current project quota.
setGlobalOptions({ cpu: 'gcf_gen1' });

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';

// LEGACY_LOCAL_CARD_SPENDING_GUARD
// The current Market-Cash rule is strict: deposits and transfers can use the
// main wallet, but client merchant payments and cash withdrawals must debit
// the dedicated local Market-Cash card. These explicit exports override the
// historical wallet-spending callables re-exported below so older clients can
// no longer bypass the local-card rail.
const blockedLegacySpending = (action: string, message: string) => onCall({ region: REGION }, async request => {
  const uid = String(request.auth?.uid || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');

  console.warn('[LEGACY_SPENDING_BLOCKED]', { uid, action });
  try {
    await db.collection('audit_events').add({
      actorId: uid,
      action,
      result: 'blocked',
      reason: 'LOCAL_CARD_REQUIRED',
      createdAt: Date.now(),
    });
  } catch (error) {
    console.warn('[LEGACY_SPENDING_AUDIT_FAILED]', error);
  }

  throw new HttpsError('failed-precondition', message);
});

export const merchantPayment = blockedLegacySpending(
  'LEGACY_WALLET_MERCHANT_PAYMENT_BLOCKED',
  'Le paiement depuis le portefeuille principal est désactivé. Utilisez votre carte locale Market-Cash.',
);

export const createWithdrawalAuthorization = blockedLegacySpending(
  'LEGACY_WALLET_WITHDRAWAL_AUTH_BLOCKED',
  'Le retrait depuis le portefeuille principal est désactivé. Présentez votre carte locale Market-Cash à un Agent.',
);

export const redeemWithdrawalAuthorization = blockedLegacySpending(
  'LEGACY_WALLET_WITHDRAWAL_REDEEM_BLOCKED',
  'Les anciens codes de retrait ne débitent plus le portefeuille principal. Utilisez la carte locale Market-Cash.',
);

export const agentCashOut = blockedLegacySpending(
  'LEGACY_AGENT_WALLET_CASHOUT_BLOCKED',
  'Le retrait direct depuis le portefeuille client est désactivé. L’Agent doit débiter la carte locale Market-Cash.',
);

export const walletToInternalCard = blockedLegacySpending(
  'LEGACY_INTERNAL_CARD_TOPUP_BLOCKED',
  'Cet ancien module carte est désactivé. Rechargez uniquement la carte locale Market-Cash.',
);

export const agentCardCashOut = blockedLegacySpending(
  'LEGACY_OLD_CARD_CASHOUT_BLOCKED',
  'Cet ancien parcours de retrait carte est désactivé. Utilisez la nouvelle carte locale Market-Cash.',
);

export * from './index';
export * from './operations';
export * from './withdrawalInspect';
export * from './adminUserControls';
export * from './agentTerminal';
export * from './agentAdmin';
export * from './localCard';
