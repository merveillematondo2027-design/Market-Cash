import { createHash, randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { verifyApplicationPinForUser } from './security';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
type Currency = typeof CURRENCIES[number];

const sha256 = (value:string) => createHash('sha256').update(value).digest('hex');
const round = (value:number) => Math.round(value * 100) / 100;
const walletId = (uid:string,currency:Currency) => `wallet_${currency.toLowerCase()}_${uid}`;
const localCardId = (uid:string) => `local_${sha256(`local-card:${uid}`).slice(0,24)}`;
const cardWalletId = (cardId:string,currency:Currency) => `card_${currency.toLowerCase()}_${cardId}`;
const developerIdForUid = (uid:string) => `DEV-${sha256(`developer:${uid}`).slice(0,10).toUpperCase()}`;
const billingId = (developerId:string) => `billing_${developerId}`;

function requireAuth(request:any){
  const uid=String(request.auth?.uid||'');
  if(!uid)throw new HttpsError('unauthenticated','Connexion requise.');
  return uid;
}
function parseCurrency(value:any):Currency{
  const currency=String(value||'').toUpperCase() as Currency;
  if(!CURRENCIES.includes(currency))throw new HttpsError('invalid-argument','Devise invalide.');
  return currency;
}
function parseAmount(value:any){
  const amount=Number(value);
  if(!Number.isFinite(amount)||amount<=0)throw new HttpsError('invalid-argument','Montant invalide.');
  return round(amount);
}
function parseIdempotencyKey(value:any,prefix:string,uid:string){
  const raw=String(value||'').trim();
  if(!raw)return `${prefix}_${uid}_${Date.now()}_${randomInt(1000,9999)}`;
  if(!/^[A-Za-z0-9_-]{8,120}$/.test(raw))throw new HttpsError('invalid-argument','Clé de transaction invalide.');
  return raw;
}
async function requireDeveloper(uid:string){
  const [user,developer]=await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`developer_accounts/${developerIdForUid(uid)}`).get(),
  ]);
  if(!user.exists)throw new HttpsError('not-found','Compte introuvable.');
  const data=user.data()||{};
  const role=String(data.role||'');
  const mode=String(data.businessAccountType||'');
  const allowed=role==='developer'||role==='api_partner'||mode==='direct_developer'||mode==='api_provider';
  if(!allowed)throw new HttpsError('permission-denied','Compte Developer Market-Cash requis.');
  const status=String(data.accountStatus||'active');
  const suspensionActive=status==='suspended'&&(!data.suspendedUntil||Number(data.suspendedUntil)>Date.now());
  if(['blocked','banned','deleted'].includes(status)||suspensionActive)throw new HttpsError('failed-precondition','Compte momentanément indisponible.');
  if(!developer.exists||developer.data()?.status!=='active')throw new HttpsError('failed-precondition','Compte Developer non actif.');
  return {user,developer,developerId:developer.id};
}
async function ensureWallet(uid:string,currency:Currency,accountType='client'){
  const ref=db.doc(`wallet_accounts/${walletId(uid,currency)}`);
  const snap=await ref.get();
  if(!snap.exists){
    const now=Date.now();
    await ref.set({id:ref.id,userId:uid,accountType,currency,availableBalance:0,ledgerBalance:0,heldBalance:0,status:'active',createdAt:now,updatedAt:now});
  }
  return ref;
}
async function ownedLocalCard(uid:string){
  const ref=db.doc(`local_cards/${localCardId(uid)}`);
  const snap=await ref.get();
  if(!snap.exists||snap.data()?.userId!==uid||snap.data()?.program!=='market_cash_local'||snap.data()?.status!=='active')throw new HttpsError('failed-precondition','Carte locale Market-Cash indisponible.');
  return {ref,snap,data:snap.data()!};
}
async function ensureDeveloperCvv(uid:string){
  await requireDeveloper(uid);
  const ref=db.doc(`user_security/${uid}`);
  const snap=await ref.get();
  const existing=String(snap.data()?.localTransactionCvv||'');
  if(/^\d{3}$/.test(existing)){
    if(!snap.data()?.localTransactionCvvHash)await ref.set({localTransactionCvvHash:sha256(existing),updatedAt:Date.now()},{merge:true});
    return existing;
  }
  const cvv=randomInt(100,1000).toString();
  const now=Date.now();
  await ref.set({userId:uid,localTransactionCvv:cvv,localTransactionCvvHash:sha256(cvv),cvvVersion:Number(snap.data()?.cvvVersion||0)+1,cvvUpdatedAt:now,createdAt:snap.data()?.createdAt||now,updatedAt:now},{merge:true});
  return cvv;
}
async function requireDeveloperCvv(uid:string,value:any){
  const cvv=String(value||'').replace(/\D/g,'');
  if(!/^\d{3}$/.test(cvv))throw new HttpsError('invalid-argument','CVV Market-Cash à 3 chiffres requis.');
  const existing=await ensureDeveloperCvv(uid);
  const security=await db.doc(`user_security/${uid}`).get();
  const expectedHash=String(security.data()?.localTransactionCvvHash||sha256(existing));
  if(sha256(cvv)!==expectedHash)throw new HttpsError('permission-denied','CVV Market-Cash incorrect.');
}
async function resolveRecipient(marketCashIdRaw:any,senderUid:string){
  const marketCashId=String(marketCashIdRaw||'').trim().toUpperCase();
  if(!/^MCW-[A-F0-9]{10}$/.test(marketCashId))throw new HttpsError('invalid-argument','ID Market-Cash invalide.');
  const mapping=await db.doc(`wallet_public_ids/${marketCashId}`).get();
  if(!mapping.exists)throw new HttpsError('not-found','Bénéficiaire Market-Cash introuvable.');
  const recipientUid=String(mapping.data()?.userId||'');
  if(!recipientUid||recipientUid===senderUid)throw new HttpsError('failed-precondition','Bénéficiaire invalide.');
  const user=await db.doc(`users/${recipientUid}`).get();
  if(!user.exists)throw new HttpsError('not-found','Profil bénéficiaire introuvable.');
  const status=String(user.data()?.accountStatus||'active');
  if(['blocked','banned','deleted'].includes(status))throw new HttpsError('failed-precondition','Bénéficiaire indisponible.');
  return {recipientUid,marketCashId,displayName:String(user.data()?.displayName||'Utilisateur Market-Cash')};
}
async function resolveMerchant(marketCashIdRaw:any,payerUid:string){
  const recipient=await resolveRecipient(marketCashIdRaw,payerUid);
  const [user,profile]=await Promise.all([
    db.doc(`users/${recipient.recipientUid}`).get(),
    db.doc(`merchant_profiles/${recipient.recipientUid}`).get(),
  ]);
  if(user.data()?.role!=='marchand'||!profile.exists||profile.data()?.status!=='active')throw new HttpsError('failed-precondition','Ce compte n’est pas un marchand Market-Cash actif.');
  return {...recipient,displayName:String(profile.data()?.tradeName||user.data()?.displayName||'Marchand Market-Cash')};
}
async function ensureBilling(developerId:string,uid:string,tier:string){
  const ref=db.doc(`developer_billing_accounts/${billingId(developerId)}`);
  const snap=await ref.get();
  if(!snap.exists){const now=Date.now();await ref.set({id:ref.id,developerId,userId:uid,currency:'USD',availableBalance:0,ledgerBalance:0,status:'active',pricingTier:tier,createdAt:now,updatedAt:now});}
  return ref;
}

