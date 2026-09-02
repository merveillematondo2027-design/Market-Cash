import { logService } from './logService';
import { auth, db, googleProvider } from '../firebase/config';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { User, UserRole } from '../types';
import { removeUndefined } from '../lib/firestoreUtils';

export const ADMIN_EMAIL='merveillematondo2027@gmail.com';

function isFirestoreAccessError(error:any){
  const code=String(error?.code||'');
  const message=String(error?.message||'');
  return code==='permission-denied'||code==='firestore/permission-denied'||code==='unavailable'||code==='firestore/unavailable'||message.includes('Missing or insufficient permissions')||message.includes('permission-denied');
}

function buildSessionUser(firebaseUser:FirebaseUser,additionalData:Partial<User>={}):User{
  const email=(firebaseUser.email||'').trim();
  const role:UserRole=email.toLowerCase()===ADMIN_EMAIL.toLowerCase()?'admin_general':'client';
  return {
    uid:firebaseUser.uid,
    email,
    displayName:additionalData.displayName||firebaseUser.displayName||email.split('@')[0]||'Utilisateur',
    phone:additionalData.phone||firebaseUser.phoneNumber||'',
    avatar:additionalData.avatar||firebaseUser.photoURL||'',
    role,
    pinHash:additionalData.pinHash||'',
    kycStatus:additionalData.kycStatus||'not_started',
    createdAt:additionalData.createdAt||Date.now(),
    updatedAt:Date.now(),
    ...additionalData
  };
}

export function formatAuthError(error:any):string{
  if(!error)return'Une erreur inattendue est survenue.';
  const code=error.code||'';const message=error.message||'';
  console.error('[AUTH_ERROR_DETAILS]',{code,message,error});
  switch(code){
    case'auth/email-already-in-use':return'Cette adresse email est déjà associée à un compte. Veuillez vous connecter.';
    case'auth/invalid-email':return"L'adresse email saisie n'est pas valide.";
    case'auth/weak-password':return'Le mot de passe doit comporter au moins 6 caractères.';
    case'auth/user-not-found':return"Aucun compte n'a été trouvé avec cette adresse email.";
    case'auth/wrong-password':case'auth/invalid-credential':return'Identifiants incorrects. Vérifiez votre adresse email et votre mot de passe.';
    case'auth/popup-closed-by-user':return'La fenêtre de connexion Google a été fermée avant la finalisation.';
    case'auth/popup-blocked':return'La fenêtre de connexion a été bloquée par votre navigateur. Veuillez autoriser les pop-ups.';
    case'auth/network-request-failed':return'Erreur réseau. Veuillez vérifier votre connexion internet et réessayer.';
    case'auth/too-many-requests':return'Trop de tentatives échouées. Veuillez patienter avant de réessayer.';
    case'auth/user-disabled':return"Ce compte a été désactivé par l'administrateur.";
    default:if(isFirestoreAccessError(error))return"Connexion Firebase réussie. Certaines données Market-Cash sont momentanément indisponibles; réessayez dans quelques instants.";return message||"Une erreur est survenue lors de l'authentification.";
  }
}

const resolvingUsers=new Map<string,Promise<User>>();

export const authService={
  async resolveUser(firebaseUser:FirebaseUser,additionalData:Partial<User>={}):Promise<User>{
    const uid=firebaseUser.uid;const email=(firebaseUser.email||'').trim();
    if(Object.keys(additionalData).length===0&&resolvingUsers.has(uid))return resolvingUsers.get(uid)!;
    const resolvePromise=(async()=>{
      logService.info('AUTH','USER_PROFILE_LOAD_START','Début du chargement du profil utilisateur',{userId:uid,userEmail:email});
      const userRef=doc(db,'users',uid);
      try{
        const snapshot=await getDoc(userRef);
        if(!snapshot.exists()){
          const newUser=buildSessionUser(firebaseUser,additionalData);
          try{
            await setDoc(userRef,removeUndefined(newUser));
            logService.success('AUTH','USER_PROFILE_CREATED','Profil utilisateur créé',{userId:uid,userEmail:email,userRole:newUser.role});
          }catch(error:any){
            if(!isFirestoreAccessError(error))throw error;
            console.warn('[USER_PROFILE_CREATE_DEFERRED]',{uid,code:error?.code});
          }
          return newUser;
        }

        const stored=snapshot.data() as User;
        const data:User={...buildSessionUser(firebaseUser,additionalData),...stored,uid:stored.uid||uid,email:stored.email||email,displayName:stored.displayName||firebaseUser.displayName||email.split('@')[0]||'Utilisateur',phone:stored.phone||firebaseUser.phoneNumber||'',avatar:stored.avatar||firebaseUser.photoURL||'',pinHash:stored.pinHash||'',kycStatus:stored.kycStatus||'not_started',createdAt:stored.createdAt||Date.now(),updatedAt:stored.updatedAt||Date.now()};

        if(email.toLowerCase()===ADMIN_EMAIL.toLowerCase()&&data.role!=='admin_general'){
          data.role='admin_general';data.updatedAt=Date.now();
          try{await setDoc(userRef,{role:'admin_general',updatedAt:data.updatedAt},{merge:true})}catch(error:any){if(!isFirestoreAccessError(error))throw error}
        }

        logService.success('AUTH','USER_PROFILE_FOUND','Profil utilisateur trouvé',{userId:data.uid,userEmail:data.email,userRole:data.role});
        return data;
      }catch(error:any){
        if(!isFirestoreAccessError(error))throw error;
        const fallback=buildSessionUser(firebaseUser,additionalData);
        console.warn('[USER_PROFILE_FALLBACK]',{uid,email,code:error?.code,message:error?.message});
        // Firebase Auth remains authoritative for the active session. We keep the user signed in
        // instead of converting a Firestore rules/network incident into a broken login screen.
        return fallback;
      }finally{resolvingUsers.delete(uid)}
    })();
    resolvingUsers.set(uid,resolvePromise);return resolvePromise;
  },

  async register(email:string,password:string,displayName:string,phone:string){
    const cleanEmail=email.trim();
    const result=await createUserWithEmailAndPassword(auth,cleanEmail,password);
    if(displayName.trim())try{await updateProfile(result.user,{displayName:displayName.trim()})}catch{}
    const newUser=buildSessionUser(result.user,{displayName:displayName.trim()||'Client',phone:phone.trim()||''});
    try{
      await setDoc(doc(db,'users',result.user.uid),removeUndefined(newUser));
    }catch(error:any){
      if(!isFirestoreAccessError(error))throw error;
      console.warn('[REGISTER_PROFILE_WRITE_DEFERRED]',{uid:result.user.uid,code:error?.code});
    }
    return{firebaseUser:result.user,user:newUser};
  },

  async login(email:string,password:string){
    const result=await signInWithEmailAndPassword(auth,email.trim(),password);
    const userDoc=await this.resolveUser(result.user);
    return{firebaseUser:result.user,user:userDoc};
  },
  async loginWithGoogle(){googleProvider.setCustomParameters({prompt:'select_account'});const result=await signInWithPopup(auth,googleProvider);const userDoc=await this.resolveUser(result.user);return{firebaseUser:result.user,user:userDoc}},
  async logout(){await signOut(auth);if(typeof window!=='undefined'){try{localStorage.removeItem('market_cash_user');sessionStorage.clear()}catch{}}}
};
