import { createHash, randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['CDF', 'USD'] as const;
type Currency = typeof CURRENCIES[number];

const sha256 = (value:string) => createHash('sha256').update(value).digest('hex');
const walletId = (uid:string,currency:Currency) => `wallet_${currency.toLowerCase()}_${uid}`;
const rechargeNumberForUid = (uid:string) => (BigInt(`0x${sha256(uid).slice(0,15)}`)%100000000000n).toString().padStart(11,'0');
const marketCashIdForUid = (uid:string) => `MCW-${sha256(`market-cash:${uid}`).slice(0,10).toUpperCase()}`;

function requireAuth(request:any){
  const uid=String(request.auth?.uid||'');
  if(!uid)throw new HttpsError('unauthenticated','Connexion requise.');
  return uid;
}

async function requireAdmin(uid:string){
  const snap=await db.doc(`users/${uid}`).get();
  if(!snap.exists||snap.data()?.role!=='admin_general')throw new HttpsError('permission-denied','Administrateur général requis.');
}

async function requireActiveAgent(agentUid:string){
  if(!agentUid)throw new HttpsError('invalid-argument','Agent requis.');
  const[user,profile]=await Promise.all([
    db.doc(`users/${agentUid}`).get(),
    db.doc(`agent_profiles/${agentUid}`).get(),
  ]);
  if(!user.exists)throw new HttpsError('not-found','Compte agent introuvable.');
  if(user.data()?.role!=='agent')throw new HttpsError('failed-precondition','Ce compte n’est pas un Agent Market-Cash.');
  if(!profile.exists||profile.data()?.status!=='active')throw new HttpsError('failed-precondition','Profil Agent non actif.');
  if(['blocked','suspended'].includes(String(user.data()?.accountStatus||'')))throw new HttpsError('failed-precondition','Compte Agent indisponible.');
  return{user,profile};
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

async function ensureAgentWallets(agentUid:string){
  const now=Date.now();
  const rechargeNumber=rechargeNumberForUid(agentUid);
  const marketCashId=marketCashIdForUid(agentUid);
  const batch=db.batch();
  for(const currency of CURRENCIES){
    const ref=db.doc(`wallet_accounts/${walletId(agentUid,currency)}`);
    const snap=await ref.get();
    if(!snap.exists){
      batch.set(ref,{id:ref.id,userId:agentUid,accountType:'agent',currency,availableBalance:0,ledgerBalance:0,heldBalance:0,status:'active',rechargeNumber,marketCashId,createdAt:now,updatedAt:now});
    }else{
      batch.set(ref,{accountType:'agent',rechargeNumber,marketCashId,updatedAt:now},{merge:true});
    }
  }
  batch.set(db.doc(`wallet_recharge_numbers/${rechargeNumber}`),{userId:agentUid,rechargeNumber,updatedAt:now},{merge:true});
  batch.set(db.doc(`wallet_public_ids/${marketCashId}`),{userId:agentUid,marketCashId,updatedAt:now},{merge:true});
  await batch.commit();
  return{rechargeNumber,marketCashId};
}

async function readWallets(agentUid:string){
  const result:Record<string,any>={};
  for(const currency of CURRENCIES){
    const snap=await db.doc(`wallet_accounts/${walletId(agentUid,currency)}`).get();
    const data=snap.data();
    result[currency]=data?{
      id:snap.id,
      userId:String(data.userId||agentUid),
      accountType:String(data.accountType||'agent'),
      currency,
      status:String(data.status||'active'),
      availableBalance:Number(data.availableBalance||0),
      ledgerBalance:Number(data.ledgerBalance||0),
      heldBalance:Number(data.heldBalance||0),
      rechargeNumber:String(data.rechargeNumber||''),
      marketCashId:String(data.marketCashId||''),
      updatedAt:Number(data.updatedAt||0),
    }:null;
  }
  return result;
}

export const getMyAgentAccountSnapshot=onCall({region:REGION},async request=>{
  const agentUid=requireAuth(request);
  await requireActiveAgent(agentUid);
  const identity=await ensureAgentWallets(agentUid);
  return{
    ...identity,
    isAgent:true,
    wallets:await readWallets(agentUid),
  };
});

export const adminGetAgentDetails=onCall({region:REGION},async request=>{
  const adminUid=requireAuth(request);
  await requireAdmin(adminUid);
  const agentUid=String(request.data?.agentUid||'').trim();
  const{user,profile}=await requireActiveAgent(agentUid);
  const identity=await ensureAgentWallets(agentUid);
  const txSnap=await db.collection('wallet_transactions').where('agentId','==',agentUid).limit(30).get();
  const transactions=txSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,12);
  const u=user.data()||{};
  const p=profile.data()||{};
  return{
    agent:{
      uid:agentUid,
      displayName:String(u.displayName||p.legalName||'Agent Market-Cash'),
      email:String(u.email||p.email||''),
      phone:String(u.phone||p.phone||''),
      accountStatus:String(u.accountStatus||'active'),
      kycStatus:String(u.kycStatus||'not_started'),
      mustChangePin:Boolean(u.mustChangePin),
      pointName:String(p.pointName||''),
      legalName:String(p.legalName||''),
      activity:String(p.activity||''),
      city:String(p.city||''),
      address:String(p.address||''),
      openingHours:String(p.openingHours||''),
      approvedAt:Number(p.approvedAt||0),
      rechargeNumber:identity.rechargeNumber,
      marketCashId:identity.marketCashId,
    },
    wallets:await readWallets(agentUid),
    transactions,
  };
});

export const adminFundAgentFloatV2=onCall({region:REGION},async request=>{
  const adminUid=requireAuth(request);
  await requireAdmin(adminUid);
  const agentUid=String(request.data?.agentUid||'').trim();
  await requireActiveAgent(agentUid);
  const currency=parseCurrency(request.data?.currency);
  const amount=parseAmount(request.data?.amount);
  const reason=String(request.data?.reason||'').trim();
  if(reason.length<5)throw new HttpsError('invalid-argument','Motif obligatoire.');
  await ensureAgentWallets(agentUid);

  const ref=db.doc(`wallet_accounts/${walletId(agentUid,currency)}`);
  const now=Date.now();
  const id=`fundv2_${agentUid}_${now}_${randomInt(1000,9999)}`;
  const reference=`MC-FLOAT-${now}`;

  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists)throw new HttpsError('failed-precondition','Wallet agent non initialisé.');
    const wallet=snap.data()||{};
    if(String(wallet.status||'active')!=='active')throw new HttpsError('failed-precondition','Wallet agent gelé.');
    const before=Number(wallet.availableBalance||0);
    const ledgerBefore=Number(wallet.ledgerBalance||0);
    const after=before+amount;
    tx.update(ref,{availableBalance:after,ledgerBalance:ledgerBefore+amount,updatedAt:now});
    tx.set(db.doc(`wallet_transactions/${id}`),{id,reference,type:'agent_float_funding',status:'settled',currency,amount,agentId:agentUid,userIds:[agentUid],source:'administration',approvedBy:adminUid,reason,balanceBefore:before,balanceAfter:after,createdAt:now,updatedAt:now});
    tx.set(db.collection('audit_events').doc(),{actorId:adminUid,actorType:'admin_general',action:'AGENT_FLOAT_FUNDED_V2',agentId:agentUid,amount,currency,reason,balanceBefore:before,balanceAfter:after,result:'success',createdAt:now});
    tx.set(db.collection('notifications').doc(),{userId:agentUid,title:'Float agent crédité',message:`Votre float ${currency} a été crédité de ${amount} ${currency}.`,type:'success',category:'general',read:false,transactionId:id,createdAt:now});
  });

  const wallets=await readWallets(agentUid);
  const credited=wallets[currency];
  if(!credited||Number(credited.availableBalance)<amount)throw new HttpsError('internal','Le crédit n’a pas pu être vérifié après écriture.');
  return{ok:true,transactionId:id,reference,wallets};
});
