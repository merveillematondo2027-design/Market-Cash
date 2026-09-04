import {createHash,randomInt} from 'node:crypto';
import {getApps,initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {HttpsError,onCall} from 'firebase-functions/v2/https';
import {requireMarketCashTransactionCvv} from './security';

if(!getApps().length)initializeApp();
const db=getFirestore();
const REGION='europe-west1';
const CURRENCIES=['USD','CDF'] as const;
type Currency=typeof CURRENCIES[number];
type IdentityRole='client'|'agent'|'marchand';

const sha256=(value:string)=>createHash('sha256').update(value).digest('hex');
const walletId=(uid:string,currency:Currency)=>`wallet_${currency.toLowerCase()}_${uid}`;
const cardAccountId=(cardId:string,currency:Currency)=>`card_${currency.toLowerCase()}_${cardId}`;
const localCardIdForUid=(uid:string)=>`local_${sha256(`local-card:${uid}`).slice(0,24)}`;
const legacyMarketCashIdForUid=(uid:string)=>`MCW-${sha256(`market-cash:${uid}`).slice(0,10).toUpperCase()}`;
const rechargeNumberForUid=(uid:string)=>(BigInt(`0x${sha256(uid).slice(0,15)}`)%100000000000n).toString().padStart(11,'0');

function requireAuth(request:any){const uid=String(request.auth?.uid||'');if(!uid)throw new HttpsError('unauthenticated','Connexion requise.');return uid}
function parseCurrency(value:any):Currency{const c=String(value||'').toUpperCase() as Currency;if(!CURRENCIES.includes(c))throw new HttpsError('invalid-argument','Devise invalide.');return c}
function parseAmount(value:any){const amount=Number(value);if(!Number.isFinite(amount)||amount<=0)throw new HttpsError('invalid-argument','Montant invalide.');return Math.round(amount*100)/100}
function parseKey(value:any,prefix:string,uid:string){const raw=String(value||'').trim();if(!raw)return`${prefix}_${uid}_${Date.now()}_${randomInt(1000,9999)}`;if(!/^[A-Za-z0-9_-]{8,120}$/.test(raw))throw new HttpsError('invalid-argument','Clé de transaction invalide.');return raw}
function roleOf(value:any):IdentityRole{const role=String(value||'client');return role==='agent'?'agent':role==='marchand'?'marchand':'client'}
function prefixFor(role:IdentityRole){return role==='agent'?'MCA':role==='marchand'?'MCM':'MCW'}
function accountTypeFor(role:IdentityRole){return role==='agent'?'agent':role==='marchand'?'business':'client'}
function holderLetter(name:any){const clean=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();return clean.match(/[A-Z]/)?.[0]||'X'}
function validCanonical(value:string,role:IdentityRole){return new RegExp(`^${prefixFor(role)}-\\d{6}[A-Z]$`).test(value)}
function acceptedLegacy(value:string){return /^MCW-[A-F0-9]{10}$/.test(value)}
function acceptedClient(value:string){return /^MCW-\d{6}[A-Z]$/.test(value)||acceptedLegacy(value)}
function acceptedMerchant(value:string){return /^MCM-\d{6}[A-Z]$/.test(value)||acceptedLegacy(value)}

async function userSnap(uid:string){const snap=await db.doc(`users/${uid}`).get();if(!snap.exists)throw new HttpsError('not-found','Compte introuvable.');if(['blocked','suspended'].includes(String(snap.data()?.accountStatus||'')))throw new HttpsError('failed-precondition','Compte indisponible.');return snap}
async function canonicalFor(uid:string,role:IdentityRole,displayName:string){
  const user=await userSnap(uid);const stored=String(user.data()?.marketCashId||'').toUpperCase();
  if(validCanonical(stored,role)){const map=await db.doc(`wallet_public_ids/${stored}`).get();if(!map.exists||map.data()?.userId===uid)return stored}
  const letter=holderLetter(displayName);
  for(let attempt=0;attempt<100;attempt+=1){
    const digits=(BigInt(`0x${sha256(`market-cash-v2:${uid}:${attempt}`).slice(0,15)}`)%1000000n).toString().padStart(6,'0');
    const candidate=`${prefixFor(role)}-${digits}${letter}`;
    const map=await db.doc(`wallet_public_ids/${candidate}`).get();
    if(!map.exists||map.data()?.userId===uid)return candidate;
  }
  throw new HttpsError('resource-exhausted','Impossible de générer un identifiant Market-Cash unique.');
}

async function ensureIdentity(uid:string){
  const user=await userSnap(uid);const data=user.data()!;const role=roleOf(data.role);const displayName=String(data.displayName||data.fullName||'CLIENT MARKET-CASH');
  const canonical=await canonicalFor(uid,role,displayName);const legacy=legacyMarketCashIdForUid(uid);const rechargeNumber=rechargeNumberForUid(uid);const now=Date.now();
  const batch=db.batch();
  const primaryRef=db.doc(`wallet_public_ids/${canonical}`);const primary=await primaryRef.get();
  if(primary.exists&&primary.data()?.userId!==uid)throw new HttpsError('already-exists','Collision d’identifiant Market-Cash.');
  batch.set(primaryRef,{userId:uid,marketCashId:canonical,role,prefix:prefixFor(role),canonical:true,updatedAt:now,createdAt:primary.data()?.createdAt||now},{merge:true});
  const legacyRef=db.doc(`wallet_public_ids/${legacy}`);const legacySnap=await legacyRef.get();
  if(!legacySnap.exists||legacySnap.data()?.userId===uid)batch.set(legacyRef,{userId:uid,marketCashId:legacy,aliasFor:canonical,role,canonical:false,legacy:true,updatedAt:now,createdAt:legacySnap.data()?.createdAt||now},{merge:true});
  batch.set(db.doc(`users/${uid}`),{marketCashId:canonical,marketCashLegacyId:legacy,updatedAt:now},{merge:true});
  for(const currency of CURRENCIES){
    const ref=db.doc(`wallet_accounts/${walletId(uid,currency)}`);const snap=await ref.get();
    if(!snap.exists)batch.set(ref,{id:ref.id,userId:uid,accountType:accountTypeFor(role),currency,availableBalance:0,ledgerBalance:0,heldBalance:0,status:'active',rechargeNumber,marketCashId:canonical,createdAt:now,updatedAt:now});
    else batch.set(ref,{accountType:accountTypeFor(role),rechargeNumber,marketCashId:canonical,updatedAt:now},{merge:true});
  }
  const rechargeRef=db.doc(`wallet_recharge_numbers/${rechargeNumber}`);const rechargeSnap=await rechargeRef.get();if(!rechargeSnap.exists)batch.set(rechargeRef,{userId:uid,rechargeNumber,createdAt:now});
  await batch.commit();
  return{marketCashId:canonical,legacyMarketCashId:legacy,rechargeNumber,role};
}

async function walletSnapshot(uid:string){const wallets:any={};for(const c of CURRENCIES)wallets[c]=(await db.doc(`wallet_accounts/${walletId(uid,c)}`).get()).data()||null;return wallets}
async function resolveMapping(value:any,kind:'client'|'merchant'){
  const id=String(value||'').trim().toUpperCase();
  if(kind==='client'&&!acceptedClient(id))throw new HttpsError('invalid-argument','ID client invalide. Format attendu : MCW-123456A.');
  if(kind==='merchant'&&!acceptedMerchant(id))throw new HttpsError('invalid-argument','ID marchand invalide. Format attendu : MCM-123456A.');
  const map=await db.doc(`wallet_public_ids/${id}`).get();if(!map.exists)throw new HttpsError('not-found',kind==='merchant'?'Marchand introuvable.':'Bénéficiaire introuvable.');
  const uid=String(map.data()?.userId||'');if(!uid)throw new HttpsError('not-found','Compte introuvable.');
  const user=await userSnap(uid);const role=String(user.data()?.role||'client');
  if(kind==='client'&&role!=='client')throw new HttpsError('failed-precondition','Cet identifiant ne correspond pas à un Wallet client.');
  if(kind==='merchant'&&role!=='marchand')throw new HttpsError('failed-precondition','Cet identifiant ne correspond pas à un Marchand Market-Cash.');
  const identity=await ensureIdentity(uid);
  return{uid,user,identity};
}

export const ensureWalletProfileV2=onCall({region:REGION},async request=>{const uid=requireAuth(request);const identity=await ensureIdentity(uid);return{ok:true,...identity,isAgent:identity.role==='agent',wallets:await walletSnapshot(uid)}});
export const getMyWalletsV2=onCall({region:REGION},async request=>{const uid=requireAuth(request);const identity=await ensureIdentity(uid);return{...identity,isAgent:identity.role==='agent',wallets:await walletSnapshot(uid)}});
export const getMyMarketCashIdentityV2=onCall({region:REGION},async request=>{const uid=requireAuth(request);const identity=await ensureIdentity(uid);return{marketCashId:identity.marketCashId}});

export const lookupMarketCashRecipientV2=onCall({region:REGION},async request=>{
  const sender=requireAuth(request);const resolved=await resolveMapping(request.data?.marketCashId,'client');if(resolved.uid===sender)throw new HttpsError('failed-precondition','Vous ne pouvez pas vous envoyer de l’argent à vous-même.');
  return{userId:resolved.uid,marketCashId:resolved.identity.marketCashId,displayName:String(resolved.user.data()?.displayName||'Utilisateur Market-Cash')};
});

export const lookupMerchantRecipientV2=onCall({region:REGION},async request=>{
  const payer=requireAuth(request);const resolved=await resolveMapping(request.data?.marketCashId,'merchant');if(resolved.uid===payer)throw new HttpsError('failed-precondition','Marchand invalide.');
  const profile=await db.doc(`merchant_profiles/${resolved.uid}`).get();if(!profile.exists||profile.data()?.status!=='active')throw new HttpsError('failed-precondition','Marchand Market-Cash non actif.');
  return{userId:resolved.uid,marketCashId:resolved.identity.marketCashId,displayName:String(profile.data()?.tradeName||resolved.user.data()?.displayName||'Marchand Market-Cash'),legalName:String(profile.data()?.legalName||'')};
});

export const lookupAgentClientByMarketCashIdV2=onCall({region:REGION},async request=>{
  const agent=requireAuth(request);const agentUser=await userSnap(agent);if(agentUser.data()?.role!=='agent')throw new HttpsError('permission-denied','Compte Agent requis.');
  const resolved=await resolveMapping(request.data?.marketCashId,'client');if(resolved.uid===agent)throw new HttpsError('failed-precondition','Client invalide.');
  return{userId:resolved.uid,marketCashId:resolved.identity.marketCashId,displayName:String(resolved.user.data()?.displayName||'Client Market-Cash'),phone:String(resolved.user.data()?.phone||'')};
});

export const agentCashInByMarketCashIdV2=onCall({region:REGION},async request=>{
  const agentUid=requireAuth(request);const agentUser=await userSnap(agentUid);if(agentUser.data()?.role!=='agent')throw new HttpsError('permission-denied','Compte Agent requis.');
  const profile=await db.doc(`agent_profiles/${agentUid}`).get();if(!profile.exists||profile.data()?.status!=='active')throw new HttpsError('permission-denied','Compte Agent non autorisé.');
  const pin=String(request.data?.pin||'');if(!pin||String(agentUser.data()?.pinHash||'')!==sha256(pin))throw new HttpsError('permission-denied','Code secret Agent incorrect.');
  const currency=parseCurrency(request.data?.currency);const amount=parseAmount(request.data?.amount);const txId=parseKey(request.data?.idempotencyKey,'cashin-v2',agentUid);
  const client=await resolveMapping(request.data?.marketCashId,'client');await ensureIdentity(agentUid);
  return db.runTransaction(async tx=>{
    const txRef=db.doc(`wallet_transactions/${txId}`);const exists=await tx.get(txRef);if(exists.exists)return{ok:true,duplicate:true,reference:exists.data()?.reference,transactionId:txId};
    const agentRef=db.doc(`wallet_accounts/${walletId(agentUid,currency)}`);const clientRef=db.doc(`wallet_accounts/${walletId(client.uid,currency)}`);const[a,c]=await Promise.all([tx.get(agentRef),tx.get(clientRef)]);const ad=a.data(),cd=c.data();
    if(!ad||!cd||ad.status!=='active'||cd.status!=='active')throw new HttpsError('failed-precondition','Portefeuille indisponible.');if(Number(ad.availableBalance||0)<amount)throw new HttpsError('failed-precondition','Float Agent insuffisant.');
    const now=Date.now(),reference=`MC-DEP-${now}`;tx.update(agentRef,{availableBalance:Number(ad.availableBalance||0)-amount,ledgerBalance:Number(ad.ledgerBalance||0)-amount,updatedAt:now});tx.update(clientRef,{availableBalance:Number(cd.availableBalance||0)+amount,ledgerBalance:Number(cd.ledgerBalance||0)+amount,updatedAt:now});
    tx.set(txRef,{id:txId,reference,type:'cash_in',status:'settled',currency,amount,agentId:agentUid,clientId:client.uid,clientMarketCashId:client.identity.marketCashId,userIds:[agentUid,client.uid],sourceWalletId:agentRef.id,destinationWalletId:clientRef.id,rail:'agent_terminal_market_cash_v2',authenticatedBy:'agent_application_secret',createdAt:now,updatedAt:now});
    tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,walletId:agentRef.id,userId:agentUid,direction:'debit',amount,currency,createdAt:now});tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,walletId:clientRef.id,userId:client.uid,direction:'credit',amount,currency,createdAt:now});
    tx.set(db.collection('notifications').doc(),{userId:client.uid,title:'Dépôt reçu',message:`Un Agent Market-Cash a déposé ${amount} ${currency} sur votre portefeuille.`,type:'success',category:'general',read:false,transactionId:txId,createdAt:now});return{ok:true,reference,transactionId:txId};
  });
});

