import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const adminAuth = getAuth();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
type Currency = typeof CURRENCIES[number];
const OFFICIAL_ROLES=['client','agent','marchand','developer','api_partner','agent_administratif','admin_general','chef_agence','designer_graphique','livreur'] as const;
type OfficialRole=typeof OFFICIAL_ROLES[number];
const sha256=(value:string)=>createHash('sha256').update(value).digest('hex');
const normalizeEmail=(value:any)=>String(value||'').trim().toLowerCase();
const clean=(value:any)=>String(value??'').trim();
const banId=(email:string)=>sha256(normalizeEmail(email));
const developerIdForUid=(uid:string)=>`DEV-${sha256(`developer:${uid}`).slice(0,10).toUpperCase()}`;

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

async function freezeWallets(targetUid:string,now:number){
  const batch=db.batch();let changed=0;
  for(const currency of CURRENCIES){const ref=db.doc(`wallet_accounts/${walletId(targetUid,currency)}`);if((await ref.get()).exists){batch.update(ref,{status:'frozen',updatedAt:now});changed++}}
  if(changed)await batch.commit();
}

export const checkEmailEligibility = onCall({region:REGION}, async(request) => {
  const email=normalizeEmail(request.data?.email);
  if(!email || !email.includes('@')) throw new HttpsError('invalid-argument','Adresse e-mail invalide.');
  const snap=await db.doc(`banned_emails/${banId(email)}`).get();
  return {allowed:!snap.exists};
});

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
  return {accountStatus:user.accountStatus||'active',suspendedUntil:Number(user.suspendedUntil||0),adminNote:user.adminNote||'',kycStatus:user.kycStatus||'not_started',securityResetAt:Number(user.securityResetAt||0),mustChangePin:Boolean(user.mustChangePin),wallets};
});

