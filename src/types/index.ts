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
  updatedAt?: number;
  reviewedAt?: number;
  reviewedBy?: string;
}

export interface CardPurchaseRequest {
  id: string;
  userId: string;
  fullName?: string;
  userName?: string;
  userEmail?: string;
  email?: string;
  phone?: string;
  userPhone?: string;
  cardType?: string;
  cardName?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  transactionReference?: string;
  paymentReference?: string;
  proofUrl?: string;
  paymentProofUrl?: string;
  clientNote?: string;
  status?: string;
  rejectionReason?: string;
  assignedCardId?: string;
  processedAt?: number;
  processedBy?: string;
  createdAt?: number;
  updatedAt?: number;
  [key:string]: unknown;
}

export interface UserCard {
  id:string;
  userId:string;
  [key:string]:unknown;
}

export interface PhysicalCardRequest {
  id:string;
  userId:string;
  createdAt?:number;
  [key:string]:unknown;
}

export interface AppLog {
  id?:string;
  userId?:string;
  timestamp:number;
  [key:string]:unknown;
}