export const merchantPaymentFromLocalCardWithCvvV2=onCall({region:REGION},async request=>{
  const payerUid=requireAuth(request);const payer=await userSnap(payerUid);if(payer.data()?.role!=='client'||payer.data()?.kycStatus!=='approved')throw new HttpsError('failed-precondition','Compte client vérifié requis.');
  await requireMarketCashTransactionCvv(payerUid,request.data?.cvv);
  const currency=parseCurrency(request.data?.currency),amount=parseAmount(request.data?.amount),txId=parseKey(request.data?.idempotencyKey,'merchant-v2',payerUid);
  const cardId=localCardIdForUid(payerUid);if(String(request.data?.cardId||'')!==cardId)throw new HttpsError('permission-denied','Carte locale obligatoire.');
  const card=await db.doc(`local_cards/${cardId}`).get();if(!card.exists||card.data()?.status!=='active'||card.data()?.userId!==payerUid)throw new HttpsError('failed-precondition','Carte locale indisponible.');
  const merchant=await resolveMapping(request.data?.marketCashId,'merchant');if(merchant.uid===payerUid)throw new HttpsError('failed-precondition','Marchand invalide.');const profile=await db.doc(`merchant_profiles/${merchant.uid}`).get();if(!profile.exists||profile.data()?.status!=='active')throw new HttpsError('failed-precondition','Marchand Market-Cash non actif.');
  return db.runTransaction(async tx=>{
    const txRef=db.doc(`wallet_transactions/${txId}`),existing=await tx.get(txRef);if(existing.exists)return{ok:true,duplicate:true,reference:existing.data()?.reference,transactionId:txId,merchantName:String(profile.data()?.tradeName||'Marchand')};
    const source=db.doc(`card_wallet_accounts/${cardAccountId(cardId,currency)}`),destination=db.doc(`wallet_accounts/${walletId(merchant.uid,currency)}`);const[s,d]=await Promise.all([tx.get(source),tx.get(destination)]);const sd=s.data(),dd=d.data();if(!sd||!dd||sd.status!=='active'||dd.status!=='active')throw new HttpsError('failed-precondition','Compte de paiement indisponible.');if(Number(sd.availableBalance||0)<amount)throw new HttpsError('failed-precondition','Solde de la carte locale insuffisant.');
    const now=Date.now(),reference=`MC-PAY-${now}`,merchantName=String(profile.data()?.tradeName||merchant.user.data()?.displayName||'Marchand Market-Cash');tx.update(source,{availableBalance:Number(sd.availableBalance||0)-amount,ledgerBalance:Number(sd.ledgerBalance||0)-amount,updatedAt:now});tx.update(destination,{availableBalance:Number(dd.availableBalance||0)+amount,ledgerBalance:Number(dd.ledgerBalance||0)+amount,updatedAt:now});
    tx.set(txRef,{id:txId,reference,type:'merchant_payment',status:'settled',currency,amount,senderId:payerUid,recipientId:merchant.uid,merchantId:merchant.uid,merchantMarketCashId:merchant.identity.marketCashId,merchantName,cardId,userIds:[payerUid,merchant.uid],sourceCardWalletId:source.id,destinationWalletId:destination.id,rail:'market_cash_local_card_merchant_v2',authenticatedBy:'local_cvv',createdAt:now,updatedAt:now});
    tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,cardWalletId:source.id,userId:payerUid,direction:'debit',amount,currency,createdAt:now});tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,walletId:destination.id,userId:merchant.uid,direction:'credit',amount,currency,createdAt:now});tx.set(db.collection('notifications').doc(),{userId:merchant.uid,title:'Paiement reçu',message:`Vous avez reçu ${amount} ${currency} par carte locale Market-Cash.`,type:'success',category:'general',read:false,transactionId:txId,createdAt:now});
    return{ok:true,reference,transactionId:txId,merchantName};
  });
});
