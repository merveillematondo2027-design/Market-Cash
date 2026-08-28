import { collection, doc, getDoc, runTransaction, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { CardPurchaseRequest, UserCard } from '../types';
import { cardService, removeUndefined } from './cardService';
import { logService } from './logService';

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
    const snap = await getDoc(requestRef);
    if (!snap.exists()) throw new Error('REQUEST_NOT_FOUND');
    const request = snap.data() as CardPurchaseRequest;
    if (request.status !== 'pending') throw new Error('REQUEST_ALREADY_PROCESSED');
    if (isUrgentCardRequest(request)) throw new Error('URGENT_IDENTITY_NOT_REQUIRED');
    if (!request.identityProofUrl) throw new Error('IDENTITY_MISSING');

    await updateDoc(requestRef, {
      identityVerified: true,
      identityReviewedAt: Date.now(),
      identityReviewedBy: reviewer.uid,
      identityReviewedByEmail: reviewer.email,
      updatedAt: Date.now()
    });

    logService.audit('IDENTITY_ACCEPTED', 'Pièce d’identité acceptée pour une demande normale', {
      operation: 'accept_identity',
      targetType: 'card_purchase_request',
      targetId: requestId,
      documentId: requestId,
      success: true
    });
  },

  async approveUrgentRequest(requestId: string, reviewer: ReviewerIdentity): Promise<UserCard> {
    const requestSnap = await getDoc(doc(db, 'card_purchase_requests', requestId));
    if (!requestSnap.exists()) throw new Error('REQUEST_NOT_FOUND');
    const request = requestSnap.data() as CardPurchaseRequest;
    if (!isUrgentCardRequest(request)) throw new Error('REQUEST_NOT_URGENT');

    const assigned = await cardService.approveRequestWithStock(requestId, 'virtual', {
      uid: reviewer.uid,
      email: reviewer.email
    });

    logService.audit('URGENT_REQUEST_APPROVED', 'Demande urgente approuvée avec attribution automatique du stock', {
      operation: 'approve_urgent_request',
      targetType: 'card_purchase_request',
      targetId: requestId,
      documentId: requestId,
      metadata: { cardIdentifier: assigned.cardIdentifier },
      success: true
    });

    return assigned;
  },

  async approveNormalRequest(requestId: string, details: ManualCardDetails, reviewer: ReviewerIdentity): Promise<UserCard> {
    const cleaned = validateManualCard(details);
    const requestRef = doc(db, 'card_purchase_requests', requestId);
    const cardId = doc(collection(db, 'cards')).id;
    const cardIdentifier = await cardService.generateUniqueCardIdentifier();
    const now = Date.now();

    const issued = await runTransaction(db, async transaction => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists()) throw new Error('REQUEST_NOT_FOUND');
      const request = requestSnap.data() as CardPurchaseRequest;

      if (request.status !== 'pending') throw new Error('REQUEST_ALREADY_PROCESSED');
      if (isUrgentCardRequest(request)) throw new Error('USE_URGENT_APPROVAL');
      if (!request.identityProofUrl) throw new Error('IDENTITY_MISSING');
      if (request.identityVerified !== true) throw new Error('IDENTITY_NOT_ACCEPTED');

      const holder = request.fullName || request.userName || request.clientName || 'CLIENT MARKET-CASH';
      const printRequested = request.printRequested === true || request.physicalOption === 'normal';

      const card: UserCard = {
        id: cardId,
        cardId,
        cardIdentifier,
        userId: request.userId,
        userName: holder,
        userEmail: request.userEmail || request.clientEmail || '',
        cardNumber: cleaned.cardNumber,
        cardHolder: holder,
        cardHolderName: holder,
        expiryStart: details.expiryStart,
        expiryEnd: details.expiryEnd,
        expiry: details.expiryEnd,
        cvv: cleaned.cvv,
        rechargeNumber: cleaned.rechargeNumber,
        network: 'visa',
        type: 'virtual',
        status: 'active',
        saleStatus: 'sold',
        printStatus: printRequested ? 'pending' : undefined,
        printFormat: printRequested ? 'PVC' : undefined,
        printReady: printRequested,
        isPhysical: printRequested,
        qrData: `MC:${cardIdentifier}`,
        soldAt: now,
        soldBy: reviewer.email,
        soldByAgencyId: reviewer.agencyId,
        soldByAgencyName: reviewer.agencyName,
        agencyId: reviewer.agencyId,
        agencyName: reviewer.agencyName,
        createdAt: now,
        updatedAt: now
      };

      transaction.set(doc(db, 'cards', cardId), removeUndefined(card));
      transaction.update(requestRef, {
        status: 'approved',
        assignedCardId: cardId,
        identityVerified: true,
        processedAt: now,
        processedBy: reviewer.uid,
        updatedAt: now
      });

      return card;
    });

    const requestAfter = await getDoc(requestRef);
    const request = requestAfter.data() as CardPurchaseRequest | undefined;
    if (request?.printRequested === true || request?.physicalOption === 'normal') {
      await cardService.notifyRole(
        'designer_graphique',
        'Nouvelle carte à imprimer',
        `La carte ${issued.cardIdentifier} est prête pour le workflow d’impression PVC.`,
        issued.cardIdentifier
      );
    }

    await cardService.createNotification({
      userId: issued.userId,
      title: 'Paiement vérifié & carte attribuée',
      message: `Votre demande a été approuvée. Votre carte Market-Cash ${issued.cardIdentifier} est maintenant disponible.`,
      type: 'success',
      requestId,
      cardIdentifier: issued.cardIdentifier
    });

    logService.audit('NORMAL_REQUEST_APPROVED', 'Demande normale approuvée avec saisie manuelle de la carte', {
      operation: 'approve_normal_request',
      targetType: 'card_purchase_request',
      targetId: requestId,
      documentId: requestId,
      metadata: { cardIdentifier: issued.cardIdentifier },
      success: true
    });

    return issued;
  }
};
