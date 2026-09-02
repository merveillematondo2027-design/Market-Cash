export type WalletCurrency = 'USD' | 'CDF';
export type WalletStatus = 'active' | 'suspended' | 'blocked';
export type WalletTransactionType = 'topup' | 'payment' | 'transfer' | 'withdrawal' | 'exchange' | 'refund' | 'hold' | 'release' | 'adjustment';
export type WalletTransactionStatus = 'created' | 'pending' | 'authorized' | 'settled' | 'failed' | 'reversed';
export type WalletRail = 'market_cash_local' | 'qr' | 'nfc' | 'agent_terminal' | 'mobile_money' | 'bank' | 'visa';
export type WalletRequestKind = 'topup' | 'cash_in' | 'cash_out' | 'local_transfer' | 'merchant_payment' | 'bank_transfer' | 'exchange' | 'partner_payment';
export type WalletRequestStatus = 'draft' | 'awaiting_confirmation' | 'waiting_mht_api' | 'processing' | 'settled' | 'failed' | 'cancelled' | 'reversed';

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

export interface WalletPartnerRequest {
  id?: string;
  userId: string;
  walletId: string;
  kind: WalletRequestKind;
  amount: number;
  currency: WalletCurrency;
  rail: WalletRail;
  provider?: string;
  phone?: string;
  merchantId?: string;
  destination?: string;
  status: WalletRequestStatus;
  integrationEngine: 'MHT_APIS';
  idempotencyKey?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WalletApiRoute {
  action: WalletRequestKind;
  rail: WalletRail;
  requiresPartnerApi: boolean;
  preferredEngine: 'MHT_APIS' | 'MARKET_CASH_INTERNAL';
  futureEndpoint: string;
  description: string;
}

/**
 * Market-Cash physical card is a closed-loop Market-Cash credential, NOT Visa.
 * It is linked to one wallet currency and initially has no expiry date.
 * Sensitive values must eventually be generated/stored by a trusted backend,
 * never exposed in logs or created by the browser.
 */
export interface MarketCashPhysicalCredential {
  id: string;
  userId: string;
  walletId: string;
  currency: WalletCurrency;
  holderName: string;
  cardNumber: string; // 16 digits, Market-Cash namespace
  securityCode: string; // 3 digits; secret, never log
  expiresAt: null;
  network: 'market_cash';
  type: 'physical';
  qrPayload: string;
  nfcMode: 'market_cash_closed_loop';
  status: 'planned' | 'active' | 'blocked';
  createdAt: number;
  updatedAt: number;
}

export interface MarketCashVisaCredential {
  userId: string;
  walletId: string;
  type: 'virtual';
  network: 'visa';
  status: 'planned' | 'active' | 'blocked';
  providerManaged: true;
}
