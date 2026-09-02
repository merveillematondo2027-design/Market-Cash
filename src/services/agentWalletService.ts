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
const call = <TReq,TRes>(name:string) => httpsCallable<TReq,TRes>(functions,name);
export const agentWalletService = {
  ensureWalletProfile: async() => (await call<Record<string,never>,WalletServerSnapshot & {ok:boolean}>('ensureWalletProfile')({})).data,
  getMyWallets: async() => (await call<Record<string,never>,WalletServerSnapshot>('getMyWallets')({})).data,
  lookupClient: async(rechargeNumber:string) => (await call<{rechargeNumber:string},RechargeClientLookup>('lookupRechargeClient')({rechargeNumber})).data,
  cashIn: async(input:{rechargeNumber:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('agentCashIn')(input)).data,
  cashOut: async(input:{rechargeNumber:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('agentCashOut')(input)).data,
  getHistory: async() => (await call<Record<string,never>,{transactions:any[]}>('getAgentHistory')({})).data.transactions,
  registerAgent: async(agentUid:string) => (await call<{agentUid:string},{ok:boolean}>('adminRegisterAgent')({agentUid})).data,
  fundAgent: async(input:{agentUid:string;currency:WalletCurrency;amount:number;reason:string}) => (await call<typeof input,{ok:boolean;transactionId:string}>('adminFundAgentFloat')(input)).data,
};
