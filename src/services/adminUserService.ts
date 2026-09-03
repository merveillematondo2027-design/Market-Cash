import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

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

export const adminUserService = {
  getControl: async(targetUid:string) => (await getControl({targetUid})).data,
  setAccountStatus: async(targetUid:string,status:AccountStatus) => (await updateControl({targetUid,action:'set_account_status',status})).data,
  setWalletStatus: async(targetUid:string,currency:'USD'|'CDF'|'ALL',status:WalletAdminStatus) => (await updateControl({targetUid,action:'set_wallet_status',currency,status})).data,
  resetPin: async(targetUid:string) => (await updateControl({targetUid,action:'reset_pin'})).data,
  disableBiometrics: async(targetUid:string) => (await updateControl({targetUid,action:'disable_biometrics'})).data,
  setNote: async(targetUid:string,note:string) => (await updateControl({targetUid,action:'set_note',note})).data,
};
