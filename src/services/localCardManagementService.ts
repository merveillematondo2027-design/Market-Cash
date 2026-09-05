import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

const call=<TReq,TRes>(name:string)=>httpsCallable<TReq,TRes>(functions,name);

export const localCardManagementService={
  setBlocked:async(blocked:boolean)=>(await call<{blocked:boolean},{ok:boolean;status:'active'|'blocked'}>('setLocalCardBlocked')({blocked})).data,
  resetSecurity:async()=>(await call<Record<string,never>,{ok:boolean;cvv:string;version:number}>('resetLocalCardSecurity')({})).data,
  archive:async()=>(await call<Record<string,never>,{ok:boolean}>('archiveLocalCard')({})).data,
};