export const developerRevealLocalCardSecureData=onCall({region:REGION},async request=>{
  const uid=requireAuth(request);
  await requireDeveloper(uid);
  await verifyApplicationPinForUser(uid,request.data?.pin);
  const cvv=await ensureDeveloperCvv(uid);
  const card=await ownedLocalCard(uid);
  await db.collection('audit_events').add({actorId:uid,actorType:'developer',action:'DEVELOPER_LOCAL_CARD_DETAILS_REVEALED',cardId:card.ref.id,result:'success',createdAt:Date.now()});
  return {cardId:card.ref.id,cardNumber:String(card.data.cardNumber||''),cardHolder:String(card.data.cardHolder||card.data.cardHolderName||''),expiryStart:String(card.data.expiryStart||''),expiryEnd:String(card.data.expiryEnd||''),cvv};
});

export const developerWalletTransferWithCvv=onCall({region:REGION},async request=>{
  const uid=requireAuth(request);const dev=await requireDeveloper(uid);const currency=parseCurrency(request.data?.currency);const amount=parseAmount(request.data?.amount);const txId=parseIdempotencyKey(request.data?.idempotencyKey,'devtransfer',uid);
  await requireDeveloperCvv(uid,request.data?.cvv);const recipient=await resolveRecipient(request.data?.marketCashId,uid);await Promise.all([ensureWallet(uid,currency,'client'),ensureWallet(recipient.recipientUid,currency,recipient.recipientUid?'client':'client')]);
  return db.runTransaction(async tx=>{const txRef=db.doc(`wallet_transactions/${txId}`),existing=await tx.get(txRef);if(existing.exists)return{ok:true,duplicate:true,reference:existing.data()?.reference,transactionId:txId};const source=db.doc(`wallet_accounts/${walletId(uid,currency)}`),dest=db.doc(`wallet_accounts/${walletId(recipient.recipientUid,currency)}`);const[s,d]=await Promise.all([tx.get(source),tx.get(dest)]);if(!s.exists||s.data()?.status!=='active'||Number(s.data()?.availableBalance||0)<amount)throw new HttpsError('failed-precondition','Solde portefeuille insuffisant.');if(!d.exists||d.data()?.status!=='active')throw new HttpsError('failed-precondition','Portefeuille bénéficiaire indisponible.');const now=Date.now(),reference=`MC-DEV-TRF-${now}`,sb=Number(s.data()?.availableBalance||0),dbal=Number(d.data()?.availableBalance||0);tx.update(source,{availableBalance:round(sb-amount),ledgerBalance:round(Number(s.data()?.ledgerBalance||sb)-amount),updatedAt:now});tx.update(dest,{availableBalance:round(dbal+amount),ledgerBalance:round(Number(d.data()?.ledgerBalance||dbal)+amount),updatedAt:now});tx.set(txRef,{id:txId,reference,type:'developer_personal_transfer',status:'settled',developerId:dev.developerId,userId:uid,senderId:uid,recipientId:recipient.recipientUid,userIds:[uid,recipient.recipientUid],currency,amount,sourceWalletId:source.id,destinationWalletId:dest.id,authenticatedBy:'local_cvv',adminVisible:true,createdAt:now,updatedAt:now});tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,walletId:source.id,userId:uid,direction:'debit',amount,currency,createdAt:now});tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,walletId:dest.id,userId:recipient.recipientUid,direction:'credit',amount,currency,createdAt:now});tx.set(db.collection('notifications').doc(),{userId:recipient.recipientUid,title:'Argent reçu',message:`Vous avez reçu ${amount} ${currency} de ${String(dev.developer.data()?.companyName||'un Developer Market-Cash')}.`,type:'success',category:'transaction',read:false,transactionId:txId,createdAt:now});return{ok:true,reference,transactionId:txId};});
});

