import { createHash, randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { ensureRolePublicId, normalizeClientPublicId } from './identifiers';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['CDF', 'USD'] as const;
type Currency = typeof CURRENCIES[number];

const sha256 = (value:string) => createHash('sha256').update(value).digest('hex');
const walletId = (uid:string,currency:Currency) => `wallet_${currency.toLowerCase()}_${uid}`;
const rechargeNumberForUid = (uid:string) => (BigInt(`0x${sha256(`recharge:${uid}`).slice(0,15)}`)%100000000000n).toString().padStart(11,'0');

function requireAuth(request:any){
  const uid=String(request.auth?.uid||'');
  if(!uid)throw new HttpsError('unauthenticated','Connexion requise.');
  return uid;
}

function parseCurrency(value:any):Currency{
  const currency=String(value||'').toUpperCase()as Currency;
  if(!CURRENCIES.includes(currency))throw new HttpsError('invalid-argument','Devise invalide.');
  return currency;
}

function parseAmount(value:any){
  const amount=Number(value);
  if(!Number.isFinite(amount)||amount<=0)throw new HttpsError('invalid-argument','Montant invalide.');
  return Math.round(amount*100)/100;
}

function parseKey(value:any,prefix:string,uid:string){
  const raw=String(value||'').trim();
  if(!raw)return `${prefix}_${uid}_${Date.now()}_${randomInt(1000,9999)}`;
  if(!/^[A-Za-z0-9_-]{8,120}$/.test(raw))throw new HttpsError('invalid-argument','Clé de transaction invalide.');
  return raw;
}

function requirePin(user:FirebaseFirestore.DocumentSnapshot,pin:any,label='Code secret agent incorrect.'){
  const value=String(pin||'');
  if(!value||user.data()?.pinHash!==sha256(value))throw new HttpsError('permission-denied',label);
}

async function requireAdmin(uid:string){
  const snap=await db.doc(`users/${uid}`).get();
  if(!snap.exists||snap.data()?.role!=='admin_general')throw new HttpsError('permission-denied','Administrateur général requis.');
}

async function requireActiveAgent(uid:string){
  const[user,profile]=await Promise.all([db.doc(`users/${uid}`).get(),db.doc(`agent_profiles/${uid}`).get()]);
  if(!user.exists||user.data()?.role!=='agent'||!profile.exists||profile.data()?.status!=='active')throw new HttpsError('permission-denied','Compte Agent point de vente non autorisé.');
  if(['blocked','suspended'].includes(String(user.data()?.accountStatus||'')))throw new HttpsError('failed-precondition','Compte Agent indisponible.');
  return{user,profile};
}

async function ensureAgentWallets(uid:string){
  const identity=await ensureRolePublicId(uid,'agent');
  const rechargeNumber=rechargeNumberForUid(uid);
  const now=Date.now();
  const batch=db.batch();
  for(const currency of CURRENCIES){
    const ref=db.doc(`wallet_accounts/${walletId(uid,currency)}`);
    const snap=await ref.get();
    const common={id:ref.id,userId:uid,accountType:'agent',currency,status:'active',rechargeNumber,publicId:identity.publicId,marketCashId:identity.publicId,updatedAt:now};
    if(!snap.exists)batch.set(ref,{...common,availableBalance:0,ledgerBalance:0,heldBalance:0,createdAt:now});
    else batch.set(ref,common,{merge:true});
  }
  const rechargeRef=db.doc(`wallet_recharge_numbers/${rechargeNumber}`);
  const recharge=await rechargeRef.get();
  batch.set(rechargeRef,{userId:uid,rechargeNumber,publicId:identity.publicId,updatedAt:now,createdAt:recharge.data()?.createdAt||now},{merge:true});
  await batch.commit();
  return{rechargeNumber,marketCashId:identity.publicId,publicId:identity.publicId};
}

async function ensureClientWallets(uid:string,clientPublicId:string){
  const identity=await ensureRolePublicId(uid,'client');
  if(identity.publicId!==clientPublicId)throw new HttpsError('failed-precondition','Identifiant client incohérent.');
  const now=Date.now();
  for(const currency of CURRENCIES){
    const ref=db.doc(`wallet_accounts/${walletId(uid,currency)}`);
    const snap=await ref.get();
    if(!snap.exists)await ref.set({id:ref.id,userId:uid,accountType:'client',currency,availableBalance:0,ledgerBalance:0,heldBalance:0,status:'active',publicId:clientPublicId,marketCashId:clientPublicId,createdAt:now,updatedAt:now});
    else await ref.set({publicId:clientPublicId,marketCashId:clientPublicId,accountType:'client',updatedAt:now},{merge:true});
  }
}

async function readWallets(uid:string){
  const result:Record<string,any>={};
  for(const currency of CURRENCIES){
    const snap=await db.doc(`wallet_accounts/${walletId(uid,currency)}`).get();
    const data=snap.data();
    result[currency]=data?{id:snap.id,userId:String(data.userId||uid),accountType:String(data.accountType||'agent'),currency,status:String(data.status||'active'),availableBalance:Number(data.availableBalance||0),ledgerBalance:Number(data.ledgerBalance||0),heldBalance:Number(data.heldBalance||0),rechargeNumber:String(data.rechargeNumber||''),marketCashId:String(data.marketCashId||data.publicId||''),updatedAt:Number(data.updatedAt||0)}:null;
  }
  return result;
}

async function resolveClient(value:any,agentUid:string){
  const publicId=normalizeClientPublicId(value);
  const mapping=await db.doc(`wallet_public_ids/${publicId}`).get();
  if(!mapping.exists||mapping.data()?.role!=='client')throw new HttpsError('not-found','Client Market-Cash introuvable.');
  const clientUid=String(mapping.data()?.userId||'');
  if(!clientUid||clientUid===agentUid)throw new HttpsError('failed-precondition','Client invalide.');
  const user=await db.doc(`users/${clientUid}`).get();
  if(!user.exists||user.data()?.role!=='client')throw new HttpsError('not-found','Compte client introuvable.');
  if(['blocked','suspended'].includes(String(user.data()?.accountStatus||'')))throw new HttpsError('failed-precondition','Compte client indisponible.');
  await ensureClientWallets(clientUid,publicId);
  return{clientUid,publicId,user};
}

export const getMyAgentAccountSnapshotV2=onCall({region:REGION},async request=>{
  const uid=requireAuth(request);
  await requireActiveAgent(uid);
  const identity=await ensureAgentWallets(uid);
  return{...identity,isAgent:true,wallets:await readWallets(uid)};
});

export const adminGetAgentDetailsV2=onCall({region:REGION},async request=>{
  const adminUid=requireAuth(request);await requireAdmin(adminUid);
  const agentUid=String(request.data?.agentUid||'').trim();
  const{user,profile}=await requireActiveAgent(agentUid);
  const identity=await ensureAgentWallets(agentUid);
  const txSnap=await db.collection('wallet_transactions').where('agentId','==',agentUid).limit(30).get();
  const transactions=txSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,12);
  const u=user.data()||{};const p=profile.data()||{};
  return{agent:{uid:agentUid,displayName:String(u.displayName||p.legalName||'Agent Market-Cash'),email:String(u.email||p.email||''),phone:String(u.phone||p.phone||''),accountStatus:String(u.accountStatus||'active'),kycStatus:String(u.kycStatus||'not_started'),mustChangePin:Boolean(u.mustChangePin),pointName:String(p.pointName||''),legalName:String(p.legalName||''),activity:String(p.activity||''),city:String(p.city||''),address:String(p.address||''),openingHours:String(p.openingHours||''),approvedAt:Number(p.approvedAt||0),rechargeNumber:identity.rechargeNumber,marketCashId:identity.marketCashId},wallets:await readWallets(agentUid),transactions};
});

