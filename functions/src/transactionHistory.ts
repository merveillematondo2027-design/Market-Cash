import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db=getFirestore();
const REGION='europe-west1';

function requireAuth(request:any){const uid=String(request.auth?.uid||'');if(!uid)throw new HttpsError('unauthenticated','Connexion requise.');return uid}

function enrichForViewer(data:any,uid:string){
  const item={...data};
  const first=(...values:any[])=>values.find(v=>v!==undefined&&v!==null&&v!==''&&Number.isFinite(Number(v)));
  if(item.balanceAfter===undefined){
    if(String(item.clientId||item.userId||'')===uid)item.balanceAfter=first(item.cardBalanceAfter,item.clientBalanceAfter,item.walletBalanceAfter);
    else if(String(item.senderId||'')===uid)item.balanceAfter=first(item.senderBalanceAfter,item.walletBalanceAfter);
    else if(String(item.recipientId||'')===uid)item.balanceAfter=first(item.recipientBalanceAfter,item.walletBalanceAfter);
  }
  if(item.balanceBefore===undefined){
    if(String(item.clientId||item.userId||'')===uid)item.balanceBefore=first(item.cardBalanceBefore,item.clientBalanceBefore,item.walletBalanceBefore);
    else if(String(item.senderId||'')===uid)item.balanceBefore=first(item.senderBalanceBefore,item.walletBalanceBefore);
    else if(String(item.recipientId||'')===uid)item.balanceBefore=first(item.recipientBalanceBefore,item.walletBalanceBefore);
  }
  return item;
}

export const getMyTransactionsV2=onCall({region:REGION},async request=>{
  const uid=requireAuth(request);
  const queries=[
    db.collection('wallet_transactions').where('userIds','array-contains',uid).limit(120).get(),
    db.collection('wallet_transactions').where('userId','==',uid).limit(120).get(),
    db.collection('wallet_transactions').where('clientId','==',uid).limit(120).get(),
    db.collection('wallet_transactions').where('senderId','==',uid).limit(120).get(),
    db.collection('wallet_transactions').where('recipientId','==',uid).limit(120).get(),
  ];
  const snapshots=await Promise.all(queries);
  const merged=new Map<string,any>();
  for(const snap of snapshots)for(const doc of snap.docs)merged.set(doc.id,{id:doc.id,...doc.data()});
  const transactions=[...merged.values()].map(item=>enrichForViewer(item,uid)).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,150);
  return{transactions};
});