export const developerWalletToLocalCardWithCvv=onCall({region:REGION},async request=>{
  const uid=requireAuth(request);const dev=await requireDeveloper(uid);const currency=parseCurrency(request.data?.currency);const amount=parseAmount(request.data?.amount);const txId=parseIdempotencyKey(request.data?.idempotencyKey,'devcardtopup',uid);await requireDeveloperCvv(uid,request.data?.cvv);const card=await ownedLocalCard(uid);await ensureWallet(uid,currency,'client');
  return db.runTransaction(async tx=>{const txRef=db.doc(`wallet_transactions/${txId}`),existing=await tx.get(txRef);if(existing.exists)return{ok:true,duplicate:true,reference:existing.data()?.reference,transactionId:txId};const walletRef=db.doc(`wallet_accounts/${walletId(uid,currency)}`),cardRef=db.doc(`card_wallet_accounts/${cardWalletId(card.ref.id,currency)}`);const[w,c]=await Promise.all([tx.get(walletRef),tx.get(cardRef)]);const wb=Number(w.data()?.availableBalance||0);if(!w.exists||w.data()?.status!=='active'||wb<amount)throw new HttpsError('failed-precondition','Solde portefeuille insuffisant.');const cb=Number(c.data()?.availableBalance||0),cl=Number(c.data()?.ledgerBalance||cb),now=Date.now(),reference=`MC-DEV-CARD-${now}`;tx.update(walletRef,{availableBalance:round(wb-amount),ledgerBalance:round(Number(w.data()?.ledgerBalance||wb)-amount),updatedAt:now});tx.set(cardRef,{id:cardRef.id,cardId:card.ref.id,userId:uid,currency,availableBalance:round(cb+amount),ledgerBalance:round(cl+amount),heldBalance:Number(c.data()?.heldBalance||0),status:'active',createdAt:c.data()?.createdAt||now,updatedAt:now},{merge:true});tx.set(txRef,{id:txId,reference,type:'developer_wallet_to_local_card',status:'settled',developerId:dev.developerId,userId:uid,userIds:[uid],cardId:card.ref.id,currency,amount,sourceWalletId:walletRef.id,destinationCardWalletId:cardRef.id,authenticatedBy:'local_cvv',adminVisible:true,createdAt:now,updatedAt:now});tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,walletId:walletRef.id,userId:uid,direction:'debit',amount,currency,createdAt:now});tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,cardWalletId:cardRef.id,userId:uid,direction:'credit',amount,currency,createdAt:now});return{ok:true,reference,transactionId:txId};});
});

