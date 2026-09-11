import{httpsCallable}from'firebase/functions';
import{functions}from'../firebase/config';
export type TreasuryCurrency='USD'|'CDF';
export interface TreasuryWallet{id:string;currency:TreasuryCurrency;availableBalance:number;ledgerBalance:number;heldBalance:number;status:string;}
export interface TreasurySnapshot{wallets:Record<TreasuryCurrency,TreasuryWallet>;initialCvv?:string|null;cvvConfigured:boolean;cvvUpdatedAt?:number;}
const call=<TReq,TRes>(name:string)=>httpsCallable<TReq,TRes>(functions,name);const makeKey=(prefix:string)=>`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
export const adminTreasuryService={
 getSnapshot:async()=>(await call<Record<string,never>,TreasurySnapshot>('getAdminTreasurySnapshot')({})).data,
 revealCvv:async()=>(await call<Record<string,never>,{cvv:string}>('revealAdminTreasuryCvv')({})).data,
 resetCvv:async()=>(await call<Record<string,never>,{ok:boolean;cvv:string;version:number;updatedAt:number}>('resetAdminTreasuryCvv')({})).data,
 adjust:async(input:{currency:TreasuryCurrency;amount:number;direction:'credit'|'debit';cvv:string})=>(await call<typeof input&{idempotencyKey:string},{ok:boolean;reference:string;transactionId:string;balance:number}>('adjustAdminTreasury')({...input,idempotencyKey:makeKey('adminwallet')})).data,
};
