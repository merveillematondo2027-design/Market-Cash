import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';
import type { WalletCurrency } from '../types/wallet';

export interface LocalPairCardSummary {
  cardId: string;
  cardIdentifier: string;
  cardHolder: string;
  maskedNumber: string;
  status: string;
  qrData?: string;
  expiryStart?: string;
  expiryEnd?: string;
  currency: WalletCurrency;
  balances: Partial<Record<WalletCurrency, number>>;
}

export interface LocalPairSecureData {
  cardId: string;
  currency: WalletCurrency;
  cardNumber: string;
  cardHolder: string;
  expiryStart: string;
  expiryEnd: string;
  cvv: string;
}

const call=<TReq,TRes>(name:string)=>httpsCallable<TReq,TRes>(functions,name);

export const localCardPairService={
  ensure:async()=>(await call<Record<string,never>,{ok:boolean;cards:LocalPairCardSummary[]}>('ensureLocalCardPairV3')({})).data.cards,
  list:async()=>(await call<Record<string,never>,{cards:LocalPairCardSummary[]}>('getMyLocalCardPairV3')({})).data.cards,
  reveal:async(cardId:string,pin:string)=>(await call<{cardId:string;pin:string},LocalPairSecureData>('revealLocalCardV3')({cardId,pin})).data,
  revealWithBiometric:async(cardId:string)=>(await call<{cardId:string;biometric:boolean},LocalPairSecureData>('revealLocalCardV3')({cardId,biometric:true})).data,
  setBlocked:async(cardId:string,blocked:boolean)=>(await call<{cardId:string;blocked:boolean},{ok:boolean;status:'active'|'blocked'}>('setLocalCardBlockedV3')({cardId,blocked})).data,
  resetSecurity:async(cardId:string)=>(await call<{cardId:string},{ok:boolean;cvv:string;version:number}>('resetLocalCardSecurityV3')({cardId})).data,
  fund:async(input:{cardId:string;amount:number;cvv:string;idempotencyKey:string})=>(await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('fundLocalCardV3')(input)).data,
};
