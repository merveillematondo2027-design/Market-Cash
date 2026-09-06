import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db=getFirestore();const REGION='europe-west1';
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const round=(v:number)=>Math.round(v*100)/100;
const devId=(uid:string)=>`DEV-${sha(`developer:${uid}`).slice(0,10).toUpperCase()}`;
const localCardId=(uid:string)=>`local_${sha(`local-card:${uid}`).slice(0,24)}`;
const cardAccountId=(cardId:string,c:string)=>`card_${c.toLowerCase()}_${cardId}`;
const devWalletId=(developerId:string,c:string)=>`dev_${c.toLowerCase()}_${developerId}`;
const billingId=(developerId:string)=>`billing_${developerId}`;
function auth(req:any){const uid=String(req.auth?.uid||'');if(!uid)throw new HttpsError('unauthenticated','Connexion requise.');return uid}
function prefix(role:string,mode:string){if(role==='agent')return'MC-AGT';if(role==='api_partner'||mode==='api_provider')return'MC-API';if(role==='developer'||mode==='direct_developer')return'MC-DEV';return'MC-MER'}
function letter(name:string){return(name.toUpperCase().match(/[A-Z0-9]/)?.[0]||'X')}
async function ensureProfessionalId(uid:string){
 const userRef=db.doc(`users/${uid}`);const userSnap=await userRef.get();if(!userSnap.exists)throw new HttpsError('not-found','Compte introuvable.');const u=userSnap.data()||{};
 if(u.professionalId)return String(u.professionalId);
 const p=prefix(String(u.role||''),String(u.businessAccountType||''));const l=letter(String(u.displayName||u.businessName||u.email||''));
 for(let i=0;i<30;i++){const digits=(parseInt(sha(`${uid}:${i}`).slice(0,10),16)%1000000).toString().padStart(6,'0');const id=`${p}-${digits}${l}`;const reg=db.doc(`professional_id_registry/${id}`);try{await db.runTransaction(async tx=>{const r=await tx.get(reg);if(r.exists&&r.data()?.userId!==uid)throw new Error('COLLISION');tx.set(reg,{id,userId:uid,createdAt:Date.now()});tx.set(userRef,{professionalId:id,updatedAt:Date.now()},{merge:true});});return id}catch(e:any){if(e?.message!=='COLLISION')throw e}}
 throw new HttpsError('internal','Impossible de générer un identifiant professionnel.');
}
async function getDeveloper(uid:string){const developerId=devId(uid),ref=db.doc(`developer_accounts/${developerId}`),snap=await ref.get();if(!snap.exists||snap.data()?.status!=='active')throw new HttpsError('failed-precondition','Compte Developer inactif.');return{developerId,ref,data:snap.data()||{}}}
async function ensureBilling(developerId:string,uid:string,tier:string){const ref=db.doc(`developer_billing_accounts/${billingId(developerId)}`),snap=await ref.get(),now=Date.now();if(!snap.exists)await ref.set({id:ref.id,developerId,userId:uid,currency:'USD',availableBalance:0,ledgerBalance:0,status:'active',pricingTier:tier,createdAt:now,updatedAt:now});return ref}
export const getMyProfessionalIdentity=onCall({region:REGION},async req=>{const uid=auth(req);const professionalId=await ensureProfessionalId(uid);return{professionalId}});

export const getMyDeveloperBilling=onCall({region:REGION},async req=>{const uid=auth(req),dev=await getDeveloper(uid);const tier=dev.data.businessType==='api_provider'?'wholesale':'direct';const ref=await ensureBilling(dev.developerId,uid,tier),snap=await ref.get();const balance=Number(snap.data()?.availableBalance||0);const unitPrice=tier==='wholesale'?0.05:0.10;return{balance:round(balance),currency:'USD' as const,unitPrice,pricingTier:tier,estimatedRequests:Math.floor(balance/unitPrice)}});

