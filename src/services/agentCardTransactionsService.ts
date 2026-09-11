import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';
import type { WalletCurrency } from '../types/wallet';
const call=<TReq,TRes>(name:string)=>httpsCallable<TReq,TRes>(functions,name);
export const agentCardTransactionsService={
 deposit:async(input:{marketCashId:string;currency:WalletCurrency;amount:number;cvv:string;idempotencyKey:string})=>(await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('agentDepositWithCvvV3')(input)).data,
 withdrawToAgent:async(input:{cardId:string;agentId:string;amount:number;cvv:string;idempotencyKey:string})=>(await call<typeof input,{ok:boolean;reference:string;transactionId:string;agentId:string;currency:WalletCurrency;amount:number}>('clientWithdrawLocalCardToAgentV3')(input)).data,
};
