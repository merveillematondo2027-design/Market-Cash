import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';
import { WalletCurrency } from '../types/wallet';

export interface RechargeClientLookup {
  userId: string;
  displayName: string;
  phone: string;
  rechargeNumber: string;
  balances: Record<WalletCurrency, number>;
}
export interface WalletServerSnapshot {
  rechargeNumber: string;
  isAgent: boolean;
  wallets: Record<WalletCurrency, {
    id: string;
    userId: string;
    accountType: string;
    currency: WalletCurrency;
    availableBalance: number;
    ledgerBalance: number;
    heldBalance: number;
    status: string;
    rechargeNumber: string;
  }>;
}
export interface MarketCashIdentity { marketCashId: string; }
export interface MarketCashRecipient { userId: string; marketCashId: string; displayName: string; }
export interface InternalCardSummary {
  cardId: string;
  cardIdentifier: string;
  cardHolder: string;
  maskedNumber: string;
  status: string;
  balances: Partial<Record<WalletCurrency, number>>;
}

const call = <TReq,TRes>(name:string) => httpsCallable<TReq,TRes>(functions,name);
export const agentWalletService = {
  ensureWalletProfile: async() => (await call<Record<string,never>,WalletServerSnapshot & {ok:boolean}>('ensureWalletProfile')({})).data,
  getMyWallets: async() => (await call<Record<string,never>,WalletServerSnapshot>('getMyWallets')({})).data,
  getMyMarketCashIdentity: async() => (await call<Record<string,never>,MarketCashIdentity>('getMyMarketCashIdentity')({})).data,
  lookupMarketCashRecipient: async(marketCashId:string) => (await call<{marketCashId:string},MarketCashRecipient>('lookupMarketCashRecipient')({marketCashId})).data,
  transferMarketCash: async(input:{marketCashId:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('marketCashTransfer')(input)).data,
  getMyInternalCards: async() => (await call<Record<string,never>,{cards:InternalCardSummary[]}>('getMyInternalCards')({})).data.cards,
  fundInternalCard: async(input:{cardId:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('walletToInternalCard')(input)).data,
  getMyWalletHistory: async() => (await call<Record<string,never>,{transactions:any[]}>('getMyWalletHistory')({})).data.transactions,
  lookupClient: async(rechargeNumber:string) => (await call<{rechargeNumber:string},RechargeClientLookup>('lookupRechargeClient')({rechargeNumber})).data,
  cashIn: async(input:{rechargeNumber:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('agentCashIn')(input)).data,
  cashOut: async(input:{rechargeNumber:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('agentCashOut')(input)).data,
  getHistory: async() => (await call<Record<string,never>,{transactions:any[]}>('getAgentHistory')({})).data.transactions,
  registerAgent: async(agentUid:string) => (await call<{agentUid:string},{ok:boolean}>('adminRegisterAgent')({agentUid})).data,
  fundAgent: async(input:{agentUid:string;currency:WalletCurrency;amount:number;reason:string}) => (await call<typeof input,{ok:boolean;transactionId:string}>('adminFundAgentFloat')(input)).data,
};
