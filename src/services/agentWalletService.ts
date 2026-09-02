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

const call = <TReq,TRes>(name:string) => httpsCallable<TReq,TRes>(functions,name);

export const agentWalletService = {
  ensureWalletProfile: () => call<Record<string,never>,{ok:boolean;rechargeNumber:string}>('ensureWalletProfile')({}),
  lookupClient: async(rechargeNumber:string) => (await call<{rechargeNumber:string},RechargeClientLookup>('lookupRechargeClient')({rechargeNumber})).data,
  cashIn: async(input:{rechargeNumber:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('agentCashIn')(input)).data,
  cashOut: async(input:{rechargeNumber:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('agentCashOut')(input)).data,
  fundAgent: async(input:{agentUid:string;currency:WalletCurrency;amount:number;reason:string}) => (await call<typeof input,{ok:boolean;transactionId:string}>('adminFundAgentFloat')(input)).data,
};
