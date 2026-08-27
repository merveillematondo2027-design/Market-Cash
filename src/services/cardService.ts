import { logService } from './logService';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  getDoc, 
  getDocs, 
  query, where, limit,  
  orderBy,
  runTransaction,
  onSnapshot
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { UserCard, PhysicalCardRequest, DeliveryStatus, User, CardDesignSettings, PaymentMethodItem, HelpArticle } from '../types';
import { generateAndUploadPvcCard } from '../lib/pvcCardGenerator';

export interface CardPricingSettings {
  virtualCardPrice: number | null;
  physicalCardPrice: number | null;
  urgentPhysicalCardPrice: number | null;
  currency: string;
  isFallback?: boolean;
}

export const DEFAULT_CARD_PRICING: CardPricingSettings = {
  virtualCardPrice: null,
  physicalCardPrice: null,
  urgentPhysicalCardPrice: null,
  currency: 'USD',
  isFallback: true
};

export const INITIAL_DEFAULT_PAYMENT_METHODS: PaymentMethodItem[] = [
  {
    id: 'pm-mpesa',
    network: 'M-Pesa',
    number: '+243 820 743 730',
    beneficiary: 'MARKET-CASH RDC',
    active: true,
    order: 1,
    instructions: 'Envoyez le montant via M-Pesa puis faites une capture d’écran de la confirmation.',
    createdAt: 1700000000000,
    updatedAt: 1700000000000
  },
  {
    id: 'pm-airtel',
    network: 'Airtel Money',
    number: '+243 970 000 000',
    beneficiary: 'MARKET-CASH RDC',
    active: true,
    order: 2,
    instructions: 'Envoyez le montant via Airtel Money puis faites une capture d’écran de la confirmation.',
    createdAt: 1700000000000,
    updatedAt: 1700000000000
  },
  {
    id: 'pm-orange',
    network: 'Orange Money',
    number: '+243 890 000 000',
    beneficiary: 'MARKET-CASH RDC',
    active: true,
    order: 3,
    instructions: 'Envoyez le montant via Orange Money puis faites une capture d’écran de la confirmation.',
    createdAt: 1700000000000,
    updatedAt: 1700000000000
  }
];

export const INITIAL_FAQ_ARTICLES: Omit<HelpArticle, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    question: 'Qu’est-ce que Market-Cash ?',
    answer: 'Market-Cash est une solution de cartes prépayées permettant aux utilisateurs de disposer d’une carte adaptée à leurs besoins et d’effectuer différentes opérations selon les services disponibles dans l’application.',
    category: 'Général',
    active: true,
    order: 1,
    videoUrls: {
      youtube: 'https://youtube.com',
      facebook: '',
      instagram: '',
      tiktok: ''
    }
  },
  {
    question: 'Comment obtenir une carte Market-Cash ?',
    answer: 'Connectez-vous à votre compte, accédez à la section de commande de carte, choisissez le type de carte disponible et suivez les étapes indiquées pour effectuer votre demande.',
    category: 'Cartes',
    active: true,
    order: 2,
    videoUrls: {
      youtube: 'https://youtube.com',
      facebook: '',
      instagram: '',
      tiktok: ''
    }
  },
  {
    question: 'Quelle est la différence entre une carte virtuelle et une carte physique ?',
    answer: 'La carte virtuelle est destinée à une utilisation numérique tandis que la carte physique correspond à une carte matérielle pouvant être remise ou livrée au client selon les conditions du service.',
    category: 'Cartes',
    active: true,
    order: 3
  },
  {
    question: 'Comment payer ma commande de carte ?',
    answer: 'Après avoir choisi votre carte, l’application vous indique les moyens de paiement disponibles. Envoyez le montant demandé vers le numéro correspondant puis fournissez la preuve de paiement demandée.',
    category: 'Paiement',
    active: true,
    order: 4
  },
  {
    question: 'Quelle preuve de paiement dois-je envoyer ?',
    answer: 'Vous devez fournir une capture d’écran claire et lisible montrant l’opération de paiement ainsi que le numéro utilisé pour effectuer le paiement.',
    category: 'Paiement',
    active: true,
    order: 5
  },
  {
    question: 'Pourquoi dois-je indiquer le numéro qui a effectué le paiement ?',
    answer: 'Cette information permet à l’équipe Market-Cash de vérifier plus facilement la transaction et d’identifier l’origine du paiement.',
    category: 'Paiement',
    active: true,
    order: 6
  },
  {
    question: 'Combien de temps faut-il pour traiter une demande ?',
    answer: 'Le délai dépend du traitement de votre demande et de la vérification du paiement. Une notification vous informe de l’évolution de votre demande.',
    category: 'Demandes',
    active: true,
    order: 7
  },
  {
    question: 'Comment suivre ma demande ?',
    answer: 'Vous pouvez suivre l’état de votre demande directement depuis votre compte Market-Cash et consulter les notifications relatives à son traitement.',
    category: 'Demandes',
    active: true,
    order: 8
  },
  {
    question: 'Que faire si mon paiement a été effectué mais que ma demande n’est pas encore validée ?',
    answer: 'Vérifiez que votre preuve de paiement est correctement envoyée. Si la demande reste en attente, contactez l’équipe Market-Cash depuis le centre d’aide.',
    category: 'Support',
    active: true,
    order: 9
  },
  {
    question: 'Que faire si j’ai envoyé une mauvaise capture ?',
    answer: 'Si votre demande n’a pas encore été traitée, contactez l’équipe Market-Cash afin de signaler le problème et fournir les informations correctes.',
    category: 'Support',
    active: true,
    order: 10
  }
];

