import {createHash,randomInt} from 'node:crypto';
import {getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {HttpsError,onCall} from 'firebase-functions/v2/https';

if(!getApps().length)initializeApp();
const db=getFirestore();
const REGION='europe-west1';
const CURRENCIES=['USD','CDF'] as const;
type Currency=typeof CURRENCIES[number];
const sha256=(v:string)=>createHash('sha256').update(v).digest('hex');
const walletId=(uid:string,c:Currency)=>`wallet_${c.toLowerCase()}_${uid}`;
const securityRef=(uid:string)=>db.doc(`user_security/${uid}`);

const requireAdmin=async(request:any)=>{
  const uid=String(request.auth?.uid||'');
  if(!uid)throw new HttpsError('unauthenticated','Connexion requise.');
  const user=await db.doc(`users/${uid}`).get();
  if(!user.exists||String(user.data()?.role)!=='admin_general')throw new HttpsError('permission-denied','Administrateur requis.');
  if(['blocked','suspended'].includes(String(user.data()?.accountStatus||'')))throw new HttpsError('failed-precondition','Compte administrateur indisponible.');
  return {uid,user};
};
const parseCurrency=(v:any):Currency=>{const c=String(v||'').toUpperCase()as Currency;if(!CURRENCIES.includes(c))throw new HttpsError('invalid-argument','Devise invalide.');return c};
const parseAmount=(v:any)=>{const n=Number(v);if(!Number.isFinite(n)||n<=0)throw new HttpsError('invalid-argument','Montant invalide.');return Math.round(n*100)/100};
const normalizeCvv=(v:any)=>{const s=String(v||'').replace(/\D/g,'');if(!/^\d{3}$/.test(s))throw new HttpsError('invalid-argument','Le CVV doit contenir 3 chiffres.');return s};

async function ensureAdminCvv(uid:string){
  const ref=securityRef(uid);const snap=await ref.get();
  const hash=String(snap.data()?.adminWalletCvvHash||'');
  if(hash)return {created:false,cvv:null as string|null};
  const cvv=randomInt(100,1000).toString();const now=Date.now();
  await ref.set({userId:uid,adminWalletCvvHash:sha256(cvv),adminWalletCvvVersion:1,adminWalletCvvUpdatedAt:now,updatedAt:now,createdAt:snap.data()?.createdAt||now},{merge:true});
  return {created:true,cvv};
}
async function requireAdminCvv(uid:string,value:any){
  const cvv=normalizeCvv(value);await ensureAdminCvv(uid);const snap=await securityRef(uid).get();
  if(sha256(cvv)!==String(snap.data()?.adminWalletCvvHash||''))throw new HttpsError('permission-denied','CVV du wallet admin incorrect.');
}
async function ensureAdminWallet(uid:string,currency:Currency){
  const ref=db.doc(`wallet_accounts/${walletId(uid,currency)}`);const snap=await ref.get();const now=Date.now();
  if(!snap.exists)await ref.set({id:ref.id,userId:uid,accountType:'admin',currency,availableBalance:0,ledgerBalance:0,heldBalance:0,status:'active',createdAt:now,updatedAt:now});
  else if(snap.data()?.accountType!=='admin')await ref.set({accountType:'admin',updatedAt:now},{merge:true});
  return ref;
}

export const getAdminTreasurySnapshot=onCall({region:REGION},async request=>{
  const {uid}=await requireAdmin(request);const cvvState=await ensureAdminCvv(uid);const wallets:any={};
  for(const currency of CURRENCIES){const ref=await ensureAdminWallet(uid,currency);const d=(await ref.get()).data()||{};wallets[currency]={id:ref.id,currency,availableBalance:Number(d.availableBalance||0),ledgerBalance:Number(d.ledgerBalance||0),heldBalance:Number(d.heldBalance||0),status:String(d.status||'active')};}
  return {wallets,initialCvv:cvvState.created?cvvState.cvv:null,cvvConfigured:true};
});

export const adjustAdminTreasury=onCall({region:REGION},async request=>{
  const {uid}=await requireAdmin(request);const currency=parseCurrency(request.data?.currency);const amount=parseAmount(request.data?.amount);const direction=String(request.data?.direction||'');
  if(!['credit','debit'].includes(direction))throw new HttpsError('invalid-argument','Opération invalide.');
  await requireAdminCvv(uid,request.data?.cvv);const walletRef=await ensureAdminWallet(uid,currency);
  const rawKey=String(request.data?.idempotencyKey||'').trim();const txId=/^[A-Za-z0-9_-]{8,120}$/.test(rawKey)?rawKey:`admin_treasury_${uid}_${Date.now()}_${randomInt(1000,9999)}`;
  return db.runTransaction(async tx=>{
    const txRef=db.doc(`wallet_transactions/${txId}`);const existing=await tx.get(txRef);if(existing.exists)return {ok:true,duplicate:true,reference:existing.data()?.reference,transactionId:txId};
    const wallet=await tx.get(walletRef);if(!wallet.exists||wallet.data()?.status!=='active')throw new HttpsError('failed-precondition','Wallet admin indisponible.');
    const current=Number(wallet.data()?.availableBalance||0);const ledger=Number(wallet.data()?.ledgerBalance||0);if(direction==='debit'&&current<amount)throw new HttpsError('failed-precondition','Fonds admin insuffisants.');
    const delta=direction==='credit'?amount:-amount;const now=Date.now();const reference=`MC-ADM-${direction==='credit'?'ADD':'RED'}-${now}`;
    tx.update(walletRef,{availableBalance:current+delta,ledgerBalance:ledger+delta,updatedAt:now});
    tx.set(txRef,{id:txId,reference,type:direction==='credit'?'admin_treasury_credit':'admin_treasury_debit',status:'settled',currency,amount,adminId:uid,userIds:[uid],walletId:walletRef.id,direction,rail:'admin_treasury',createdAt:now,updatedAt:now});
    tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,walletId:walletRef.id,userId:uid,direction:direction==='credit'?'credit':'debit',amount,currency,createdAt:now});
    tx.set(db.collection('audit_events').doc(),{actorId:uid,action:direction==='credit'?'ADMIN_TREASURY_ADD':'ADMIN_TREASURY_REDUCE',resourceId:txId,result:'success',amount,currency,createdAt:now});
    return {ok:true,reference,transactionId:txId,balance:current+delta};
  });
});

// Treasury deployment marker: focused admin wallet release.
