import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';
import type { UserRole } from '../types';

export type AccountStatus = 'active' | 'suspended' | 'blocked' | 'deleted' | 'banned';
export type MutableAccountStatus = 'active' | 'suspended' | 'blocked';
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
  suspendedUntil:number;
  adminNote:string;
  kycStatus:string;
  securityResetAt:number;
  mustChangePin?:boolean;
  wallets:{USD:AdminWalletSnapshot|null;CDF:AdminWalletSnapshot|null};
}

const getControl = httpsCallable<{targetUid:string},AdminUserControlSnapshot>(functions,'adminGetUserControl');
const updateControl = httpsCallable<Record<string,unknown>,{ok:boolean;changed?:number;suspendedUntil?:number;role?:UserRole;displayName?:string;phone?:string}>(functions,'adminUpdateUserControl');
async function hashPin(value:string){const encoded=new TextEncoder().encode(value);const buffer=await crypto.subtle.digest('SHA-256',encoded);return Array.from(new Uint8Array(buffer)).map(b=>b.toString(16).padStart(2,'0')).join('')}

async function userFallback(targetUid:string):Promise<AdminUserControlSnapshot>{
  const snap=await getDoc(doc(db,'users',targetUid));if(!snap.exists())throw new Error('Utilisateur introuvable.');const u=snap.data();
  return{accountStatus:(u.accountStatus||'active')as AccountStatus,suspendedUntil:Number(u.suspendedUntil||0),adminNote:String(u.adminNote||''),kycStatus:String(u.kycStatus||'not_started'),securityResetAt:Number(u.securityResetAt||0),mustChangePin:Boolean(u.mustChangePin),wallets:{USD:null,CDF:null}};
}

async function tryCallable<T>(fn:()=>Promise<T>,fallback:()=>Promise<T>):Promise<T>{try{return await fn()}catch(error){console.warn('[ADMIN_CONTROL_FUNCTION_FALLBACK]',error);return fallback()}}

export const adminUserService={
  getControl:async(targetUid:string)=>tryCallable(async()=>(await getControl({targetUid})).data,()=>userFallback(targetUid)),
  setIdentity:async(targetUid:string,displayName:string,phone:string)=>(await updateControl({targetUid,action:'set_identity',displayName,phone})).data,
  setRole:async(targetUid:string,role:UserRole,agencyName='')=>(await updateControl({targetUid,action:'set_role',role,agencyName})).data,
  setAccountStatus:async(targetUid:string,status:AccountStatus,durationMinutes?:number)=>{
    if(status==='deleted')return(await updateControl({targetUid,action:'delete_account'})).data;
    if(status==='banned')throw new Error('Utilisez banAccount pour bannir définitivement un compte.');
    const mutableStatus:MutableAccountStatus=status;
    return tryCallable(async()=>(await updateControl({targetUid,action:'set_account_status',status:mutableStatus,durationMinutes})).data,async()=>{const suspendedUntil=mutableStatus==='suspended'?Date.now()+Number(durationMinutes||0)*60000:0;await updateDoc(doc(db,'users',targetUid),{accountStatus:mutableStatus,suspendedUntil,accountStatusUpdatedAt:Date.now(),updatedAt:Date.now()});return{ok:true,suspendedUntil}});
  },
  deleteAccount:async(targetUid:string)=>(await updateControl({targetUid,action:'delete_account'})).data,
  banAccount:async(targetUid:string,reason:string)=>(await updateControl({targetUid,action:'ban_account',reason})).data,
  setWalletStatus:async(targetUid:string,currency:'USD'|'CDF'|'ALL',status:WalletAdminStatus)=>{try{return(await updateControl({targetUid,action:'set_wallet_status',currency,status})).data}catch(error){console.error('[ADMIN_WALLET_CONTROL_REQUIRES_FUNCTION]',error);throw new Error('Le contrôle financier du wallet nécessite les Cloud Functions administratives.')}},
  resetPin:async(targetUid:string)=>tryCallable(
    async()=>(await updateControl({targetUid,action:'reset_pin'})).data,
    async()=>{const temporaryPinHash=await hashPin('1234');await updateDoc(doc(db,'users',targetUid),{pinHash:'',temporaryPinHash,mustChangePin:true,pinChangedAt:0,useBiometrics:false,securityResetAt:Date.now(),updatedAt:Date.now()});return{ok:true}}
  ),
  disableBiometrics:async(targetUid:string)=>tryCallable(async()=>(await updateControl({targetUid,action:'disable_biometrics'})).data,async()=>{await updateDoc(doc(db,'users',targetUid),{useBiometrics:false,updatedAt:Date.now()});return{ok:true}}),
  setNote:async(targetUid:string,note:string)=>tryCallable(async()=>(await updateControl({targetUid,action:'set_note',note})).data,async()=>{await updateDoc(doc(db,'users',targetUid),{adminNote:note.trim().slice(0,2000),adminNoteUpdatedAt:Date.now(),updatedAt:Date.now()});return{ok:true}})
};
