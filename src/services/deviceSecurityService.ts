import { httpsCallable } from 'firebase/functions';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { functions } from '../firebase/config';

const beginRegistration=httpsCallable(functions,'beginPasskeyRegistration');
const finishRegistration=httpsCallable(functions,'finishPasskeyRegistration');
const beginAuthentication=httpsCallable(functions,'beginPasskeyAuthentication');
const finishAuthentication=httpsCallable(functions,'finishPasskeyAuthentication');
const removePasskeys=httpsCallable(functions,'removeMyPasskeys');
const updatePreferences=httpsCallable(functions,'updateSecurityPreferences');

export const deviceSecurityService={
 supported(){return typeof window!=='undefined'&&window.isSecureContext&&'PublicKeyCredential'in window&&!!navigator.credentials},
 async platformAvailable(){if(!this.supported())return false;try{return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()}catch{return false}},
 enrolled(_uid:string){return false},
 async enroll(_uid:string,_label='Utilisateur Market-Cash'){
  if(!(await this.platformAvailable()))throw new Error('Empreinte, Face ID ou verrouillage sécurisé indisponible sur cet appareil.');
  const begin:any=await beginRegistration({});const response=await startRegistration({optionsJSON:begin.data as any});const finish:any=await finishRegistration({response});if(!finish.data?.verified)throw new Error('Activation biométrique non confirmée.');return true;
 },
 async verify(_uid:string){
  if(!(await this.platformAvailable()))throw new Error('Biométrie indisponible sur cet appareil.');
  try{await navigator.credentials.preventSilentAccess?.()}catch{}
  const begin:any=await beginAuthentication({});
  const response=await startAuthentication({optionsJSON:begin.data as any});
  const finish:any=await finishAuthentication({response});
  if(!finish.data?.verified)throw new Error('Vérification biométrique refusée.');
  sessionStorage.setItem('marketcash_biometric_verified_at',String(finish.data.verifiedAt||Date.now()));
  return true;
 },
 async remove(_uid:string){await removePasskeys({});sessionStorage.removeItem('marketcash_biometric_verified_at')},
 async updatePreferences(input:{securityAutoLockMinutes:number}){const res:any=await updatePreferences(input);return res.data as {securityAutoLockMinutes:number;updatedAt:number}},
};
