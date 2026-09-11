import { randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD','CDF'] as const;
type Currency = typeof CURRENCIES[number];
const walletId=(uid:string,currency:Currency)=>`wallet_${currency.toLowerCase()}_${uid}`;

async function requireAdmin(uid:string){
  if(!uid)throw new HttpsError('unauthenticated','Connexion requise.');
  const snap=await db.doc(`users/${uid}`).get();
  if(!snap.exists||snap.data()?.role!=='admin_general')throw new HttpsError('permission-denied','Administrateur général requis.');
}

export const adminAdjustUserWalletBalance=onCall({region:REGION},async request=>{
  const adminUid=String(request.auth?.uid||'');
  await requireAdmin(adminUid);
  const targetUid=String(request.data?.targetUid||'').trim();
  const currency=String(request.data?.currency||'').toUpperCase() as Currency;
  const direction=String(request.data?.direction||'').toLowerCase();
  const amount=Math.round(Number(request.data?.amount||0)*100)/100;
  const reason=String(request.data?.reason||'').trim();
  if(!targetUid)throw new HttpsError('invalid-argument','Utilisateur requis.');
  if(!CURRENCIES.includes(currency))throw new HttpsError('invalid-argument','Devise invalide.');
  if(!['credit','debit'].includes(direction))throw new HttpsError('invalid-argument','Type d’ajustement invalide.');
  if(!Number.isFinite(amount)||amount<=0)throw new HttpsError('invalid-argument','Montant invalide.');
  if(reason.length<5)throw new HttpsError('invalid-argument','Motif obligatoire.');

  const user=await db.doc(`users/${targetUid}`).get();
  if(!user.exists)throw new HttpsError('not-found','Utilisateur introuvable.');
  if(['deleted','banned'].includes(String(user.data()?.accountStatus||'')))throw new HttpsError('failed-precondition','Compte utilisateur indisponible.');

  const ref=db.doc(`wallet_accounts/${walletId(targetUid,currency)}`);
  const now=Date.now();
  const txId=`adminwallet_${targetUid}_${now}_${randomInt(1000,9999)}`;
  const reference=`MC-ADMIN-${direction==='credit'?'CR':'DR'}-${now}`;
  let balanceAfter=0;

  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const current=snap.data()||{};
    const before=Number(current.availableBalance||0);
    const ledgerBefore=Number(current.ledgerBalance||before);
    if(direction==='debit'&&before<amount)throw new HttpsError('failed-precondition',`Solde insuffisant. Disponible : ${before} ${currency}.`);
    const delta=direction==='credit'?amount:-amount;
    balanceAfter=before+delta;
    const ledgerAfter=ledgerBefore+delta;
    tx.set(ref,{
      id:ref.id,userId:targetUid,accountType:String(current.accountType||user.data()?.role||'client'),currency,
      availableBalance:balanceAfter,ledgerBalance:ledgerAfter,heldBalance:Number(current.heldBalance||0),
      status:String(current.status||'active'),createdAt:Number(current.createdAt||now),updatedAt:now,
    },{merge:true});
    tx.set(db.doc(`wallet_transactions/${txId}`),{
      id:txId,reference,type:direction==='credit'?'admin_wallet_credit':'admin_wallet_debit',status:'settled',
      currency,amount,userId:targetUid,userIds:[targetUid],source:'administration',approvedBy:adminUid,reason,
      balanceBefore:before,balanceAfter,createdAt:now,updatedAt:now,
    });
    tx.set(db.collection('audit_events').doc(),{
      actorId:adminUid,actorType:'admin_general',targetUserId:targetUid,
      action:direction==='credit'?'ADMIN_USER_WALLET_CREDITED':'ADMIN_USER_WALLET_DEBITED',amount,currency,reason,
      balanceBefore:before,balanceAfter,result:'success',createdAt:now,
    });
    tx.set(db.collection('notifications').doc(),{
      userId:targetUid,title:direction==='credit'?'Wallet crédité':'Wallet ajusté',
      message:direction==='credit'?`Votre wallet ${currency} a été crédité de ${amount} ${currency}.`:`${amount} ${currency} ont été retirés de votre wallet ${currency} par l’administration.`,
      type:direction==='credit'?'success':'info',category:'general',read:false,transactionId:txId,createdAt:now,
    });
  });

  return{ok:true,transactionId:txId,reference,balanceAfter,currency,direction};
});
