import { WalletAccount, WalletApiRoute, WalletCurrency, WalletPartnerRequest, WalletTransaction } from '../types/wallet';

const walletIdForUser = (uid: string, currency: WalletCurrency) => `wallet_${currency.toLowerCase()}_${uid}`;
const localPaymentIdForUser = (uid: string) => `MCW-${uid.slice(0, 10).toUpperCase()}`;

export const WALLET_API_ROUTES: WalletApiRoute[] = [
  { action: 'local_transfer', rail: 'market_cash_local', requiresPartnerApi: false, preferredEngine: 'MARKET_CASH_INTERNAL', futureEndpoint: '/v1/wallet/transfers', description: 'Transfert Market-Cash vers Market-Cash.' },
  { action: 'merchant_payment', rail: 'qr', requiresPartnerApi: false, preferredEngine: 'MARKET_CASH_INTERNAL', futureEndpoint: '/v1/wallet/payments/qr', description: 'Paiement local par QR Market-Cash.' },
  { action: 'merchant_payment', rail: 'nfc', requiresPartnerApi: false, preferredEngine: 'MARKET_CASH_INTERNAL', futureEndpoint: '/v1/wallet/payments/nfc', description: 'Paiement local par NFC Market-Cash.' },
  { action: 'topup', rail: 'mobile_money', requiresPartnerApi: true, preferredEngine: 'MHT_APIS', futureEndpoint: '/v1/wallet/topups/mobile-money', description: 'Recharge M-Pesa/Mobile Money orchestrée par MHT APIs.' },
  { action: 'cash_in', rail: 'agent_terminal', requiresPartnerApi: false, preferredEngine: 'MARKET_CASH_INTERNAL', futureEndpoint: '/v1/wallet/agents/cash-in', description: 'Dépôt cash via agent ou terminal Market-Cash.' },
  { action: 'cash_out', rail: 'agent_terminal', requiresPartnerApi: false, preferredEngine: 'MARKET_CASH_INTERNAL', futureEndpoint: '/v1/wallet/agents/cash-out', description: 'Retrait cash via agent ou terminal Market-Cash.' },
  { action: 'cash_out', rail: 'mobile_money', requiresPartnerApi: true, preferredEngine: 'MHT_APIS', futureEndpoint: '/v1/wallet/withdrawals/mobile-money', description: 'Retrait vers Mobile Money via MHT APIs.' },
  { action: 'bank_transfer', rail: 'bank', requiresPartnerApi: true, preferredEngine: 'MHT_APIS', futureEndpoint: '/v1/wallet/transfers/bank', description: 'Transfert bancaire via partenaire connecté à MHT APIs.' },
  { action: 'exchange', rail: 'bank', requiresPartnerApi: true, preferredEngine: 'MHT_APIS', futureEndpoint: '/v1/wallet/exchange', description: 'Conversion USD/CDF avec taux fourni par backend/partenaire.' },
  { action: 'partner_payment', rail: 'visa', requiresPartnerApi: true, preferredEngine: 'MHT_APIS', futureEndpoint: '/v1/wallet/visa/authorize', description: 'Paiement international Visa virtuelle via issuer partenaire.' },
];

/**
 * Frontend boundary for Market-Cash wallets.
 * The browser must never create money, settle partner operations or mutate ledger balances.
 * Trusted operations belong to the Market-Cash backend. External partner calls are routed
 * through MHT APIs whenever an external provider is required.
 */
export const walletService = {
  walletIdForUser,

  getWalletPreview(uid: string, currency: WalletCurrency = 'USD'): WalletAccount {
    const now = Date.now();
    return {
      id: walletIdForUser(uid, currency),
      userId: uid,
      currency,
      availableBalance: 0,
      ledgerBalance: 0,
      heldBalance: 0,
      status: 'active',
      localPaymentId: localPaymentIdForUser(uid),
      createdAt: now,
      updatedAt: now,
    };
  },

  getWalletsPreview(uid: string): Record<WalletCurrency, WalletAccount> {
    return { USD: this.getWalletPreview(uid, 'USD'), CDF: this.getWalletPreview(uid, 'CDF') };
  },

  getTransactionsPreview(_currency?: WalletCurrency): WalletTransaction[] {
    return [];
  },

  getApiRoute(action: WalletPartnerRequest['kind'], rail?: WalletPartnerRequest['rail']) {
    return WALLET_API_ROUTES.find(route => route.action === action && (!rail || route.rail === rail));
  },

  async createPartnerRequest(_input: Omit<WalletPartnerRequest, 'id' | 'status' | 'integrationEngine' | 'createdAt' | 'updatedAt'>): Promise<never> {
    throw new Error('MHT_API_BACKEND_REQUIRED');
  },
};
