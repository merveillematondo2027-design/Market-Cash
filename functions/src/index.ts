import { createHash } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD','CDF'] as const;
type Currency = typeof CURRENCIES[number];

const sha256 = (value:string) => createHash('sha256').update(value).digest('hex');
const walletId = (uid:string,currency:Currency) => `wallet_${currency.toLowerCase()}_${uid}`;
const rechargeNumberForUid = (uid:string) => {
  const n = BigInt(`0x${sha256(uid).slice(0,15)}`) % 100000000000n;
  return n.toString().padStart(11,'0');
};
const requireAuth = (request:any) => { if(!request.auth?.uid) throw new HttpsError('unauthenticated','Connexion requise.'); return request.auth.uid as string; };
const getRole = async(uid:string) => (await db.doc(`users/${uid}`).get()).data()?.role as string|undefined;
const requireRole = async(uid:string,roles:string[]) => { const role=await getRole(uid); if(!role||!roles.includes(role)) throw new HttpsError('permission-denied','Accès refusé.'); return role; };
const parseCurrency=(value:any):Currency=>{if(!CURRENCIES.includes(value))throw new HttpsError('invalid-argument','Devise invalide.');return value;};
const parseAmount=(value:any)=>{const amount=Number(value);if(!Number.isFinite(amount)||amount<=0)throw new HttpsError('invalid-argument','Montant invalide.');return Math.round(amount*100)/100;};

async function ensureWalletDocs(uid:string, accountType:'client'|'agent'|'business'='client'){
  const rechargeNumber=rechargeNumberForUid(uid); const now=Date.now();
  const batch=db.batch();
  for(const currency of CURRENCIES){const ref=db.doc(`wallet_accounts/${walletId(uid,currency)}`);if(!(await ref.get()).exists)batch.set(ref,{id:ref.id,userId:uid,accountType,currency,availableBalance:0,ledgerBalance:0,heldBalance:0,status:'active',rechargeNumber,createdAt:now,updatedAt:now});}
  const mapRef=db.doc(`wallet_recharge_numbers/${rechargeNumber}`);if(!(await mapRef.get()).exists)batch.set(mapRef,{userId:uid,rechargeNumber,createdAt:now});
  await batch.commit(); return rechargeNumber;
}

export const ensureWalletProfile = onCall({region:REGION}, async request=>{
  const uid=requireAuth(request); const role=await getRole(uid); const accountType=role==='agent'?'agent':role==='business'?'business':'client';
  const rechargeNumber=await ensureWalletDocs(uid,accountType); return {ok:true,rechargeNumber};
});

export const lookupRechargeClient = onCall({region:REGION}, async request=>{
  const agentUid=requireAuth(request); await requireRole(agentUid,['agent','admin_general','chef_agence']);
  const rechargeNumber=String(request.data?.rechargeNumber||'').replace(/\D/g,''); if(rechargeNumber.length<6)throw new HttpsError('invalid-argument','Numéro de recharge invalide.');
  const map=await db.doc(`wallet_recharge_numbers/${rechargeNumber}`).get(); if(!map.exists)throw new HttpsError('not-found','Client introuvable.'); const userId=map.data()!.userId;
  const user=(await db.doc(`users/${userId}`).get()).data(); if(!user)throw new HttpsError('not-found','Profil client introuvable.');
  const balances:any={}; for(const currency of CURRENCIES){const w=await db.doc(`wallet_accounts/${walletId(userId,currency)}`).get();balances[currency]=w.data()?.availableBalance??0;}
  return {userId,displayName:user.displayName||'Client',phone:user.phone||'',rechargeNumber,balances};
});

