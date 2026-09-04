import {httpsCallable} from 'firebase/functions';
import {functions} from '../firebase/config';

export interface VisaCardSummary{
  cardId:string;
  tier:'standard'|'gold';
  maskedNumber:string;
  cardHolder:string;
  status:string;
  createdAt:number;
}

export interface VisaSecureData{
  cardId:string;
  tier:'standard'|'gold';
  cardNumber:string;
  cardHolder:string;
  expiryStart:string;
  expiryEnd:string;
  cvv:string;
  status:string;
}

const call=<TReq,TRes>(name:string)=>httpsCallable<TReq,TRes>(functions,name);

export const cardSecurityService={
  getMyVisaCards:async()=>(await call<Record<string,never>,{cards:VisaCardSummary[]}>('getMyVisaCardSummaries')({})).data.cards,
  revealVisaCard:async(cardId:string,pin:string)=>(await call<{cardId:string;pin:string},VisaSecureData>('revealVisaCardSecureData')({cardId,pin})).data,
};