export const fundMyDeveloperBilling=onCall({region:REGION},async req=>{const uid=auth(req),amount=round(Number(req.data?.amount));if(!Number.isFinite(amount)||amount<=0)throw new HttpsError('invalid-argument','Montant invalide.');const dev=await getDeveloper(uid),tier=dev.data.businessType==='api_provider'?'wholesale':'direct';const billingRef=await ensureBilling(dev.developerId,uid,tier),walletRef=db.doc(`developer_wallet_accounts/${devWalletId(dev.developerId,'USD')}`),entry=db.collection('developer_billing_transactions').doc();await db.runTransaction(async tx=>{const[w,b]=await Promise.all([tx.get(walletRef),tx.get(billingRef)]);const wb=Number(w.data()?.availableBalance||0);if(!w.exists||wb<amount)throw new HttpsError('failed-precondition','Solde revenus USD insuffisant.');const bb=Number(b.data()?.availableBalance||0),now=Date.now();tx.update(walletRef,{availableBalance:round(wb-amount),ledgerBalance:round(Number(w.data()?.ledgerBalance||wb)-amount),updatedAt:now});tx.set(billingRef,{availableBalance:round(bb+amount),ledgerBalance:round(Number(b.data()?.ledgerBalance||bb)+amount),updatedAt:now},{merge:true});tx.set(entry,{id:entry.id,developerId:dev.developerId,userId:uid,type:'billing_topup',status:'settled',currency:'USD',amount,source:'developer_revenue_wallet',balanceAfter:round(bb+amount),createdAt:now,updatedAt:now});});return{ok:true,balance:(await billingRef.get()).data()?.availableBalance||0,debited:amount}});

export const developerTransferToLocalCard=onCall({region:REGION},async req=>{
 const uid=auth(req);const currency=String(req.data?.currency||'USD').toUpperCase();const amount=Number(req.data?.amount);if(!['USD','CDF'].includes(currency)||!Number.isFinite(amount)||amount<=0)throw new HttpsError('invalid-argument','Montant ou devise invalide.');
 const dev=await getDeveloper(uid);const developerId=dev.developerId;
 const cardId=localCardId(uid),devWallet=db.doc(`developer_wallet_accounts/${devWalletId(developerId,currency)}`),cardWallet=db.doc(`card_wallet_accounts/${cardAccountId(cardId,currency)}`),cardRef=db.doc(`local_cards/${cardId}`);const fee=round(Math.max(amount*0.005,currency==='USD'?0.02:50)),total=round(amount+fee),txRef=db.collection('wallet_transactions').doc();
 await db.runTransaction(async tx=>{const [dw,cw,card]=await Promise.all([tx.get(devWallet),tx.get(cardWallet),tx.get(cardRef)]);if(!card.exists||card.data()?.status!=='active')throw new HttpsError('failed-precondition','Carte locale indisponible.');if(!dw.exists||Number(dw.data()?.availableBalance||0)<total)throw new HttpsError('failed-precondition','Solde Developer insuffisant.');const dbal=Number(dw.data()?.availableBalance||0),cbal=Number(cw.data()?.availableBalance||0),now=Date.now(),reference=`MC-DEV-${now}`;tx.update(devWallet,{availableBalance:round(dbal-total),ledgerBalance:round(Number(dw.data()?.ledgerBalance||dbal)-total),updatedAt:now});tx.set(cardWallet,{id:cardWallet.id,userId:uid,cardId,currency,availableBalance:round(cbal+amount),ledgerBalance:round(Number(cw.data()?.ledgerBalance||cbal)+amount),heldBalance:Number(cw.data()?.heldBalance||0),status:'active',updatedAt:now,createdAt:cw.data()?.createdAt||now},{merge:true});tx.set(txRef,{id:txRef.id,reference,type:'developer_to_local_card',status:'settled',developerId,userId:uid,cardId,currency,amount,feeAmount:fee,totalDebited:total,reason:'Virement Developer vers carte locale',createdAt:now,updatedAt:now,adminVisible:true});tx.set(db.collection('notifications').doc(),{userId:uid,title:'Virement vers carte locale',message:`${amount} ${currency} transféré vers votre carte locale. Frais: ${fee} ${currency}.`,type:'success',category:'transaction',read:false,createdAt:now});});return{ok:true,transactionId:txRef.id,feeAmount:fee,totalDebited:total};
});
