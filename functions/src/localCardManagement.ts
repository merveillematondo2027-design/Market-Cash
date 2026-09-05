import { createHash, randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
const sha256 = (value:string) => createHash('sha256').update(value).digest('hex');
const localCardId = (uid:string) => `local_${sha256(`local-card:${uid}`).slice(0,24)}`;
const accountId = (cardId:string,currency:string) => `card_${currency.toLowerCase()}_${cardId}`;

function requireAuth(request:any){const uid=String(request.auth?.uid||'');if(!uid)throw new HttpsError('unauthenticated','Connexion requise.');return uid;}
async function requireCard(uid:string){const ref=db.doc(`local_cards/${localCardId(uid)}`);const snap=await ref.get();if(!snap.exists||snap.data()?.userId!==uid||snap.data()?.status==='deleted')throw new HttpsError('not-found','Carte locale introuvable.');return{ref,snap};}

export const setLocalCardBlocked = onCall({region:REGION},async request=>{
  const uid=requireAuth(request);const blocked=Boolean(request.data?.blocked);const{ref,snap}=await requireCard(uid);const current=String(snap.data()?.status||'active');
  if(blocked&&current==='blocked')return{ok:true,status:'blocked'};
  if(!blocked&&current==='active')return{ok:true,status:'active'};
  const now=Date.now();await ref.set({status:blocked?'blocked':'active',updatedAt:now},{merge:true});
  await db.collection('audit_events').add({actorId:uid,action:blocked?'LOCAL_CARD_BLOCKED':'LOCAL_CARD_UNBLOCKED',cardId:ref.id,result:'success',createdAt:now});
  return{ok:true,status:blocked?'blocked':'active'};
});

export const resetLocalCardSecurity = onCall({region:REGION},async request=>{
  const uid=requireAuth(request);const{ref}=await requireCard(uid);const cvv=randomInt(100,1000).toString();const now=Date.now();const secRef=db.doc(`user_security/${uid}`);const sec=await secRef.get();const version=Number(sec.data()?.cvvVersion||0)+1;
  const batch=db.batch();batch.set(secRef,{userId:uid,localTransactionCvv:cvv,localTransactionCvvHash:sha256(cvv),cvvVersion:version,cvvUpdatedAt:now,updatedAt:now,createdAt:sec.data()?.createdAt||now},{merge:true});batch.set(ref,{cvvVersion:version,cvvUpdatedAt:now,updatedAt:now},{merge:true});batch.set(db.collection('audit_events').doc(),{actorId:uid,action:'LOCAL_CARD_SECURITY_RESET',cardId:ref.id,result:'success',createdAt:now});await batch.commit();
  return{ok:true,cvv,version};
});

export const archiveLocalCard = onCall({region:REGION},async request=>{
  const uid=requireAuth(request);const{ref}=await requireCard(uid);let total=0;for(const currency of CURRENCIES){const account=await db.doc(`card_wallet_accounts/${accountId(ref.id,currency)}`).get();total+=Math.abs(Number(account.data()?.availableBalance||0))+Math.abs(Number(account.data()?.heldBalance||0));}
  if(total>0.000001)throw new HttpsError('failed-precondition','Videz d’abord les soldes de la carte avant suppression.');
  const now=Date.now();await ref.set({status:'deleted',deletedAt:now,updatedAt:now},{merge:true});await db.collection('audit_events').add({actorId:uid,action:'LOCAL_CARD_ARCHIVED',cardId:ref.id,result:'success',createdAt:now});return{ok:true};
});
