import { collection, doc, getDoc, getDocs, query, runTransaction, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { CardPurchaseRequest, UserCard } from '../types';
import { cardService, removeUndefined } from './cardService';
import { logService } from './logService';
import { firestoreNetwork } from '../lib/firestoreNetwork';

export interface ReviewerIdentity {
  uid: string;
  email: string;
  role?: string;
  agencyId?: string;
  agencyName?: string;
}

export interface ManualCardDetails {
  rechargeNumber: string;
  cardNumber: string;
  expiryStart: string;
  expiryEnd: string;
  cvv: string;
}

type VisaTier = 'standard' | 'gold';
const tierOf = (request: CardPurchaseRequest | Record<string, any>): VisaTier => String((request as any).visaTier || 'standard').toLowerCase() === 'gold' ? 'gold' : 'standard';
const maxForTier = (tier: VisaTier) => tier === 'gold' ? 1 : 4;

async function assertVisaCapacity(userId: string, tier: VisaTier) {
  const snap = await firestoreNetwork.guard('request.capacity.cards', () => getDocs(query(collection(db, 'cards'), where('userId', '==', userId))));
  const count = snap.docs.filter(item => {
    const card = item.data() as any;
    if (String(card.network || 'visa').toLowerCase() !== 'visa') return false;
    const currentTier = String(card.visaTier || 'standard').toLowerCase() === 'gold' ? 'gold' : 'standard';
    return currentTier === tier && card.status !== 'disabled';
  }).length;
  if (count >= maxForTier(tier)) throw new Error(tier === 'gold' ? 'GOLD_LIMIT_REACHED' : 'STANDARD_LIMIT_REACHED');
}

export const isUrgentCardRequest = (request: CardPurchaseRequest | Record<string, any>) =>
  request.urgentProcessing === true || request.isUrgent === true || request.physicalOption === 'urgent';

const validateManualCard = (details: ManualCardDetails) => {
  const cardNumber = details.cardNumber.replace(/\D/g, '');
  const rechargeNumber = details.rechargeNumber.replace(/\s+/g, '');
  const cvv = details.cvv.replace(/\D/g, '');
  const expiryPattern = /^(0[1-9]|1[0-2])\/\d{2}$/;

  if (!/^\d{16}$/.test(cardNumber)) throw new Error('INVALID_CARD_NUMBER');
  if (!rechargeNumber) throw new Error('INVALID_RECHARGE_NUMBER');
  if (!/^\d{3,4}$/.test(cvv)) throw new Error('INVALID_CVV');
  if (!expiryPattern.test(details.expiryStart) || !expiryPattern.test(details.expiryEnd)) throw new Error('INVALID_EXPIRY');

  return { cardNumber, rechargeNumber, cvv };
};

export const requestApprovalService = {
  async acceptIdentity(requestId: string, reviewer: ReviewerIdentity): Promise<void> {
    const requestRef = doc(db, 'card_purchase_requests', requestId);
    const snap = await firestoreNetwork.guard('request.identity.read', () => getDoc(requestRef));
    if (!snap.exists()) throw new Error('REQUEST_NOT_FOUND');
    const request = snap.data() as CardPurchaseRequest;
    if (request.status !== 'pending') throw new Error('REQUEST_ALREADY_PROCESSED');
    if (isUrgentCardRequest(request)) throw new Error('URGENT_IDENTITY_NOT_REQUIRED');
    if (!request.identityProofUrl) throw new Error('IDENTITY_MISSING');

    await firestoreNetwork.guard('request.identity.accept', () => updateDoc(requestRef, {
      identityVerified: true,
      identityReviewedAt: Date.now(),
      identityReviewedBy: reviewer.uid,
      identityReviewedByEmail: reviewer.email,
      updatedAt: Date.now()
    }));

    logService.audit('IDENTITY_ACCEPTED', 'Pièce d’identité acceptée pour une demande normale', {
      operation: 'accept_identity', targetType: 'card_purchase_request', targetId: requestId, documentId: requestId, success: true
    });
  },

  async approveUrgentRequest(requestId: string, reviewer: ReviewerIdentity): Promise<UserCard> {
    const requestRef = doc(db, 'card_purchase_requests', requestId);
    const requestSnap = await firestoreNetwork.guard('request.urgent.read', () => getDoc(requestRef));
    if (!requestSnap.exists()) throw new Error('REQUEST_NOT_FOUND');
    const request = requestSnap.data() as CardPurchaseRequest;
    if (!isUrgentCardRequest(request)) throw new Error('REQUEST_NOT_URGENT');
    const tier = tierOf(request);
    if (tier === 'gold') throw new Error('GOLD_URGENT_NOT_AVAILABLE');
    await assertVisaCapacity(request.userId, 'standard');

    const assigned = await cardService.approveRequestWithStock(requestId, 'virtual', { uid: reviewer.uid, email: reviewer.email });
    const assignedId = assigned.id || assigned.cardId;
    if (assignedId) {
      await firestoreNetwork.guard('request.urgent.tier', () => updateDoc(doc(db, 'cards', assignedId), {
        visaTier: 'standard',
        provider: 'vodacom',
        updatedAt: Date.now()
      }));
      (assigned as any).visaTier = 'standard';
      (assigned as any).provider = 'vodacom';
    }

    logService.audit('URGENT_REQUEST_APPROVED', 'Demande Visa Standard urgente approuvée depuis le stock Vodacom', {
      operation: 'approve_urgent_request', targetType: 'card_purchase_request', targetId: requestId, documentId: requestId,
      metadata: { cardIdentifier: assigned.cardIdentifier, visaTier: 'standard', provider: 'vodacom' }, success: true
    });
    return assigned;
  },

  async approveNormalRequest(requestId: string, details: ManualCardDetails, reviewer: ReviewerIdentity): Promise<UserCard> {
    const cleaned = validateManualCard(details);
    const requestRef = doc(db, 'card_purchase_requests', requestId);
    const initialRequest = await firestoreNetwork.guard('request.normal.precheck', () => getDoc(requestRef));
    if (!initialRequest.exists()) throw new Error('REQUEST_NOT_FOUND');
    const initialData = initialRequest.data() as CardPurchaseRequest;
    const visaTier = tierOf(initialData);
    await assertVisaCapacity(initialData.userId, visaTier);

    const cardId = doc(collection(db, 'cards')).id;
    const cardIdentifier = await cardService.generateUniqueCardIdentifier();
    const now = Date.now();

    const issued = await firestoreNetwork.guard('request.normal.approve.transaction', () => runTransaction(db, async transaction => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists()) throw new Error('REQUEST_NOT_FOUND');
      const request = requestSnap.data() as CardPurchaseRequest;
      if (request.status !== 'pending') throw new Error('REQUEST_ALREADY_PROCESSED');
      if (isUrgentCardRequest(request)) throw new Error('USE_URGENT_APPROVAL');
      if (!request.identityProofUrl) throw new Error('IDENTITY_MISSING');
      if (request.identityVerified !== true) throw new Error('IDENTITY_NOT_ACCEPTED');

      const tier = tierOf(request);
      const holder = request.fullName || request.userName || request.clientName || 'CLIENT MARKET-CASH';
      const printRequested = request.printRequested === true || request.physicalOption === 'normal';
      const card = {
        id: cardId, cardId, cardIdentifier, userId: request.userId, userName: holder,
        userEmail: request.userEmail || request.clientEmail || '', cardNumber: cleaned.cardNumber,
        cardHolder: holder, cardHolderName: holder, expiryStart: details.expiryStart, expiryEnd: details.expiryEnd,
        expiry: details.expiryEnd, cvv: cleaned.cvv, rechargeNumber: cleaned.rechargeNumber,
        network: 'visa', type: 'virtual', visaTier: tier, provider: tier === 'standard' ? 'vodacom' : 'market_cash_gold',
        status: 'active', saleStatus: 'sold', printStatus: printRequested ? 'pending' : undefined,
        printFormat: printRequested ? 'PVC' : undefined, printReady: printRequested, isPhysical: printRequested,
        qrData: `MC:${cardIdentifier}`, soldAt: now, soldBy: reviewer.email,
        soldByAgencyId: reviewer.agencyId, soldByAgencyName: reviewer.agencyName,
        agencyId: reviewer.agencyId, agencyName: reviewer.agencyName, createdAt: now, updatedAt: now
      } as UserCard & { visaTier: VisaTier; provider: string };

      transaction.set(doc(db, 'cards', cardId), removeUndefined(card));
      transaction.update(requestRef, { status: 'approved', assignedCardId: cardId, identityVerified: true, processedAt: now, processedBy: reviewer.uid, updatedAt: now });
      return card;
    }));

    const requestAfter = await firestoreNetwork.guard('request.normal.confirm', () => getDoc(requestRef));
    const request = requestAfter.data() as CardPurchaseRequest | undefined;
    if (request?.printRequested === true || request?.physicalOption === 'normal') {
      await cardService.notifyRole('designer_graphique', 'Nouvelle carte à imprimer', `La carte ${issued.cardIdentifier} est prête pour le workflow d’impression PVC.`, issued.cardIdentifier);
    }

    await cardService.createNotification({
      userId: issued.userId,
      title: 'Paiement vérifié & carte attribuée',
      message: `Votre demande a été approuvée. Votre ${visaTier === 'gold' ? 'Visa Gold' : 'Visa Standard'} Market-Cash ${issued.cardIdentifier} est maintenant disponible.`,
      type: 'success', requestId, cardIdentifier: issued.cardIdentifier
    });

    logService.audit('NORMAL_REQUEST_APPROVED', 'Demande Visa approuvée avec saisie manuelle de la carte', {
      operation: 'approve_normal_request', targetType: 'card_purchase_request', targetId: requestId, documentId: requestId,
      metadata: { cardIdentifier: issued.cardIdentifier, visaTier }, success: true
    });
    return issued;
  }
};
