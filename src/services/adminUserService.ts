import { deleteField, doc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';

export type AccountStatus = 'active' | 'suspended' | 'blocked';
export type WalletAdminStatus = 'active' | 'frozen';

export interface AdminWalletSnapshot {
  id:string;
  currency:'USD'|'CDF';
  status:string;
  availableBalance:number;
  ledgerBalance:number;
  heldBalance:number;
  rechargeNumber?:string;
  marketCashId?:string;
  updatedAt?:number;
}

export interface AdminUserControlSnapshot {
  accountStatus:AccountStatus;
  adminNote:string;
  kycStatus:string;
  securityResetAt:number;
  wallets:{USD:AdminWalletSnapshot|null;CDF:AdminWalletSnapshot|null};
}

const getControl = httpsCallable<{targetUid:string},AdminUserControlSnapshot>(functions,'adminGetUserControl');
const updateControl = httpsCallable<Record<string,unknown>,{ok:boolean;changed?:number}>(functions,'adminUpdateUserControl');

async function userFallback(targetUid:string):Promise<AdminUserControlSnapshot>{
  const snap=await getDoc(doc(db,'users',targetUid));
  if(!snap.exists())throw new Error('Utilisateur introuvable.');
  const u=snap.data();
  return{
    accountStatus:(u.accountStatus||'active')as AccountStatus,
    adminNote:String(u.adminNote||''),
    kycStatus:String(u.kycStatus||'not_started'),
    securityResetAt:Number(u.securityResetAt||0),
    wallets:{USD:null,CDF:null}
  };
}

async function tryCallable<T>(fn:()=>Promise<T>,fallback:()=>Promise<T>):Promise<T>{
  try{return await fn()}catch(error){console.warn('[ADMIN_CONTROL_FUNCTION_FALLBACK]',error);return fallback()}
}

export const adminUserService={
  getControl:async(targetUid:string)=>tryCallable(async()=>(await getControl({targetUid})).data,()=>userFallback(targetUid)),

  setAccountStatus:async(targetUid:string,status:AccountStatus)=>tryCallable(
    async()=>(await updateControl({targetUid,action:'set_account_status',status})).data,
    async()=>{await updateDoc(doc(db,'users',targetUid),{accountStatus:status,accountStatusUpdatedAt:Date.now(),updatedAt:Date.now()});return{ok:true}}
  ),

  setWalletStatus:async(targetUid:string,currency:'USD'|'CDF'|'ALL',status:WalletAdminStatus)=>{
    try{return(await updateControl({targetUid,action:'set_wallet_status',currency,status})).data}
    catch(error){console.error('[ADMIN_WALLET_CONTROL_REQUIRES_FUNCTION]',error);throw new Error('Le contrôle financier du wallet nécessite le déploiement des Cloud Functions administratives.')}
  },

  resetPin:async(targetUid:string)=>tryCallable(
    async()=>(await updateControl({targetUid,action:'reset_pin'})).data,
    async()=>{await updateDoc(doc(db,'users',targetUid),{pinHash:deleteField(),useBiometrics:false,securityResetAt:Date.now(),updatedAt:Date.now()});return{ok:true}}
  ),

  disableBiometrics:async(targetUid:string)=>tryCallable(
    async()=>(await updateControl({targetUid,action:'disable_biometrics'})).data,
    async()=>{await updateDoc(doc(db,'users',targetUid),{useBiometrics:false,updatedAt:Date.now()});return{ok:true}}
  ),

  setNote:async(targetUid:string,note:string)=>tryCallable(
    async()=>(await updateControl({targetUid,action:'set_note',note})).data,
    async()=>{await updateDoc(doc(db,'users',targetUid),{adminNote:note.trim().slice(0,2000),adminNoteUpdatedAt:Date.now(),updatedAt:Date.now()});return{ok:true}}
  )
};