export const adminFundAgentFloatV3=onCall({region:REGION},async request=>{
  const adminUid=requireAuth(request);await requireAdmin(adminUid);
  const agentUid=String(request.data?.agentUid||'').trim();await requireActiveAgent(agentUid);
  const currency=parseCurrency(request.data?.currency);const amount=parseAmount(request.data?.amount);const reason=String(request.data?.reason||'').trim();
  if(reason.length<5)throw new HttpsError('invalid-argument','Motif obligatoire.');
  await ensureAgentWallets(agentUid);
  const ref=db.doc(`wallet_accounts/${walletId(agentUid,currency)}`);const now=Date.now();const id=`fundv3_${agentUid}_${now}_${randomInt(1000,9999)}`;const reference=`MC-FLOAT-${now}`;
  await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)throw new HttpsError('failed-precondition','Wallet agent non initialisé.');const wallet=snap.data()||{};if(String(wallet.status||'active')!=='active')throw new HttpsError('failed-precondition','Wallet agent gelé.');const before=Number(wallet.availableBalance||0);const ledgerBefore=Number(wallet.ledgerBalance||0);const after=before+amount;tx.update(ref,{availableBalance:after,ledgerBalance:ledgerBefore+amount,updatedAt:now});tx.set(db.doc(`wallet_transactions/${id}`),{id,reference,type:'agent_float_funding',status:'settled',currency,amount,agentId:agentUid,userIds:[agentUid],source:'administration',approvedBy:adminUid,reason,balanceBefore:before,balanceAfter:after,createdAt:now,updatedAt:now});tx.set(db.collection('audit_events').doc(),{actorId:adminUid,actorType:'admin_general',action:'AGENT_FLOAT_FUNDED_V3',agentId:agentUid,amount,currency,reason,balanceBefore:before,balanceAfter:after,result:'success',createdAt:now});tx.set(db.collection('notifications').doc(),{userId:agentUid,title:'Float agent crédité',message:`Votre float ${currency} a été crédité de ${amount} ${currency}.`,type:'success',category:'general',read:false,transactionId:id,createdAt:now});});
  return{ok:true,transactionId:id,reference,wallets:await readWallets(agentUid)};
});

