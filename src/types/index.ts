export type UserRole = 'admin_general' | 'chef_agence' | 'designer_graphique' | 'livreur' | 'client';

export interface User {
  uid: string;
  displayName: string;
  email: string;
  phone: string;
  avatar: string;
  role: UserRole;
  agencyId?: string;
  agencyName?: string;
  pinHash: string; // Store hashed/encrypted PIN (SHA256) - never in plaintext
  useBiometrics?: boolean; // Utiliser l'empreinte digitale pour afficher les informations de carte
  createdAt: number;
  updatedAt: number;
}

export type CardStatus = 'available' | 'disabled' | 'active' | 'blocked';
export type CardType = 'virtual' | 'physical';
export type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'other';

export type CardSaleStatus = 'pending' | 'confirmed' | 'sold' | 'cancelled';
export type CardPrintStatus = 'pending' | 'printed';
export type DeliveryStatus = 'pending' | 'assigned' | 'in_progress' | 'out_for_delivery' | 'delivered' | 'reported' | 'cancelled';

export interface CardCatalog {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  status: 'available' | 'disabled';
  type: CardType;
  network: CardNetwork;
  createdAt: number;
  updatedAt: number;
}

export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface CardPurchaseRequest {
  id: string;
  userId: string;
  fullName: string;
  userName?: string; // Compatibility
  userEmail?: string;
  phone: string;
  userPhone?: string; // Compatibility
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  cardId?: string;
  cardType?: 'virtual' | 'physical';
  cardName?: string;
  amount: number;
  price?: number; // Compatibility
  currency?: string;
  paymentMethod: string;
  transactionReference: string;
  paymentReference?: string; // Compatibility
  proofUrl: string;
  paymentProofUrl?: string; // Compatibility
  proofFileName: string;
  note?: string;
  clientNote?: string; // Compatibility
  status: RequestStatus;
  assignedCardId?: string;
  rejectionReason?: string;
  createdAt: number;
  updatedAt?: number;
  processedAt?: number;
  processedBy?: string;
  agencyId?: string;
  agencyName?: string;
}

export type PhysicalCardRequestStatus = DeliveryStatus;

export interface PhysicalCardRequest {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  cardId: string;
  cardIdentifier?: string; // MC-001-YYYYMMDD
  cardName?: string;
  cardNumberMasked?: string;
  cardHolder?: string;
  deliveryDate: string; // Jour/date de livraison souhaité (ex: 2026-08-25)
  deliveryAddress: string; // Adresse complète de livraison
  deliveryCity?: string;
  whatsapp: string; // Numéro WhatsApp du client (obligatoire)
  whatsappNumber?: string; // Alias de compatibilité
  latitude?: number; // Coordonnée GPS
  longitude?: number; // Coordonnée GPS
  location?: {
    lat: number;
    lng: number;
    accuracy?: number;
    address?: string;
  }; // Localisation géographique obligatoire
  status: DeliveryStatus;
  assignedLivreurId?: string;
  assignedLivreurName?: string;
  assignedLivreurPhone?: string;
  deliveryNote?: string;
  deliveryReport?: string;
  reportReason?: string;
  cancelReason?: string;
  agencyId?: string;
  agencyName?: string;
  createdAt: number;
  updatedAt?: number;
  processedAt?: number;
  processedBy?: string;
  deliveredAt?: number;
  reportedAt?: number;
  cancelledAt?: number;
}

export interface UserCard {
  id?: string;
  cardId: string; // unique ID of this assigned card
  cardIdentifier?: string; // MC-001-YYYYMMDD format (ex: "MC-001-20260823")
  catalogCardId?: string; // ID from CardCatalog
  userId: string;
  userEmail?: string;
  userName?: string;
  cardNumber: string; // stocké sans espaces (ex: "4585020000258400")
  cardHolder: string; // Nom affiché sur la carte (ex: "Mardo Mungwele")
  cardHolderName?: string; // Alias
  expiryStart?: string; // Expiration début (ex: "02/27")
  expiryEnd?: string; // Expiration fin (ex: "08/27")
  expiry?: string; // Compatibilité pour les cartes existantes (ex: "08/27")
  cvv: string; // CVV (ex: "551")
  rechargeNumber?: string; // Numéro de recharge renseigné par l'Admin
  network: CardNetwork;
  type: CardType;
  status: 'active' | 'blocked';
  
  qrData?: string; // QR code payload (ex: "MC:MC-001-20260823:4585020000258400")
  validFrom?: string; // Format MM/YY
  validUntil?: string; // Format MM/YY
  
  // Production PVC & Library Workflow fields
  saleStatus?: CardSaleStatus; // 'confirmed' | 'pending' | 'cancelled'
  printStatus?: CardPrintStatus; // 'pending' | 'printed'
  printFormat?: 'PVC';
  printReady?: boolean;
  frontImageUrl?: string; // URL / Data URL of generated PVC front card
  backImageUrl?: string;
  soldAt?: number;
  soldBy?: string;
  soldByAgencyId?: string;
  soldByAgencyName?: string;
  agencyId?: string;
  agencyName?: string;
  isPhysical?: boolean;
  printedAt?: number;
  printedBy?: string;
  cardOrder?: number;
  
  createdAt: number;
  updatedAt: number;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info';
  read: boolean;
  createdAt: number;
  category?: 'card_status' | 'general' | 'security' | 'delivery' | 'printing';
  requestId?: string;
  cardId?: string;
  cardName?: string;
  cardIdentifier?: string;
  deliveryId?: string;
}

export interface PaymentMethodItem {
  id: string;
  network: string; // 'M-Pesa' | 'Airtel Money' | 'Orange Money' | 'Afrimoney' | 'Virement Bancaire' | string
  number: string;
  beneficiary: string;
  active: boolean;
  order: number;
  instructions?: string;
  createdAt: number;
  updatedAt: number;
}

export interface HelpArticle {
  id: string;
  question: string;
  answer: string;
  category: string;
  active: boolean;
  order: number;
  videoUrls?: {
    facebook?: string;
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    [key: string]: string | undefined;
  };
  createdAt: number;
  updatedAt: number;
}

export interface CardDesignSettings {
  backgroundUrl: string;
  updatedAt: number;
  updatedBy?: string;
  version: number;
  isActive: boolean;
}