async function executeAgentTransfer(input:{agentUid:string;clientUid:string;currency:Currency;amount:number;direction:'cash_in'|'cash_out';pin:string;idempotencyKey:string}){
  const {agentUid,clientUid,currency,amount,direction,pin,idempotencyKey}=input; const txRef=db.doc(`wallet_transactions/${idempotencyKey}`);
  return db.runTransaction(async tx=>{
    const existing=await tx.get(txRef); if(existing.exists)return {duplicate:true,...existing.data()};
    const agentUserRef=db.doc(`users/${agentUid}`), clientUserRef=db.doc(`users/${clientUid}`), agentWalletRef=db.doc(`wallet_accounts/${walletId(agentUid,currency)}`), clientWalletRef=db.doc(`wallet_accounts/${walletId(clientUid,currency)}`);
    const [agentUser,clientUser,agentWallet,clientWallet]=await Promise.all([tx.get(agentUserRef),tx.get(clientUserRef),tx.get(agentWalletRef),tx.get(clientWalletRef)]);
    if(!agentUser.exists||agentUser.data()?.role!=='agent')throw new HttpsError('permission-denied','Compte agent invalide.');
    if(agentUser.data()?.pinHash!==sha256(pin))throw new HttpsError('permission-denied','Code secret agent incorrect.');
    if(!clientUser.exists)throw new HttpsError('not-found','Client introuvable.'); if(!agentWallet.exists||!clientWallet.exists)throw new HttpsError('failed-precondition','Portefeuille non initialisé.');
    const a=agentWallet.data()!, c=clientWallet.data()!; if(a.status!=='active'||c.status!=='active')throw new HttpsError('failed-precondition','Portefeuille bloqué ou suspendu.');
    const debitRef=direction==='cash_in'?agentWalletRef:clientWalletRef, creditRef=direction==='cash_in'?clientWalletRef:agentWalletRef; const debit=direction==='cash_in'?a:c, credit=direction==='cash_in'?c:a;
    if(Number(debit.availableBalance||0)<amount)throw new HttpsError('failed-precondition',direction==='cash_in'?'Solde agent insuffisant.':'Solde client insuffisant.');
    const now=Date.now(); const reference=`MC-${direction==='cash_in'?'DEP':'RET'}-${now}-${idempotencyKey.slice(-6).toUpperCase()}`;
    tx.update(debitRef,{availableBalance:Number(debit.availableBalance)-amount,ledgerBalance:Number(debit.ledgerBalance)-amount,updatedAt:now}); tx.update(creditRef,{availableBalance:Number(credit.availableBalance)+amount,ledgerBalance:Number(credit.ledgerBalance)+amount,updatedAt:now});
    const record={id:idempotencyKey,reference,type:direction,status:'settled',currency,amount,agentId:agentUid,clientId:clientUid,sourceWalletId:debitRef.id,destinationWalletId:creditRef.id,rail:'agent_terminal',createdAt:now,updatedAt:now}; tx.set(txRef,record);
    tx.set(db.collection('ledger_entries').doc(),{transactionId:idempotencyKey,walletId:debitRef.id,userId:debitRef.id.includes(agentUid)?agentUid:clientUid,direction:'debit',amount,currency,createdAt:now}); tx.set(db.collection('ledger_entries').doc(),{transactionId:idempotencyKey,walletId:creditRef.id,userId:creditRef.id.includes(agentUid)?agentUid:clientUid,direction:'credit',amount,currency,createdAt:now});
    tx.set(db.collection('audit_events').doc(),{actorId:agentUid,actorRole:'agent',action:direction==='cash_in'?'AGENT_CASH_IN':'AGENT_CASH_OUT',resourceType:'wallet_transaction',resourceId:idempotencyKey,result:'success',clientId:clientUid,amount,currency,createdAt:now}); return {ok:true,reference,transactionId:idempotencyKey};
  });
}

export const agentCashIn = onCall({region:REGION}, async request=>{const agentUid=requireAuth(request);await requireRole(agentUid,['agent']);const rechargeNumber=String(request.data?.rechargeNumber||'').replace(/\D/g,'');const map=await db.doc(`wallet_recharge_numbers/${rechargeNumber}`).get();if(!map.exists)throw new HttpsError('not-found','Client introuvable.');return executeAgentTransfer({agentUid,clientUid:map.data()!.userId,currency:parseCurrency(request.data?.currency),amount:parseAmount(request.data?.amount),direction:'cash_in',pin:String(request.data?.pin||''),idempotencyKey:String(request.data?.idempotencyKey||'')||`cashin_${agentUid}_${Date.now()}`});});
export const agentCashOut = onCall({region:REGION}, async request=>{const agentUid=requireAuth(request);await requireRole(agentUid,['agent']);const rechargeNumber=String(request.data?.rechargeNumber||'').replace(/\D/g,'');const map=await db.doc(`wallet_recharge_numbers/${rechargeNumber}`).get();if(!map.exists)throw new HttpsError('not-found','Client introuvable.');return executeAgentTransfer({agentUid,clientUid:map.data()!.userId,currency:parseCurrency(request.data?.currency),amount:parseAmount(request.data?.amount),direction:'cash_out',pin:String(request.data?.pin||''),idempotencyKey:String(request.data?.idempotencyKey||'')||`cashout_${agentUid}_${Date.now()}`});});

export const adminFundAgentFloat = onCall({region:REGION}, async request=>{
  const adminUid=requireAuth(request); await requireRole(adminUid,['admin_general']); const agentUid=String(request.data?.agentUid||''); const currency=parseCurrency(request.data?.currency); const amount=parseAmount(request.data?.amount); const reason=String(request.data?.reason||'').trim(); if(reason.length<5)throw new HttpsError('invalid-argument','Motif obligatoire.'); if(await getRole(agentUid)!=='agent')throw new HttpsError('failed-precondition','Le bénéficiaire doit être un agent.'); await ensureWalletDocs(agentUid,'agent');
  const ref=db.doc(`wallet_accounts/${walletId(agentUid,currency)}`); const id=`fund_${agentUid}_${Date.now()}`; await db.runTransaction(async tx=>{const snap=await tx.get(ref);const w=snap.data()!;const now=Date.now();tx.update(ref,{availableBalance:Number(w.availableBalance||0)+amount,ledgerBalance:Number(w.ledgerBalance||0)+amount,updatedAt:now});tx.set(db.doc(`wallet_transactions/${id}`),{id,reference:`MC-FLOAT-${now}`,type:'agent_float_funding',status:'settled',currency,amount,agentId:agentUid,approvedBy:adminUid,reason,createdAt:now,updatedAt:now});tx.set(db.collection('audit_events').doc(),{actorId:adminUid,actorRole:'admin_general',action:'AGENT_FLOAT_FUNDED',resourceType:'wallet_account',resourceId:ref.id,result:'success',agentId:agentUid,amount,currency,reason,createdAt:now});}); return {ok:true,transactionId:id};
});