export const lookupAgentClientByMarketCashIdV2=onCall({region:REGION},async request=>{
  const agentUid=requireAuth(request);await requireActiveAgent(agentUid);await ensureAgentWallets(agentUid);
  const resolved=await resolveClient(request.data?.marketCashId,agentUid);const profile=resolved.user.data()!;
  return{userId:resolved.clientUid,marketCashId:resolved.publicId,displayName:String(profile.displayName||profile.fullName||'Client Market-Cash'),phone:String(profile.phone||'')};
});

export const agentCashInByMarketCashIdV2=onCall({region:REGION},async request=>{
  const agentUid=requireAuth(request);const{user:agentUser}=await requireActiveAgent(agentUid);const currency=parseCurrency(request.data?.currency);const amount=parseAmount(request.data?.amount);const txId=parseKey(request.data?.idempotencyKey,'cashin',agentUid);const resolved=await resolveClient(request.data?.marketCashId,agentUid);requirePin(agentUser,request.data?.pin);await ensureAgentWallets(agentUid);
  return db.runTransaction(async tx=>{const txRef=db.doc(`wallet_transactions/${txId}`);const existing=await tx.get(txRef);if(existing.exists)return{ok:true,duplicate:true,reference:existing.data()?.reference,transactionId:txId};const agentWalletRef=db.doc(`wallet_accounts/${walletId(agentUid,currency)}`);const clientWalletRef=db.doc(`wallet_accounts/${walletId(resolved.clientUid,currency)}`);const[agentWallet,clientWallet]=await Promise.all([tx.get(agentWalletRef),tx.get(clientWalletRef)]);if(!agentWallet.exists||!clientWallet.exists)throw new HttpsError('failed-precondition','Portefeuille non initialisé.');const agent=agentWallet.data()!;const client=clientWallet.data()!;if(agent.status!=='active'||client.status!=='active')throw new HttpsError('failed-precondition','Portefeuille indisponible.');if(Number(agent.availableBalance||0)<amount)throw new HttpsError('failed-precondition','Float agent insuffisant.');const now=Date.now();const reference=`MC-DEP-${now}`;tx.update(agentWalletRef,{availableBalance:Number(agent.availableBalance||0)-amount,ledgerBalance:Number(agent.ledgerBalance||0)-amount,updatedAt:now});tx.update(clientWalletRef,{availableBalance:Number(client.availableBalance||0)+amount,ledgerBalance:Number(client.ledgerBalance||0)+amount,updatedAt:now});tx.set(txRef,{id:txId,reference,type:'cash_in',status:'settled',currency,amount,agentId:agentUid,clientId:resolved.clientUid,clientMarketCashId:resolved.publicId,userIds:[agentUid,resolved.clientUid],sourceWalletId:agentWalletRef.id,destinationWalletId:clientWalletRef.id,rail:'agent_terminal_market_cash_id_v2',createdAt:now,updatedAt:now});tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,walletId:agentWalletRef.id,userId:agentUid,direction:'debit',amount,currency,createdAt:now});tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,walletId:clientWalletRef.id,userId:resolved.clientUid,direction:'credit',amount,currency,createdAt:now});tx.set(db.collection('notifications').doc(),{userId:resolved.clientUid,title:'Dépôt reçu',message:`Un Agent Market-Cash a déposé ${amount} ${currency} sur votre portefeuille.`,type:'success',category:'general',read:false,transactionId:txId,createdAt:now});tx.set(db.collection('audit_events').doc(),{actorId:agentUid,actorType:'agent',action:'AGENT_CASH_IN_MCW_V2',resourceId:txId,clientId:resolved.clientUid,clientMarketCashId:resolved.publicId,amount,currency,result:'success',createdAt:now});return{ok:true,reference,transactionId:txId};});
});
