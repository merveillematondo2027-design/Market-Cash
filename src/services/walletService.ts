import { WalletAccount, WalletPartnerRequest, WalletTransaction } from '../types/wallet';

const walletIdForUser = (uid: string) => `wallet_${uid}`;
const localPaymentIdForUser = (uid: string) => `MCW-${uid.slice(0, 10).toUpperCase()}`;

/**
 * Frontend boundary for the Market-Cash wallet.
 *
 * The browser is deliberately NOT allowed to create balances, ledger entries,
 * holds or partner settlements. Those operations belong to the future trusted
 * Market-Cash backend. GMH APIs is reserved as the external partner
 * orchestration engine behind that backend.
 */
export const walletService = {
  walletIdForUser,

  getWalletPreview(uid: string): WalletAccount {
    const now = Date.now();
    return {
      id: walletIdForUser(uid),
      userId: uid,
      currency: 'USD',
      availableBalance: 0,
      ledgerBalance: 0,
      heldBalance: 0,
      status: 'active',
      localPaymentId: localPaymentIdForUser(uid),
      createdAt: now,
      updatedAt: now,
    };
  },

  getTransactionsPreview(): WalletTransaction[] {
    return [];
  },

  /**
   * Contract reserved for the trusted backend -> GMH APIs orchestration path.
   * Never replace this with direct Firestore balance writes from React.
   */
  async createPartnerRequest(_input: Omit<WalletPartnerRequest, 'id' | 'status' | 'integrationEngine' | 'createdAt' | 'updatedAt'>): Promise<never> {
    throw new Error('GMH_API_BACKEND_REQUIRED');
  },
};