export const developerMerchantPaymentWithCvv=onCall({region:REGION},async request=>{
  const uid=requireAuth(request);const dev=await requireDeveloper(uid);const currency=parseCurrency(request.data?.currency);const amount=parseAmount(request.data?.amount);const txId=parseIdempotencyKey(request.data?.idempotencyKey,'devmerchantpay',uid);await requireDeveloperCvv(uid,request.data?.cvv);const card=await ownedLocalCard(uid);const merchant=await resolveMerchant(request.data?.marketCashId,uid);await ensureWallet(merchant.recipientUid,currency,'business');
  return db.runTransaction(async tx=>{const txRef=db.doc(`wallet_transactions/${txId}`),existing=await tx.get(txRef);if(existing.exists)return{ok:true,duplicate:true,reference:existing.data()?.reference,transactionId:txId,merchantName:merchant.displayName};const cardRef=db.doc(`card_wallet_accounts/${cardWalletId(card.ref.id,currency)}`),merchantWallet=db.doc(`wallet_accounts/${walletId(merchant.recipientUid,currency)}`);const[c,m]=await Promise.all([tx.get(cardRef),tx.get(merchantWallet)]);const cb=Number(c.data()?.availableBalance||0);if(!c.exists||c.data()?.status!=='active'||cb<amount)throw new HttpsError('failed-precondition','Solde de la carte locale insuffisant.');const mb=Number(m.data()?.availableBalance||0),now=Date.now(),reference=`MC-DEV-PAY-${now}`;tx.update(cardRef,{availableBalance:round(cb-amount),ledgerBalance:round(Number(c.data()?.ledgerBalance||cb)-amount),updatedAt:now});tx.update(merchantWallet,{availableBalance:round(mb+amount),ledgerBalance:round(Number(m.data()?.ledgerBalance||mb)+amount),updatedAt:now});tx.set(txRef,{id:txId,reference,type:'developer_merchant_payment',status:'settled',developerId:dev.developerId,userId:uid,senderId:uid,recipientId:merchant.recipientUid,merchantId:merchant.recipientUid,merchantName:merchant.displayName,userIds:[uid,merchant.recipientUid],cardId:card.ref.id,currency,amount,sourceCardWalletId:cardRef.id,destinationWalletId:merchantWallet.id,authenticatedBy:'local_cvv',adminVisible:true,createdAt:now,updatedAt:now});tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,cardWalletId:cardRef.id,userId:uid,direction:'debit',amount,currency,createdAt:now});tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,walletId:merchantWallet.id,userId:merchant.recipientUid,direction:'credit',amount,currency,createdAt:now});tx.set(db.collection('notifications').doc(),{userId:merchant.recipientUid,title:'Paiement reçu',message:`Vous avez reçu ${amount} ${currency} via Market-Cash.`,type:'success',category:'transaction',read:false,transactionId:txId,createdAt:now});return{ok:true,reference,transactionId:txId,merchantName:merchant.displayName};});
});

