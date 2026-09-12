import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';

const db=getFirestore();
const REGION='europe-west1';
const RP_NAME='Market-Cash';
const RP_ID='marketcash-africa.com';
const ORIGINS=['https://marketcash-africa.com','https://www.marketcash-africa.com'];
const requireUid=(r:any)=>{const uid=String(r.auth?.uid||'');if(!uid)throw new HttpsError('unauthenticated','Connexion requise.');return uid};
const b64=(v:Uint8Array)=>Buffer.from(v).toString('base64url');
const bytes=(v:string)=>new Uint8Array(Buffer.from(v,'base64url'));

export const beginPasskeyRegistration=onCall({region:REGION},async request=>{
 const uid=requireUid(request);const user=(await db.doc(`users/${uid}`).get()).data()||{};
 const creds=await db.collection(`users/${uid}/passkeys`).get();
 const options=await generateRegistrationOptions({rpName:RP_NAME,rpID:RP_ID,userName:String(user.email||uid),userDisplayName:String(user.displayName||user.email||'Utilisateur Market-Cash'),attestationType:'none',excludeCredentials:creds.docs.map(d=>({id:d.id})),authenticatorSelection:{residentKey:'preferred',userVerification:'required'}});
 await db.doc(`passkey_challenges/${uid}`).set({challenge:options.challenge,type:'registration',expiresAt:Date.now()+5*60_000,createdAt:Date.now()});return options;
});

export const finishPasskeyRegistration=onCall({region:REGION},async request=>{
 const uid=requireUid(request);const challenge=(await db.doc(`passkey_challenges/${uid}`).get()).data();if(!challenge||challenge.type!=='registration'||challenge.expiresAt<Date.now())throw new HttpsError('failed-precondition','Demande biométrique expirée.');
 const verification=await verifyRegistrationResponse({response:request.data?.response,expectedChallenge:challenge.challenge,expectedOrigin:ORIGINS,expectedRPID:RP_ID,requireUserVerification:true});
 if(!verification.verified||!verification.registrationInfo)throw new HttpsError('permission-denied','Enregistrement biométrique refusé.');
 const {credential,credentialDeviceType,credentialBackedUp}=verification.registrationInfo;await db.doc(`users/${uid}/passkeys/${credential.id}`).set({credentialId:credential.id,publicKey:b64(credential.publicKey),counter:credential.counter,transports:request.data?.response?.response?.transports||[],deviceType:credentialDeviceType,backedUp:credentialBackedUp,createdAt:Date.now(),lastUsedAt:null});await db.doc(`users/${uid}`).set({useBiometrics:true,passkeyEnabled:true,updatedAt:Date.now()},{merge:true});await db.doc(`passkey_challenges/${uid}`).delete();return{verified:true};
});

export const beginPasskeyAuthentication=onCall({region:REGION},async request=>{
 const uid=requireUid(request);const creds=await db.collection(`users/${uid}/passkeys`).get();if(creds.empty)throw new HttpsError('failed-precondition','Aucune biométrie enregistrée.');
 const options=await generateAuthenticationOptions({rpID:RP_ID,userVerification:'required',allowCredentials:creds.docs.map(d=>({id:d.id,transports:d.data().transports||[]}))});await db.doc(`passkey_challenges/${uid}`).set({challenge:options.challenge,type:'authentication',expiresAt:Date.now()+5*60_000,createdAt:Date.now()});return options;
});

export const finishPasskeyAuthentication=onCall({region:REGION},async request=>{
 const uid=requireUid(request);const response=request.data?.response;const challenge=(await db.doc(`passkey_challenges/${uid}`).get()).data();if(!challenge||challenge.type!=='authentication'||challenge.expiresAt<Date.now())throw new HttpsError('failed-precondition','Demande biométrique expirée.');
 const ref=db.doc(`users/${uid}/passkeys/${String(response?.id||'')}`);const snap=await ref.get();if(!snap.exists)throw new HttpsError('permission-denied','Passkey inconnue.');const saved=snap.data()!;
 const verification=await verifyAuthenticationResponse({response,expectedChallenge:challenge.challenge,expectedOrigin:ORIGINS,expectedRPID:RP_ID,credential:{id:saved.credentialId,publicKey:bytes(saved.publicKey),counter:Number(saved.counter||0),transports:saved.transports||[]},requireUserVerification:true});if(!verification.verified)throw new HttpsError('permission-denied','Vérification biométrique refusée.');await ref.set({counter:verification.authenticationInfo.newCounter,lastUsedAt:Date.now()},{merge:true});await db.doc(`passkey_challenges/${uid}`).delete();return{verified:true,verifiedAt:Date.now()};
});

export const removeMyPasskeys=onCall({region:REGION},async request=>{const uid=requireUid(request);const snaps=await db.collection(`users/${uid}/passkeys`).get();const batch=db.batch();snaps.docs.forEach(d=>batch.delete(d.ref));batch.set(db.doc(`users/${uid}`),{useBiometrics:false,passkeyEnabled:false,updatedAt:Date.now()},{merge:true});batch.delete(db.doc(`passkey_challenges/${uid}`));await batch.commit();return{ok:true};});
