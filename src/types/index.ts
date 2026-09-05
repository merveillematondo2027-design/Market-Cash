export type UserRole = 'admin_general' | 'agent_administratif' | 'chef_agence' | 'designer_graphique' | 'livreur' | 'client' | 'agent' | 'marchand';
export type KycStatus = 'not_started' | 'pending' | 'approved' | 'rejected';
export type AccountUpgradeType = 'agent' | 'marchand' | 'developer_direct' | 'api_partner';
export type BusinessAccountType = 'merchant' | 'agent' | 'direct_developer' | 'api_provider';
export type AccountStatus = 'active' | 'suspended' | 'blocked' | 'deleted' | 'banned';

export interface User {
  uid: string;
  displayName: string;
  email: string;
  phone: string;
  avatar: string;
  role: UserRole;
  businessAccountType?: BusinessAccountType;
  developerEnabled?: boolean;
  apiProviderEnabled?: boolean;
  agencyId?: string;
  agencyName?: string;
  pinHash: string;
  temporaryPinHash?: string;
  mustChangePin?: boolean;
  pinChangedAt?: number;
  useBiometrics?: boolean;
  kycStatus?: KycStatus;
  accountStatus?: AccountStatus;
  suspendedUntil?: number;
  deletedAt?: number;
  deletedBy?: string;
  bannedAt?: number;
  bannedBy?: string;
  adminNote?: string;
  securityResetAt?: number;
  accountStatusUpdatedAt?: number;
  accountStatusUpdatedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface KycRequest {
  userId: string;
  fullName: string;
  phone: string;
  birthDate: string;
  country: string;
  city: string;
  address: string;
  documentType: 'national_id' | 'passport' | 'driving_licence' | 'other';
  documentNumber: string;
  documentFrontUrl?: string;
  documentBackUrl?: string;
  selfieUrl?: string;
  status: KycStatus;
  rejectionReason?: string;
  createdAt: number;
  updatedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
}

export interface AccountUpgradeRequest {
  id?: string;
  userId: string;
  requestedType: AccountUpgradeType;
  legalName: string;
  tradeName?: string;
  activity: string;
  phone: string;
  email?: string;
  city: string;
  address: string;
  businessType?: string;
  registrationNumber?: string;
  taxNumber?: string;
  estimatedMonthlyVolume?: string;
  pointName?: string;
  floatEstimate?: string;
  openingHours?: string;
  reason?: string;
  developerId?: string;
  website?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  updatedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  rejectionReason?: string;
}

export type CardStatus = 'available' | 'disabled' | 'active' | 'blocked';
export type CardType = 'virtual' | 'physical';
export type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'other';
export type CardSaleStatus = 'available' | 'reserved' | 'pending' | 'confirmed' | 'sold' | 'cancelled';
export type CardPrintStatus = 'pending' | 'printed';
export type DeliveryStatus = 'pending' | 'assigned' | 'in_progress' | 'out_for_delivery' | 'delivered' | 'reported' | 'cancelled';

export interface CardCatalog { id:string; name:string; description:string; price:number; currency:string; imageUrl:string; status:'available'|'disabled'; type:CardType; network:CardNetwork; createdAt:number; updatedAt:number; }
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface CardPurchaseRequest {
  id:string; userId:string; fullName:string; userName?:string; userEmail?:string; phone:string; userPhone?:string; clientName?:string; clientEmail?:string; clientPhone?:string; cardId?:string; cardType?:'virtual'|'physical'; isUrgent?:boolean; physicalOption?:'none'|'normal'|'urgent'; printRequested?:boolean; urgentProcessing?:boolean; identityRequired?:boolean; identityProofUrl?:string; identityProofFileName?:string; identityVerified?:boolean; pricingBreakdown?:{cardPrice:number;printingPrice:number;urgencyFee:number}; cardName?:string; amount:number; price?:number; currency?:string; paymentMethod:string; transactionReference:string; paymentReference?:string; proofUrl:string; paymentProofUrl?:string; proofFileName:string; note?:string; clientNote?:string; status:RequestStatus; assignedCardId?:string; rejectionReason?:string; createdAt:number; updatedAt?:number; processedAt?:number; processedBy?:string; agencyId?:string; agencyName?:string;
}

export type PhysicalCardRequestStatus = DeliveryStatus;
export interface PhysicalCardRequest {
  id:string; userId:string; userName?:string; userEmail?:string; userPhone?:string; clientName?:string; clientEmail?:string; clientPhone?:string; cardId:string; cardIdentifier?:string; isUrgent?:boolean; cardName?:string; cardNumberMasked?:string; cardHolder?:string; deliveryDate:string; deliveryAddress:string; deliveryCity?:string; whatsapp:string; whatsappNumber?:string; latitude?:number; longitude?:number; location?:{lat:number;lng:number;accuracy?:number;address?:string}; status:DeliveryStatus; assignedLivreurId?:string; assignedLivreurName?:string; assignedLivreurPhone?:string; deliveryNote?:string; deliveryReport?:string; reportReason?:string; cancelReason?:string; agencyId?:string; agencyName?:string; createdAt:number; updatedAt?:number; processedAt?:number; processedBy?:string; deliveredAt?:number; reportedAt?:number; cancelledAt?:number;
}

export interface UserCard {
  id?:string; cardId:string; cardIdentifier?:string; isUrgent?:boolean; catalogCardId?:string; userId:string; userEmail?:string; userName?:string; cardNumber:string; cardHolder:string; cardHolderName?:string; expiryStart?:string; expiryEnd?:string; expiry?:string; cvv:string; rechargeNumber?:string; network:CardNetwork; type:CardType; status:'active'|'blocked'|'disabled'; qrData?:string; validFrom?:string; validUntil?:string; saleStatus?:CardSaleStatus; printStatus?:CardPrintStatus; printFormat?:'PVC'; printReady?:boolean; frontImageUrl?:string; backImageUrl?:string; soldAt?:number; soldBy?:string; soldByAgencyId?:string; soldByAgencyName?:string; agencyId?:string; agencyName?:string; isPhysical?:boolean; printedAt?:number; printedBy?:string; cardOrder?:number; createdAt:number; updatedAt:number;
}

export interface Notification { id:string; userId:string; title:string; message:string; type:'success'|'error'|'info'; read:boolean; createdAt:number; category?:'card_status'|'general'|'security'|'delivery'|'printing'; requestId?:string; cardId?:string; cardName?:string; cardIdentifier?:string; isUrgent?:boolean; deliveryId?:string; }
export interface PaymentMethodItem { id:string; network:string; number:string; beneficiary:string; active:boolean; order:number; instructions?:string; createdAt:number; updatedAt:number; }
export interface HelpArticle { id:string; question:string; answer:string; category:string; active:boolean; order:number; videoUrls?:{facebook?:string;instagram?:string;tiktok?:string;youtube?:string;[key:string]:string|undefined}; createdAt:number; updatedAt:number; }
export interface CardDesignSettings { backgroundUrl:string; designJson?:string; updatedAt:number; updatedBy?:string; version:number; isActive:boolean; }
export type LogLevel='INFO'|'SUCCESS'|'WARNING'|'ERROR'|'CRITICAL';
export type LogCategory='AUTH'|'FIRESTORE'|'STORAGE'|'PAYMENT'|'CARD'|'STOCK'|'PHYSICAL_CARD'|'DELIVERY'|'USER'|'NOTIFICATION'|'HELP'|'DESIGN'|'SECURITY'|'UI'|'SYSTEM';
export interface AppLog { id?:string; timestamp:number; level:LogLevel; category:LogCategory; event:string; message:string; userId?:string; userEmail?:string; userRole?:string; route?:string; operation?:string; collection?:string; documentId?:string; errorCode?:string; errorName?:string; stack?:string; metadata?:any; success?:boolean; }