export const developerFundApiBillingFromWallet=onCall({region:REGION},async request=>{
  const uid=requireAuth(request);const dev=await requireDeveloper(uid);await verifyApplicationPinForUser(uid,request.data?.pin);const amount=parseAmount(request.data?.amount);const txId=parseIdempotencyKey(request.data?.idempotencyKey,'devapitopup',uid);const tier=dev.developer.data()?.businessType==='api_provider'?'wholesale':'direct';const billingRef=await ensureBilling(dev.developerId,uid,tier);await ensureWallet(uid,'USD','client');
  return db.runTransaction(async tx=>{const txRef=db.doc(`wallet_transactions/${txId}`),existing=await tx.get(txRef);if(existing.exists)return{ok:true,duplicate:true,balance:Number(existing.data()?.billingBalanceAfter||0),debited:amount,reference:existing.data()?.reference,transactionId:txId};const walletRef=db.doc(`wallet_accounts/${walletId(uid,'USD')}`);const[w,b]=await Promise.all([tx.get(walletRef),tx.get(billingRef)]);const wb=Number(w.data()?.availableBalance||0);if(!w.exists||w.data()?.status!=='active'||wb<amount)throw new HttpsError('failed-precondition','Solde wallet USD insuffisant.');const bb=Number(b.data()?.availableBalance||0),after=round(bb+amount),now=Date.now(),reference=`MC-DEV-API-${now}`;tx.update(walletRef,{availableBalance:round(wb-amount),ledgerBalance:round(Number(w.data()?.ledgerBalance||wb)-amount),updatedAt:now});tx.set(billingRef,{availableBalance:after,ledgerBalance:round(Number(b.data()?.ledgerBalance||bb)+amount),status:'active',pricingTier:tier,updatedAt:now},{merge:true});tx.set(txRef,{id:txId,reference,type:'developer_api_billing_topup',status:'settled',developerId:dev.developerId,userId:uid,userIds:[uid],currency:'USD',amount,sourceWalletId:walletRef.id,billingAccountId:billingRef.id,billingBalanceAfter:after,authenticatedBy:'application_pin',adminVisible:true,createdAt:now,updatedAt:now});tx.set(db.collection('developer_billing_transactions').doc(),{developerId:dev.developerId,userId:uid,transactionId:txId,type:'billing_topup',status:'settled',currency:'USD',amount,direction:'credit',source:'personal_wallet',balanceAfter:after,createdAt:now,updatedAt:now});tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,walletId:walletRef.id,userId:uid,direction:'debit',amount,currency:'USD',entryType:'developer_api_topup_source',createdAt:now});return{ok:true,balance:after,debited:amount,reference,transactionId:txId};});
});