export const adminUpdateUserControl = onCall({region:REGION}, async(request) => {
  const actorId = requireAuth(request);await requireAdmin(actorId);
  const targetUid = String(request.data?.targetUid || '').trim();
  const action = String(request.data?.action || '').trim();
  const target = await requireTarget(targetUid);const targetData = target.data() || {};
  if (targetUid === actorId && ['set_account_status','reset_pin','delete_account','ban_account','set_role'].includes(action)) throw new HttpsError('failed-precondition','Cette action de sécurité ne peut pas être appliquée à votre propre compte depuis cette page.');
  const now = Date.now();

  if(action==='set_identity'){
    const displayName=clean(request.data?.displayName).slice(0,120);
    const phone=clean(request.data?.phone).slice(0,40);
    if(displayName.length<2)throw new HttpsError('invalid-argument','Le nom complet est requis.');
    await target.ref.update({displayName,phone,updatedAt:now});
    await audit(actorId,targetUid,'ADMIN_USER_IDENTITY_UPDATED',{displayNameChanged:displayName!==clean(targetData.displayName),phoneChanged:phone!==clean(targetData.phone)});
    return{ok:true,displayName,phone};
  }

  if(action==='set_role'){
    const role=clean(request.data?.role) as OfficialRole;
    if(!OFFICIAL_ROLES.includes(role))throw new HttpsError('invalid-argument','Rôle Market-Cash invalide.');
    const agencyName=clean(request.data?.agencyName).slice(0,120);
    if(['chef_agence','livreur','designer_graphique'].includes(role)&&!agencyName)throw new HttpsError('invalid-argument','Agence ou secteur requis pour ce rôle.');

    const updates:Record<string,unknown>={role,updatedAt:now};
    if(['chef_agence','livreur','designer_graphique'].includes(role)){
      updates.agencyId=agencyName;updates.agencyName=agencyName;
    }else{
      updates.agencyId=null;updates.agencyName=null;
    }

    if(role==='developer'||role==='api_partner'){
      const developerId=developerIdForUid(targetUid);
      const developerSnap=await db.doc(`developer_accounts/${developerId}`).get();
      if(!developerSnap.exists||developerSnap.data()?.status!=='active')throw new HttpsError('failed-precondition','Un compte Developer approuvé est requis avant d’attribuer ce rôle.');
      const businessType=developerSnap.data()?.businessType==='api_provider'?'api_provider':'direct_developer';
      const expectedRole=businessType==='api_provider'?'api_partner':'developer';
      if(role!==expectedRole)throw new HttpsError('failed-precondition',businessType==='api_provider'?'Ce compte est validé comme Partenaire API.':'Ce compte est validé comme Développeur direct.');
      updates.businessAccountType=businessType;
      updates.developerEnabled=true;
      updates.apiProviderEnabled=businessType==='api_provider';
    }else if(role==='marchand'){
      updates.businessAccountType='merchant';updates.developerEnabled=false;updates.apiProviderEnabled=false;
    }else if(role==='agent'){
      updates.businessAccountType='agent';updates.developerEnabled=false;updates.apiProviderEnabled=false;
    }else{
      updates.businessAccountType=null;updates.developerEnabled=false;updates.apiProviderEnabled=false;
    }

    await target.ref.set(updates,{merge:true});
    await audit(actorId,targetUid,'ADMIN_USER_ROLE_CHANGED',{previousRole:targetData.role||null,role,agencyName:agencyName||null});
    return{ok:true,role};
  }

  if (action === 'set_account_status') {
    const status = String(request.data?.status || '');
    if (!['active','suspended','blocked'].includes(status)) throw new HttpsError('invalid-argument','Statut de compte invalide.');
    let suspendedUntil=0;
    if(status==='suspended'){
      const durationMinutes=Number(request.data?.durationMinutes||0);
      if(!Number.isFinite(durationMinutes)||durationMinutes<1||durationMinutes>525600)throw new HttpsError('invalid-argument','Durée de suspension invalide.');
      suspendedUntil=now+Math.round(durationMinutes*60000);
    }
    await target.ref.update({accountStatus:status,suspendedUntil:status==='suspended'?suspendedUntil:0,accountStatusUpdatedAt:now,accountStatusUpdatedBy:actorId,updatedAt:now});
    if (status !== 'active') await freezeWallets(targetUid,now);
    await audit(actorId,targetUid,'ADMIN_ACCOUNT_STATUS_CHANGED',{status,suspendedUntil,previous:targetData.accountStatus||'active'});return{ok:true,suspendedUntil};
  }

  if(action==='delete_account'){
    const email=normalizeEmail(targetData.email);
    await freezeWallets(targetUid,now);
    try{await adminAuth.deleteUser(targetUid)}catch(error:any){if(error?.code!=='auth/user-not-found')throw error}
    await target.ref.set({accountStatus:'deleted',deletedAt:now,deletedBy:actorId,suspendedUntil:0,updatedAt:now},{merge:true});
    await audit(actorId,targetUid,'ADMIN_ACCOUNT_DELETED',{email,canRecreate:true});
    return{ok:true};
  }

  if(action==='ban_account'){
    const email=normalizeEmail(targetData.email);
    if(!email)throw new HttpsError('failed-precondition','Ce compte ne possède pas d’adresse e-mail exploitable.');
    await db.doc(`banned_emails/${banId(email)}`).set({emailHash:banId(email),emailMasked:`${email.slice(0,2)}***@${email.split('@')[1]||''}`,reason:String(request.data?.reason||'').trim().slice(0,500),bannedUserId:targetUid,bannedAt:now,bannedBy:actorId,permanent:true},{merge:true});
    await freezeWallets(targetUid,now);
    try{await adminAuth.updateUser(targetUid,{disabled:true})}catch(error:any){if(error?.code!=='auth/user-not-found')throw error}
    await target.ref.set({accountStatus:'banned',bannedAt:now,bannedBy:actorId,suspendedUntil:0,updatedAt:now},{merge:true});
    await audit(actorId,targetUid,'ADMIN_ACCOUNT_PERMANENTLY_BANNED',{emailHash:banId(email)});
    return{ok:true};
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
