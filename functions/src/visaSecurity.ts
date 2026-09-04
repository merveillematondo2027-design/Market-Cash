import {getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {HttpsError,onCall} from 'firebase-functions/v2/https';
import {verifyApplicationPinForUser} from './security';

if(!getApps().length)initializeApp();
const db=getFirestore();
const REGION='europe-west1';
const requireAuth=(request:any)=>{const uid=String(request.auth?.uid||'');if(!uid)throw new HttpsError('unauthenticated','Connexion requise.');return uid};
const isVisa=(data:any)=>String(data?.network||'').toLowerCase()==='visa';
const tierOf=(data:any)=>String(data?.visaTier||data?.productTier||data?.tier||'standard').toLowerCase()==='gold'?'gold':'standard';
const masked=(value:any)=>{const digits=String(value||'').replace(/\D/g,'');return digits?`•••• •••• •••• ${digits.slice(-4)}`:'•••• •••• •••• ••••'};
const balanceSnapshot=(d:any)=>{const result:Record<string,number>={};const usd=d?.balances?.USD??d?.balanceUSD??d?.usdBalance??d?.balance;const cdf=d?.balances?.CDF??d?.balanceCDF??d?.cdfBalance;if(usd!==undefined&&Number.isFinite(Number(usd)))result.USD=Number(usd);if(cdf!==undefined&&Number.isFinite(Number(cdf)))result.CDF=Number(cdf);return result};

export const getMyVisaCardSummaries=onCall({region:REGION},async request=>{
  const uid=requireAuth(request);const snap=await db.collection('cards').where('userId','==',uid).get();
  const cards=snap.docs.filter(doc=>isVisa(doc.data())&&!['disabled','deleted'].includes(String(doc.data()?.status||''))).map(doc=>{const d=doc.data();return{cardId:doc.id,tier:tierOf(d),maskedNumber:masked(d.cardNumber),cardHolder:String(d.cardHolder||d.cardHolderName||d.userName||'CLIENT MARKET-CASH'),status:String(d.status||'active'),createdAt:Number(d.createdAt||0)}}).sort((a,b)=>b.createdAt-a.createdAt);
  return{cards};
});

export const revealVisaCardSecureData=onCall({region:REGION},async request=>{
  const uid=requireAuth(request);await verifyApplicationPinForUser(uid,request.data?.pin);const cardId=String(request.data?.cardId||'').trim();if(!cardId)throw new HttpsError('invalid-argument','Carte requise.');
  const card=await db.doc(`cards/${cardId}`).get();if(!card.exists||card.data()?.userId!==uid||!isVisa(card.data()))throw new HttpsError('permission-denied','Carte Visa non autorisée.');const d=card.data()!;
  await db.collection('audit_events').add({actorId:uid,action:'VISA_CARD_DETAILS_REVEALED',cardId,result:'success',createdAt:Date.now()});
  return{cardId,tier:tierOf(d),cardNumber:String(d.cardNumber||''),cardHolder:String(d.cardHolder||d.cardHolderName||d.userName||''),expiryStart:String(d.expiryStart||d.validFrom||''),expiryEnd:String(d.expiryEnd||d.expiry||d.validUntil||''),cvv:String(d.cvv||''),status:String(d.status||'active'),balances:balanceSnapshot(d)};
});
