import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { WalletAccount, WalletPartnerRequest, WalletTransaction } from '../types/wallet';

const walletIdForUser = (uid: string) => `wallet_${uid}`;
const localPaymentIdForUser = (uid: string) => `MCW-${uid.slice(0, 10).toUpperCase()}`;

export const walletService = {
  walletIdForUser,

  async ensureWallet(uid: string): Promise<WalletAccount> {
    const walletId = walletIdForUser(uid);
    const ref = doc(db, 'wallets', walletId);
    const snap = await getDoc(ref);

    if (snap.exists()) return snap.data() as WalletAccount;

    const now = Date.now();
    const wallet: WalletAccount = {
      id: walletId,
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

    await setDoc(ref, wallet);
    return wallet;
  },

  subscribeWallet(uid: string, onValue: (wallet: WalletAccount | null) => void, onError?: (error: Error) => void) {
    const ref = doc(db, 'wallets', walletIdForUser(uid));
    return onSnapshot(ref, snap => onValue(snap.exists() ? (snap.data() as WalletAccount) : null), error => onError?.(error));
  },

  subscribeTransactions(uid: string, onValue: (items: WalletTransaction[]) => void, onError?: (error: Error) => void) {
    const q = query(
      collection(db, 'wallet_transactions'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(30),
    );
    return onSnapshot(q, snap => onValue(snap.docs.map(d => ({ ...d.data(), id: d.id } as WalletTransaction))), error => onError?.(error));
  },

  /**
   * Creates an orchestration request only. This NEVER credits or debits a wallet.
   * GMH APIs (future trusted backend) is the reserved execution engine for partner rails.
   */
  async createPartnerRequest(input: Omit<WalletPartnerRequest, 'id' | 'status' | 'integrationEngine' | 'createdAt' | 'updatedAt'>) {
    const ref = doc(collection(db, 'wallet_requests'));
    const now = Date.now();
    const request: WalletPartnerRequest = {
      ...input,
      id: ref.id,
      status: 'waiting_gmh_api',
      integrationEngine: 'GMH_APIS',
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(ref, request);
    return request;
  },
};