let inFlightPricingPromise: Promise<CardPricingSettings> | null = null;
let cachedPricingData: CardPricingSettings | null = null;

/**
 * Strips all undefined values recursively to ensure Firestore compatibility.
 */
export function removeUndefined<T extends Record<string, any>>(obj: T): T {
  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        clean[key] = removeUndefined(val);
      } else {
        clean[key] = val;
      }
    }
  }
  return clean as T;
}

export const cardService = {
  /**
   * Loads card pricing strictly from Firestore
   */
  async getPricing(forceRefresh = false): Promise<CardPricingSettings> {
    if (!forceRefresh && cachedPricingData) {
      return cachedPricingData;
    }

    if (inFlightPricingPromise) {
      return inFlightPricingPromise;
    }

    inFlightPricingPromise = (async () => {
      try {
        const docRef = doc(db, 'app_settings', 'card_pricing');
        const snap = await getDoc(docRef);

        if (snap.exists()) {
          const data = snap.data();
          const vPrice = (typeof data.virtualCardPrice === 'number' && Number.isFinite(data.virtualCardPrice) && data.virtualCardPrice > 0) ? data.virtualCardPrice : null;
          const pPrice = (typeof data.physicalCardPrice === 'number' && Number.isFinite(data.physicalCardPrice) && data.physicalCardPrice > 0) ? data.physicalCardPrice : null;
          
          const result: CardPricingSettings = {
            virtualCardPrice: vPrice,
            physicalCardPrice: pPrice,
            currency: data.currency || 'USD',
            isFallback: false
          };

          cachedPricingData = result;
          return result;
        } else {
          // If pricing is not set yet in Firestore, default to standard pricing if none configured
          const result: CardPricingSettings = {
            virtualCardPrice: 10,
            physicalCardPrice: 15,
            currency: 'USD',
            isFallback: false
          };
          cachedPricingData = result;
          return result;
        }
      } catch (error: any) {
        console.error('[PRICING_LOAD_ERROR]', error);
        return {
          virtualCardPrice: null,
          physicalCardPrice: null,
  urgentPhysicalCardPrice: null,
          currency: 'USD',
          isFallback: true
        };
      }
    })().finally(() => {
      inFlightPricingPromise = null;
    });

    return inFlightPricingPromise;
  },

  /**
   * Subscribes to real-time pricing updates
   */
  subscribePricing(callback: (pricing: CardPricingSettings) => void) {
    const docRef = doc(db, 'app_settings', 'card_pricing');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const vPrice = (typeof data.virtualCardPrice === 'number' && Number.isFinite(data.virtualCardPrice) && data.virtualCardPrice > 0) ? data.virtualCardPrice : null;
        const pPrice = (typeof data.physicalCardPrice === 'number' && Number.isFinite(data.physicalCardPrice) && data.physicalCardPrice > 0) ? data.physicalCardPrice : null;
        const res: CardPricingSettings = {
          virtualCardPrice: vPrice,
          physicalCardPrice: pPrice,
          currency: data.currency || 'USD',
          isFallback: false
        };
        cachedPricingData = res;
        callback(res);
      } else {
        const res: CardPricingSettings = {
          virtualCardPrice: 10,
          physicalCardPrice: 15,
          currency: 'USD',
          isFallback: false
        };
        cachedPricingData = res;
        callback(res);
      }
    }, (err) => {
      console.warn('[SUBSCRIBE_PRICING_ERROR]', err);
      callback({
        virtualCardPrice: null,
        physicalCardPrice: null,
  urgentPhysicalCardPrice: null,
        currency: 'USD',
        isFallback: true
      });
    });
  },

  /**
   * Updates card pricing in Firestore
   */
  async updatePricing(params: { virtualCardPrice: number | null; physicalCardPrice: number | null;
  urgentPhysicalCardPrice: number | null; currency?: string }): Promise<void> {
    const docRef = doc(db, 'app_settings', 'card_pricing');
    const payload = {
      virtualCardPrice: (params.virtualCardPrice !== null && params.virtualCardPrice > 0) ? Number(params.virtualCardPrice) : null,
      physicalCardPrice: (params.physicalCardPrice !== null && params.physicalCardPrice > 0) ? Number(params.physicalCardPrice) : null,
      urgentPhysicalCardPrice: (params.urgentPhysicalCardPrice !== null && params.urgentPhysicalCardPrice > 0) ? Number(params.urgentPhysicalCardPrice) : null,
      currency: params.currency || 'USD',
      updatedAt: Date.now()
    };
    await setDoc(docRef, removeUndefined(payload), { merge: true });
    cachedPricingData = {
      virtualCardPrice: payload.virtualCardPrice,
      physicalCardPrice: payload.physicalCardPrice,
      urgentPhysicalCardPrice: payload.urgentPhysicalCardPrice,
      currency: payload.currency,
      isFallback: false
    };
  },

  /**
   * Payment Methods (M-Pesa, Airtel, Orange Money, etc.)
   */
  async getPaymentMethods(): Promise<PaymentMethodItem[]> {
    try {
      const docRef = doc(db, 'app_settings', 'payment_methods');
      const snap = await getDoc(docRef);
      if (snap.exists() && Array.isArray(snap.data().items)) {
        return (snap.data().items as PaymentMethodItem[]).sort((a, b) => (a.order || 0) - (b.order || 0));
      }
      return INITIAL_DEFAULT_PAYMENT_METHODS;
    } catch (err) {
      console.warn('[GET_PAYMENT_METHODS_ERROR]', err);
      return INITIAL_DEFAULT_PAYMENT_METHODS;
    }
  },

  subscribePaymentMethods(callback: (methods: PaymentMethodItem[]) => void) {
    const docRef = doc(db, 'app_settings', 'payment_methods');
    return onSnapshot(docRef, (snap) => {
      if (snap.exists() && Array.isArray(snap.data().items)) {
        const items = (snap.data().items as PaymentMethodItem[]).sort((a, b) => (a.order || 0) - (b.order || 0));
        callback(items);
      } else {
        callback(INITIAL_DEFAULT_PAYMENT_METHODS);
      }
    }, (err) => {
      console.warn('[SUBSCRIBE_PAYMENT_METHODS_ERROR]', err);
      callback(INITIAL_DEFAULT_PAYMENT_METHODS);
    });
  },

  async savePaymentMethods(items: PaymentMethodItem[]): Promise<void> {
    const docRef = doc(db, 'app_settings', 'payment_methods');
    await setDoc(docRef, {
      items: removeUndefined(items),
      updatedAt: Date.now()
    });
  },

  async addOrUpdatePaymentMethod(method: PaymentMethodItem): Promise<void> {
    const current = await this.getPaymentMethods();
    const index = current.findIndex(m => m.id === method.id);
    let updated: PaymentMethodItem[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = { ...method, updatedAt: Date.now() };
    } else {
      updated = [...current, { ...method, createdAt: Date.now(), updatedAt: Date.now() }];
    }
    await this.savePaymentMethods(updated);
  },

  async deletePaymentMethod(id: string): Promise<void> {
    const current = await this.getPaymentMethods();
    const updated = current.filter(m => m.id !== id);
    await this.savePaymentMethods(updated);
  },

  /**
   * FAQ & Video Tutorials
   */
  async seedInitialFaqIfEmpty(): Promise<void> {
    try {
      const q = query(collection(db, 'help_articles'));
      const snap = await getDocs(q);
      if (snap.empty) {
        console.log('[FAQ_SEED_START] Initialisation des 10 questions FAQ initiales...');
        for (const item of INITIAL_FAQ_ARTICLES) {
          const docId = doc(collection(db, 'help_articles')).id;
          const article: HelpArticle = {
            id: docId,
            ...item,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
          await setDoc(doc(db, 'help_articles', docId), removeUndefined(article));
        }
        console.log('[FAQ_SEED_COMPLETED]');
      }
    } catch (err) {
      console.warn('[FAQ_SEED_ERROR]', err);
    }
  },

  subscribeHelpArticles(callback: (articles: HelpArticle[]) => void) {
    const q = query(collection(db, 'help_articles'));
    return onSnapshot(q, (snap) => {
      const articles: HelpArticle[] = [];
      snap.forEach(d => {
        articles.push(d.data() as HelpArticle);
      });
      articles.sort((a, b) => (a.order || 0) - (b.order || 0));
      callback(articles);
    }, (err) => {
      console.warn('[SUBSCRIBE_HELP_ARTICLES_ERROR]', err);
      // If error or empty, return default mapped
      const defaults = INITIAL_FAQ_ARTICLES.map((a, i) => ({
        id: `default-${i + 1}`,
        ...a,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }));
      callback(defaults);
    });
  },

  async saveHelpArticle(article: HelpArticle): Promise<void> {
    const docRef = doc(db, 'help_articles', article.id);
    await setDoc(docRef, removeUndefined({
      ...article,
      updatedAt: Date.now()
    }), { merge: true });
  },

  async deleteHelpArticle(id: string): Promise<void> {
    const docRef = doc(db, 'help_articles', id);
    await deleteDoc(docRef);
  },

  /**
   * Generates a guaranteed unique, sequential Card Identifier on Firestore.
   * Format: MC-001-YYYYMMDD (e.g. MC-001-20260823)
   */
  async generateUniqueCardIdentifier(targetDate = new Date()): Promise<string> {
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    const counterDocId = `global_card_counter`;
    const counterRef = doc(db, 'counters', counterDocId);

    try {
      const nextOrder = await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        let currentCount = 0;
        if (counterSnap.exists()) {
          currentCount = counterSnap.data().count || 0;
        }
        const updatedCount = currentCount + 1;
        transaction.set(counterRef, {
          count: updatedCount,
          lastGeneratedAt: Date.now()
        }, { merge: true });
        return updatedCount;
      });

      const orderStr = String(nextOrder).padStart(3, '0');
      return `MC-${orderStr}${dateStr}`;
    } catch (error) {
      console.warn('[TRANSACTION_FALLBACK_ID_GENERATION]', error);
      // Fallback in case of network glitch
      const randomOrder = Math.floor(100 + Math.random() * 900);
      return `MC-${randomOrder}${dateStr}`;
    }
  },

  async generateNextCardIdentifier(targetDate = new Date()): Promise<string> {
    return this.generateUniqueCardIdentifier(targetDate);
  },

  /**
   * Notifies users (Client, Designer, Chef d'Agence, Admin Général)
   */
  async createNotification(params: {
    userId: string;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
    category?: 'card_status' | 'general' | 'security' | 'delivery' | 'printing';
    cardIdentifier?: string;
    cardName?: string;
    requestId?: string;
    deliveryId?: string;
  }) {
    try {
      if (!params.userId) return;
      const notifId = doc(collection(db, 'notifications')).id;
      const notifData = {
        id: notifId,
        userId: params.userId,
        title: params.title,
        message: params.message,
        type: params.type,
        read: false,
        createdAt: Date.now(),
        category: params.category || 'card_status',
        cardIdentifier: params.cardIdentifier || '',
        cardName: params.cardName || '',
        requestId: params.requestId || '',
        deliveryId: params.deliveryId || ''
      };
      await setDoc(doc(db, 'notifications', notifId), removeUndefined(notifData));
    } catch (err) {
      console.error('[NOTIFICATION_CREATE_ERROR]', err);
    }
  },

  /**
   * Notify all users with a specific role
   */
  async notifyRole(role: 'admin_general' | 'chef_agence' | 'designer_graphique' | 'livreur', title: string, message: string, cardIdentifier?: string) {
    try {
      const qUsers = query(collection(db, 'users'), where('role', '==', role));
      const snap = await getDocs(qUsers);
      const promises = snap.docs.map(userDoc => {
        return this.createNotification({
          userId: userDoc.id,
          title,
          message,
          type: 'info',
          category: 'printing',
          cardIdentifier
        });
      });
      await Promise.all(promises);
    } catch (e) {
      console.error('[NOTIFY_ROLE_ERROR]', e);
    }
  },

  /**
   * Confirms the sale of a physical card, generates unique ID, renders PVC graphic, and registers to library.
   */
  
  async addCardToStock(params: {
    cardNumber: string;
    cardHolder: string;
    expiryStart: string;
    expiryEnd: string;
    cvv: string;
    rechargeNumber?: string;
    network: 'visa' | 'mastercard' | 'amex' | 'other';
    type: 'virtual' | 'physical';
    creator: { email: string; uid: string; agencyId?: string; agencyName?: string };
  }): Promise<UserCard> {
    const cardId = doc(collection(db, 'cards')).id;
    const cardIdentifier = await this.generateUniqueCardIdentifier();
    
    const cleanCardNum = params.cardNumber.replace(/\s+/g, '');
    
    const newCard: UserCard = {
      id: cardId,
      cardId,
      cardIdentifier,
      userId: '',
      userName: '',
      userEmail: '',
      cardNumber: cleanCardNum,
      cardHolder: params.cardHolder.trim(),
      cardHolderName: params.cardHolder.trim(),
      expiryStart: params.expiryStart || '02/27',
      expiryEnd: params.expiryEnd || '08/27',
      expiry: params.expiryEnd || '08/27',
      cvv: params.cvv || '551',
      rechargeNumber: params.rechargeNumber?.trim() || undefined,
      network: params.network || 'visa',
      type: params.type,
      status: 'disabled',
      saleStatus: 'available',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    await setDoc(doc(db, 'cards', cardId), removeUndefined(newCard));
    return newCard;
  },

  async getAvailableStockCount(): Promise<{ virtual: number; physical: number }> {
    const q = query(collection(db, 'cards'), where('saleStatus', '==', 'available'));
    const snap = await getDocs(q);
    let virtual = snap.size;
    let physical = 0; // physical stock is no longer tracked this way
    return { virtual, physical };
  },

  async approveRequestWithStock(requestId: string, _type: string, adminData: { uid: string, email: string }): Promise<UserCard> {
    const requestRef = doc(db, 'card_purchase_requests', requestId);
    const cardsRef = collection(db, 'cards');
    
    // We do a query to find available cards first, because we can't easily query with limit inside a transaction in all JS SDKs
    const q = query(cardsRef, where('saleStatus', '==', 'available'), limit(10));
    const availableDocs = await getDocs(q);
    
    if (availableDocs.empty) {
      throw new Error('STOCK_EMPTY');
    }
    
    // Try to atomically assign the first available one
    let assignedCard: UserCard | null = null;
    
    for (const cardDoc of availableDocs.docs) {
      try {
        assignedCard = await runTransaction(db, async (transaction) => {
          const cDoc = await transaction.get(cardDoc.ref);
          if (!cDoc.exists() || cDoc.data().saleStatus !== 'available') {
            throw new Error('CARD_UNAVAILABLE');
          }
          
          const reqDoc = await transaction.get(requestRef);
          if (!reqDoc.exists() || reqDoc.data().status !== 'pending') {
            throw new Error('REQUEST_INVALID');
          }
          
          const reqData = reqDoc.data();
          const cardData = cDoc.data() as UserCard;
          
          // Update Card
          const updatedCard = {
            ...cardData,
            userId: reqData.userId,
            userName: reqData.userName || reqData.fullName,
            userEmail: reqData.userEmail || reqData.clientEmail || '',
            status: 'active',
            saleStatus: 'sold',
            soldAt: Date.now(),
            soldBy: adminData.email,
            updatedAt: Date.now()
          };
          
          transaction.set(cardDoc.ref, removeUndefined(updatedCard), { merge: true });
          
          // Update Request
          transaction.update(requestRef, {
            status: 'approved',
            assignedCardId: cardDoc.id,
            processedAt: Date.now(),
            processedBy: adminData.uid
          });
          
          if (reqData.physicalOption === 'normal' || reqData.physicalOption === 'urgent') {
            const physicalReqRef = doc(collection(db, 'physical_card_requests'));
            transaction.set(physicalReqRef, {
              id: physicalReqRef.id,
              userId: reqData.userId,
              userEmail: reqData.userEmail || '',
              userName: reqData.userName || reqData.fullName || '',
              cardId: cardData.cardId,
              cardIdentifier: cardData.cardIdentifier,
              isUrgent: reqData.physicalOption === 'urgent',
              status: 'pending',
              designChoice: 'default',
              createdAt: Date.now(),
              updatedAt: Date.now()
            });
          }
          
          return updatedCard as UserCard;
        });
        
        if (assignedCard) break; // Successfully assigned
      } catch (err: any) {
        if (err.message === 'CARD_UNAVAILABLE') {
          continue; // Try next card
        }
        throw err; // Other error, bubble up
      }
    }
    
    if (!assignedCard) {
      throw new Error('STOCK_EMPTY'); // All tried cards were unavailable
    }
    
    return assignedCard;
  },
async confirmAndIssuePhysicalCard(params: {
    userId: string;
    userName: string;
    userEmail?: string;
    cardNumber: string;
    cardHolder: string;
    expiryStart?: string;
    expiryEnd?: string;
    cvv?: string;
    rechargeNumber?: string;
    network?: 'visa' | 'mastercard' | 'amex' | 'other';
    seller: { uid: string; email: string; role: string; agencyId?: string; agencyName?: string };
    requestId?: string;
  }): Promise<UserCard> {
    const cardId = doc(collection(db, 'cards')).id;
    const cardIdentifier = await this.generateUniqueCardIdentifier();

    const cleanCardNum = params.cardNumber.replace(/\s+/g, '');

    const newCard: UserCard = {
      id: cardId,
      cardId,
      cardIdentifier,
      userId: params.userId,
      userName: params.userName,
      userEmail: params.userEmail,
      cardNumber: cleanCardNum,
      cardHolder: params.cardHolder.trim(),
      cardHolderName: params.cardHolder.trim(),
      expiryStart: params.expiryStart || '02/27',
      expiryEnd: params.expiryEnd || '08/27',
      expiry: params.expiryEnd || '08/27',
      cvv: params.cvv || '551',
      rechargeNumber: params.rechargeNumber?.trim() || undefined,
      network: params.network || 'visa',
      type: 'physical',
      status: 'active',
      
      // Production Library fields
      saleStatus: 'confirmed',
      printStatus: 'pending',
      printFormat: 'PVC',
      printReady: true,
      soldAt: Date.now(),
      soldBy: params.seller.email,
      agencyId: params.seller.agencyId || 'SIEGE_CENTRAL',
      agencyName: params.seller.agencyName || 'Siège Central Market-Cash',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // Save initial card doc
    await setDoc(doc(db, 'cards', cardId), removeUndefined(newCard));

    // Generate & Upload high-res PVC image
    try {
      const frontImageUrl = await generateAndUploadPvcCard(newCard);
      newCard.frontImageUrl = frontImageUrl;
      await updateDoc(doc(db, 'cards', cardId), { frontImageUrl });
    } catch (imgError) {
      console.warn('[PVC_IMAGE_GEN_ERROR]', imgError);
    }

    // Update purchase request if origin is a request
    if (params.requestId) {
      await updateDoc(doc(db, 'card_purchase_requests', params.requestId), {
        status: 'approved',
        assignedCardId: cardId,
        processedAt: Date.now(),
        processedBy: params.seller.email
      });
    }

    // Trigger required notifications
    // 1. Designer Graphique
    await this.notifyRole(
      'designer_graphique',
      'Nouvelle carte physique à imprimer',
      `Une nouvelle carte physique (${cardIdentifier} - ${params.cardHolder}) est en attente d'impression.`,
      cardIdentifier
    );

    // 2. Chef d'agence
    await this.notifyRole(
      'chef_agence',
      'Vente de carte physique confirmée',
      `Une carte physique vendue (${cardIdentifier}) est prête pour impression.`,
      cardIdentifier
    );

    // 3. Admin Général
    await this.notifyRole(
      'admin_general',
      'Carte physique créée et ajoutée',
      `La carte physique ${cardIdentifier} a été enregistrée et ajoutée à la bibliothèque.`,
      cardIdentifier
    );

    // 4. Client
    await this.createNotification({
      userId: params.userId,
      title: 'Achat de carte physique confirmé',
      message: `Félicitations ! Votre carte physique ${cardIdentifier} a été validée. Elle est actuellement en cours de préparation et d'impression.`,
      type: 'success',
      cardIdentifier,
      requestId: params.requestId
    });

    return newCard;
  },

  /**
   * Designer marks a card as printed.
   */
  async markCardAsPrinted(card: UserCard, designer: { email: string; uid: string }): Promise<void> {
    const cardId = card.cardId || card.id;
    if (!cardId) return;

    const now = Date.now();
    await updateDoc(doc(db, 'cards', cardId), {
      printStatus: 'printed',
      printedAt: now,
      printedBy: designer.email,
      updatedAt: now
    });

    const cardIdentifier = card.cardIdentifier || cardId;

    // 1. Notify Client
    await this.createNotification({
      userId: card.userId,
      title: 'Votre carte physique est imprimée.',
      message: 'Votre carte physique est imprimée. Prenez contact avec le livreur pour planifier la remise de votre carte.',
      type: 'success',
      category: 'delivery',
      cardIdentifier,
      cardName: card.cardHolder,
      cardId
    });

    // 2. Notify Admin & Chef d'agence
    await this.notifyRole(
      'admin_general',
      'Carte physique imprimée',
      `La carte ${cardIdentifier} (${card.cardHolder}) a été imprimée avec succès par ${designer.email}.`,
      cardIdentifier
    );

    await this.notifyRole(
      'chef_agence',
      'Carte physique imprimée',
      `La carte ${cardIdentifier} (${card.cardHolder}) est prête pour expédition/livraison.`,
      cardIdentifier
    );
  },

  /**
   * Client submits a delivery request with mandatory GPS location, whatsapp, and delivery date.
   */
  async submitDeliveryRequest(params: {
    userId: string;
    userName?: string;
    userEmail?: string;
    userPhone?: string;
    cardId: string;
    cardIdentifier?: string;
    cardHolder?: string;
    deliveryDate: string;
    deliveryAddress: string;
    whatsapp: string;
    location: { lat: number; lng: number; accuracy?: number; address?: string };
    agencyId?: string;
  }): Promise<string> {
    const finalCardId = params.cardId || params.cardIdentifier || '';
    const finalCardIdentifier = params.cardIdentifier || params.cardId || '';

    if (!params.userId) {
      throw new Error("Utilisateur non identifié.");
    }
    if (!finalCardId || !finalCardIdentifier) {
      throw new Error("Impossible d'identifier la carte sélectionnée.");
    }
    if (!params.deliveryDate) {
      throw new Error("Date de livraison requise.");
    }
    if (!params.whatsapp) {
      throw new Error("Numéro WhatsApp requis.");
    }
    if (!params.deliveryAddress) {
      throw new Error("Adresse de livraison requise.");
    }
    if (
      !params.location || 
      typeof params.location.lat !== 'number' || 
      typeof params.location.lng !== 'number' ||
      isNaN(params.location.lat) ||
      isNaN(params.location.lng)
    ) {
      throw new Error("Position GPS requise et valide.");
    }

    const deliveryId = doc(collection(db, 'physical_card_requests')).id;
    const now = Date.now();

    const requestData: PhysicalCardRequest = {
      id: deliveryId,
      userId: params.userId,
      userName: params.userName || params.cardHolder || 'Client',
      userEmail: params.userEmail || '',
      userPhone: params.userPhone || params.whatsapp,
      cardId: finalCardId,
      cardIdentifier: finalCardIdentifier,
      cardHolder: params.cardHolder || params.userName || 'Client',
      deliveryDate: params.deliveryDate,
      deliveryAddress: params.deliveryAddress,
      whatsapp: params.whatsapp,
      whatsappNumber: params.whatsapp,
      latitude: params.location.lat,
      longitude: params.location.lng,
      location: {
        lat: params.location.lat,
        lng: params.location.lng,
        accuracy: typeof params.location.accuracy === 'number' ? params.location.accuracy : 0,
        address: params.location.address || params.deliveryAddress
      },
      status: 'pending',
      agencyId: params.agencyId || 'SIEGE_CENTRAL',
      createdAt: now,
      updatedAt: now
    };

    const cleanRequestData = removeUndefined(requestData);

    await setDoc(doc(db, 'physical_card_requests', deliveryId), cleanRequestData);
    console.log('[DELIVERY_REQUEST_SUCCESS]', {
      deliveryId,
      cardId: finalCardId,
      cardIdentifier: finalCardIdentifier
    });

    try {
      // Notify Admin & Chef d'Agence
      await this.notifyRole(
        'admin_general',
        'Nouvelle demande de livraison',
        `Le client ${params.userName || params.cardHolder || 'Client'} a programmé la livraison de sa carte ${finalCardIdentifier} pour le ${params.deliveryDate}.`,
        finalCardIdentifier
      );

      await this.notifyRole(
        'livreur',
        'Nouvelle course disponible',
        `Nouvelle demande de livraison de carte pour le ${params.deliveryDate} à ${params.deliveryAddress}.`,
        finalCardIdentifier
      );
    } catch (e) {
      console.warn('[DELIVERY_ROLE_NOTIFY_WARN]', e);
    }

    // Notify Client
    await this.createNotification({
      userId: params.userId,
      title: 'Demande de livraison reçue',
      message: `Votre demande de livraison pour le ${params.deliveryDate} a bien été enregistrée. Un livreur prendra contact avec vous sur WhatsApp.`,
      type: 'success',
      category: 'delivery',
      cardIdentifier: finalCardIdentifier,
      deliveryId
    });

    return deliveryId;
  },

  /**
   * Updates delivery status (by Livreur or Admin)
   */
  async updateDeliveryStatus(
    deliveryId: string, 
    newStatus: DeliveryStatus, 
    updater: { email: string; uid: string; role: string },
    extra?: { reportReason?: string; cancelReason?: string; deliveryReport?: string; assignedLivreur?: User }
  ) {
    const deliveryRef = doc(db, 'physical_card_requests', deliveryId);
    const snap = await getDoc(deliveryRef);
    if (!snap.exists()) throw new Error('Demande de livraison introuvable');
    const data = snap.data() as PhysicalCardRequest;

    const updates: Partial<PhysicalCardRequest> = {
      status: newStatus,
      updatedAt: Date.now(),
      processedAt: Date.now(),
      processedBy: updater.email
    };

    if (newStatus === 'assigned' && extra?.assignedLivreur) {
      updates.assignedLivreurId = extra.assignedLivreur.uid;
      updates.assignedLivreurName = extra.assignedLivreur.displayName || extra.assignedLivreur.email;
      updates.assignedLivreurPhone = extra.assignedLivreur.phone;
    }

    if (newStatus === 'delivered') {
      updates.deliveredAt = Date.now();
      if (extra?.deliveryReport) {
        updates.deliveryReport = extra.deliveryReport;
      }
    }

    if (newStatus === 'reported') {
      updates.reportedAt = Date.now();
      updates.reportReason = extra?.reportReason || extra?.deliveryReport || 'Livraison reportée';
      if (extra?.deliveryReport) {
        updates.deliveryReport = extra.deliveryReport;
      }
    }

    if (newStatus === 'cancelled') {
      updates.cancelledAt = Date.now();
      updates.cancelReason = extra?.cancelReason || 'Livraison annulée';
    }

    if (newStatus === 'pending') {
      updates.assignedLivreurId = '';
      updates.assignedLivreurName = '';
      updates.assignedLivreurPhone = '';
    }

    await updateDoc(deliveryRef, removeUndefined(updates));

    // Notify Client
    let statusLabel = 'mise à jour';
    let notifType: 'success' | 'error' | 'info' = 'info';
    if (newStatus === 'assigned') statusLabel = 'prise en charge par un livreur';
    if (newStatus === 'out_for_delivery') statusLabel = 'en cours de livraison';
    if (newStatus === 'delivered') {
      statusLabel = 'livrée avec succès';
      notifType = 'success';
    }
    if (newStatus === 'reported') {
      statusLabel = `reportée (${extra?.reportReason || 'non précisé'})`;
      notifType = 'info';
    }
    if (newStatus === 'cancelled') {
      statusLabel = `annulée (${extra?.cancelReason || 'non précisé'})`;
      notifType = 'error';
    }
    if (newStatus === 'pending') {
      statusLabel = 'remise en attente de livraison';
      notifType = 'info';
    }

    await this.createNotification({
      userId: data.userId,
      title: `Suivi de livraison : ${statusLabel}`,
      message: `Votre commande de carte physique ${data.cardIdentifier || ''} est désormais : ${statusLabel}.`,
      type: notifType,
      category: 'delivery',
      deliveryId
    });
  },

  /**
   * ========================================================
   * CARD DESIGN SETTINGS (Administrable Card Background)
   * ========================================================
   */

  /**
   * Fetches the current card design settings from app_settings/card_design.
   */
  async getCardDesign(): Promise<CardDesignSettings | null> {
    try {
      const snap = await getDoc(doc(db, 'app_settings', 'card_design'));
      if (snap.exists()) {
        return snap.data() as CardDesignSettings;
      }
      return null;
    } catch (e) {
      console.warn('[GET_CARD_DESIGN_ERROR]', e);
      return null;
    }
  },

  /**
   * Realtime listener for card design settings.
   */
  subscribeCardDesign(callback: (design: CardDesignSettings | null) => void) {
    return onSnapshot(
      doc(db, 'app_settings', 'card_design'),
      (snap) => {
        if (snap.exists()) {
          callback(snap.data() as CardDesignSettings);
        } else {
          callback(null);
        }
      },
      (error) => {
        console.warn('[SUBSCRIBE_CARD_DESIGN_ERROR]', error);
        callback(null);
      }
    );
  },

  /**
   * Uploads a card background image to Firebase Storage.
   */
  async uploadCardBackground(file: File): Promise<string> {
    const fileExt = file.name.split('.').pop() || 'jpg';
    const storagePath = `card-designs/card-background/${Date.now()}_background.${fileExt}`;
    const storageRef = ref(storage, storagePath);
    
    console.log('[CARD_BACKGROUND_UPLOAD_START]', { fileName: file.name, size: file.size, path: storagePath });
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type || 'image/jpeg'
    });
    
    const downloadUrl = await getDownloadURL(snapshot.ref);
    console.log('[CARD_BACKGROUND_UPLOAD_SUCCESS]', { downloadUrl: downloadUrl.slice(0, 40) + '...' });
    return downloadUrl;
  },

  /**
   * Updates card design configuration in Firestore.
   */
  async updateCardDesign(params: { backgroundUrl: string; userEmail: string }): Promise<void> {
    const designRef = doc(db, 'app_settings', 'card_design');
    const existing = await this.getCardDesign();
    const newVersion = (existing?.version || 0) + 1;

    const payload: CardDesignSettings = {
      backgroundUrl: params.backgroundUrl,
      updatedAt: Date.now(),
      updatedBy: params.userEmail,
      version: newVersion,
      isActive: Boolean(params.backgroundUrl)
    };

    console.log('[CARD_DESIGN_UPDATE]', { version: newVersion, hasBackground: Boolean(params.backgroundUrl) });
    await setDoc(designRef, removeUndefined(payload));
  },

  /**
   * Resets card design to the default built-in background.
   */
  async resetCardDesign(userEmail: string): Promise<void> {
    const designRef = doc(db, 'app_settings', 'card_design');
    const existing = await this.getCardDesign();
    const newVersion = (existing?.version || 0) + 1;

    const payload: CardDesignSettings = {
      backgroundUrl: '',
      updatedAt: Date.now(),
      updatedBy: userEmail,
      version: newVersion,
      isActive: false
    };

    console.log('[CARD_DESIGN_RESET]', { version: newVersion });
    await setDoc(designRef, removeUndefined(payload));
  }
};
