import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

setGlobalOptions({ cpu: 'gcf_gen1' });

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';

const blockedLegacySpending = (action: string, message: string) => onCall({ region: REGION }, async request => {
  const uid = String(request.auth?.uid || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  try {
    await db.collection('audit_events').add({ actorId: uid, action, result: 'blocked', reason: 'SECURE_CVV_FLOW_REQUIRED', createdAt: Date.now() });
  } catch (error) {
    console.warn('[LEGACY_SPENDING_AUDIT_FAILED]', error);
  }
  throw new HttpsError('failed-precondition', message);
});

export const merchantPayment = blockedLegacySpending('LEGACY_WALLET_MERCHANT_PAYMENT_BLOCKED', 'Le paiement depuis le portefeuille principal est désactivé. Utilisez votre carte locale Market-Cash.');
export const createWithdrawalAuthorization = blockedLegacySpending('LEGACY_WALLET_WITHDRAWAL_AUTH_BLOCKED', 'Le retrait depuis le portefeuille principal est désactivé. Présentez votre carte locale Market-Cash à un Agent.');
export const redeemWithdrawalAuthorization = blockedLegacySpending('LEGACY_WALLET_WITHDRAWAL_REDEEM_BLOCKED', 'Les anciens codes de retrait ne débitent plus le portefeuille principal. Utilisez la carte locale Market-Cash.');
export const agentCashOut = blockedLegacySpending('LEGACY_AGENT_WALLET_CASHOUT_BLOCKED', 'Le retrait direct depuis le portefeuille client est désactivé. L’Agent doit débiter la carte locale Market-Cash.');
export const walletToInternalCard = blockedLegacySpending('LEGACY_INTERNAL_CARD_TOPUP_BLOCKED', 'Cet ancien module carte est désactivé. Rechargez uniquement la carte locale Market-Cash.');
export const agentCardCashOut = blockedLegacySpending('LEGACY_OLD_CARD_CASHOUT_BLOCKED', 'Cet ancien parcours de retrait carte est désactivé. Utilisez la nouvelle carte locale Market-Cash.');

export const marketCashTransfer = blockedLegacySpending('LEGACY_PIN_TRANSFER_BLOCKED', 'Cette version du transfert est désactivée. Confirmez avec votre CVV Market-Cash.');
export const walletToLocalMarketCashCardV2 = blockedLegacySpending('LEGACY_PIN_LOCAL_TOPUP_BLOCKED', 'Cette version de recharge est désactivée. Confirmez avec votre CVV Market-Cash.');
export const merchantPaymentFromLocalCardV2 = blockedLegacySpending('LEGACY_PIN_LOCAL_PAYMENT_BLOCKED', 'Cette version du paiement est désactivée. Confirmez avec votre CVV Market-Cash.');
export const agentLocalCardCashOut = blockedLegacySpending('LEGACY_PIN_LOCAL_CASHOUT_BLOCKED', 'Cette version du retrait est désactivée. Le client doit confirmer avec son CVV Market-Cash.');

export * from './index';
export * from './operations';
export * from './withdrawalInspect';
export * from './adminUserControls';
export * from './agentTerminal';
export * from './agentAdmin';
export * from './localCard';
export * from './localCardExplicit';
export * from './localCardManagement';
export * from './security';
export * from './identityV2';
export * from './cardProvisioningV2';
export * from './visaSecurity';
export * from './developerPayments';
export * from './apiKeyCardPayment';
export * from './developerAppSettings';
export * from './businessAccounts';
