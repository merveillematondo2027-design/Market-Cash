export type WalletCurrency = 'USD' | 'CDF';
export type WalletStatus = 'active' | 'suspended' | 'blocked';
export type WalletTransactionType = 'topup' | 'payment' | 'transfer' | 'refund' | 'hold' | 'release' | 'adjustment';
export type WalletTransactionStatus = 'created' | 'pending' | 'authorized' | 'settled' | 'failed' | 'reversed';
export type WalletRail = 'market_cash_local' | 'agent_terminal' | 'mobile_money' | 'bank' | 'visa';

export interface WalletAccount {
  id: string;
  userId: string;
  currency: WalletCurrency;
  availableBalance: number;
  ledgerBalance: number;
  heldBalance: number;
  status: WalletStatus;
  localPaymentId: string;
  createdAt: number;
  updatedAt: number;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  userId: string;
  type: WalletTransactionType;
  rail: WalletRail;
  status: WalletTransactionStatus;
  amount: number;
  currency: WalletCurrency;
  reference: string;
  description?: string;
  provider?: string;
  providerReference?: string;
  createdAt: number;
  updatedAt: number;
}

export type WalletRequestKind = 'topup' | 'cash_in' | 'cash_out' | 'partner_payment';
export type WalletRequestStatus = 'draft' | 'waiting_gmh_api' | 'processing' | 'settled' | 'failed' | 'cancelled';

export interface WalletPartnerRequest {
  id?: string;
  userId: string;
  walletId: string;
  kind: WalletRequestKind;
  amount: number;
  currency: WalletCurrency;
  rail: Exclude<WalletRail, 'market_cash_local'>;
  provider?: string;
  phone?: string;
  status: WalletRequestStatus;
  integrationEngine: 'GMH_APIS';
  createdAt: number;
  updatedAt: number;
}

export interface MarketCashPhysicalCredential {
  userId: string;
  walletId: string;
  localPaymentId: string;
  qrPayload: string;
  nfcMode: 'market_cash_closed_loop';
  status: 'planned' | 'active' | 'blocked';
}

export interface MarketCashVisaCredential {
  userId: string;
  walletId: string;
  type: 'virtual';
  network: 'visa';
  status: 'planned' | 'active' | 'blocked';
  providerManaged: true;
}
