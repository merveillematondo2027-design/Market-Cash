import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
type Currency = typeof CURRENCIES[number];
const sha256=(value:string)=>createHash('sha256').update(value).digest('hex');

const requireAuth = (request:any) => {
  const uid = request.auth?.uid as string | undefined;
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  return uid;
};

const requireAdmin = async(uid:string) => {
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists || snap.data()?.role !== 'admin_general') throw new HttpsError('permission-denied', 'Administrateur général requis.');
};

const requireTarget = async(targetUid:string) => {
  if (!targetUid) throw new HttpsError('invalid-argument', 'Utilisateur cible requis.');
  const snap = await db.doc(`users/${targetUid}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Utilisateur introuvable.');
  return snap;
};

const walletId = (uid:string,currency:Currency) => `wallet_${currency.toLowerCase()}_${uid}`;

async function audit(actorId:string,targetUid:string,action:string,metadata:Record<string,unknown>={}) {
  await db.collection('audit_events').add({actorId,targetUserId:targetUid,action,result:'success',metadata,createdAt:Date.now()});
}

export const adminGetUserControl = onCall({region:REGION}, async(request) => {
  const actorId = requireAuth(request);await requireAdmin(actorId);
  const targetUid = String(request.data?.targetUid || '').trim();
  const userSnap = await requireTarget(targetUid);const user = userSnap.data() || {};
  const wallets:Record<string,unknown> = {};
  for (const currency of CURRENCIES) {
    const snap = await db.doc(`wallet_accounts/${walletId(targetUid,currency)}`).get();
    const data = snap.data();
    wallets[currency] = data ? {id:snap.id,currency,status:data.status||'active',availableBalance:Number(data.availableBalance||0),ledgerBalance:Number(data.ledgerBalance||0),heldBalance:Number(data.heldBalance||0),rechargeNumber:data.rechargeNumber||'',marketCashId:data.marketCashId||'',updatedAt:Number(data.updatedAt||0)} : null;
  }
  return {accountStatus:user.accountStatus||'active',adminNote:user.adminNote||'',kycStatus:user.kycStatus||'not_started',securityResetAt:Number(user.securityResetAt||0),mustChangePin:Boolean(user.mustChangePin),wallets};
});

export const adminUpdateUserControl = onCall({region:REGION}, async(request) => {
  const actorId = requireAuth(request);await requireAdmin(actorId);
  const targetUid = String(request.data?.targetUid || '').trim();
  const action = String(request.data?.action || '').trim();
  const target = await requireTarget(targetUid);const targetData = target.data() || {};
  if (targetUid === actorId && ['set_account_status','reset_pin'].includes(action)) throw new HttpsError('failed-precondition','Cette action de sécurité ne peut pas être appliquée à votre propre compte depuis cette page.');
  const now = Date.now();

  if (action === 'set_account_status') {
    const status = String(request.data?.status || '');
    if (!['active','suspended','blocked'].includes(status)) throw new HttpsError('invalid-argument','Statut de compte invalide.');
    await target.ref.update({accountStatus:status,accountStatusUpdatedAt:now,accountStatusUpdatedBy:actorId,updatedAt:now});
    if (status !== 'active') {
      const batch = db.batch();
      for (const currency of CURRENCIES) {const ref=db.doc(`wallet_accounts/${walletId(targetUid,currency)}`);if((await ref.get()).exists)batch.update(ref,{status:'frozen',updatedAt:now})}
      await batch.commit();
    }
    await audit(actorId,targetUid,'ADMIN_ACCOUNT_STATUS_CHANGED',{status,previous:targetData.accountStatus||'active'});return{ok:true};
  }

  if (action === 'set_wallet_status') {
    const status = String(request.data?.status || '');const currency = String(request.data?.currency || 'ALL').toUpperCase();
    if (!['active','frozen'].includes(status)) throw new HttpsError('invalid-argument','Statut wallet invalide.');
    if (currency !== 'ALL' && !CURRENCIES.includes(currency as Currency)) throw new HttpsError('invalid-argument','Devise invalide.');
    if (targetData.accountStatus && targetData.accountStatus !== 'active' && status === 'active') throw new HttpsError('failed-precondition','Réactivez d’abord le compte utilisateur.');
    const selected = currency === 'ALL' ? [...CURRENCIES] : [currency as Currency];const batch=db.batch();let changed=0;
    for(const c of selected){const ref=db.doc(`wallet_accounts/${walletId(targetUid,c)}`);if((await ref.get()).exists){batch.update(ref,{status,updatedAt:now});changed++}}
    if(changed)await batch.commit();await audit(actorId,targetUid,'ADMIN_WALLET_STATUS_CHANGED',{status,currency,changed});return{ok:true,changed};
  }

  if (action === 'reset_pin') {
    await target.ref.update({pinHash:'',temporaryPinHash:sha256('1234'),mustChangePin:true,pinChangedAt:0,useBiometrics:false,securityResetAt:now,securityResetBy:actorId,updatedAt:now});
    await audit(actorId,targetUid,'ADMIN_PIN_RESET_TO_TEMPORARY');
    await db.collection('notifications').add({userId:targetUid,title:'Nouveau code temporaire',message:'Votre code temporaire Market-Cash est 1234. Vous devez le remplacer avant de continuer.',type:'info',category:'security',read:false,createdAt:now});
    return{ok:true};
  }

  if (action === 'disable_biometrics') {await target.ref.update({useBiometrics:false,updatedAt:now});await audit(actorId,targetUid,'ADMIN_BIOMETRICS_DISABLED');return{ok:true};}
  if (action === 'set_note') {const note=String(request.data?.note||'').trim().slice(0,2000);await target.ref.update({adminNote:note,adminNoteUpdatedAt:now,adminNoteUpdatedBy:actorId,updatedAt:now});await audit(actorId,targetUid,'ADMIN_NOTE_UPDATED',{length:note.length});return{ok:true};}
  throw new HttpsError('invalid-argument','Action administrative inconnue.');
});
