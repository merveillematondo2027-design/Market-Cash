import { logService } from './logService';
import { auth, db, googleProvider } from '../firebase/config';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { User, UserRole } from '../types';
import { removeUndefined } from '../lib/firestoreUtils';

export const ADMIN_EMAIL='merveillematondo2027@gmail.com';
const CUSTOMER_ROLES:UserRole[]=['client','agent','marchand'];

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
    default:if(message.includes('Missing or insufficient permissions')||message.includes('permission-denied'))return"Erreur de permissions d'accès aux données.";return message||"Une erreur est survenue lors de l'authentification.";
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
          const role:UserRole=email.toLowerCase()===ADMIN_EMAIL.toLowerCase()?'admin_general':'client';
          const newUser:User={uid,email,displayName:additionalData.displayName||firebaseUser.displayName||email.split('@')[0]||'Utilisateur',phone:additionalData.phone||firebaseUser.phoneNumber||'',avatar:additionalData.avatar||firebaseUser.photoURL||'',role,pinHash:additionalData.pinHash||'',kycStatus:'not_started',createdAt:Date.now(),updatedAt:Date.now(),...additionalData};
          await setDoc(userRef,removeUndefined(newUser));
          return newUser;
        }
        const data=snapshot.data() as User;
        const isMainAdmin=email.toLowerCase()===ADMIN_EMAIL.toLowerCase();
        if(isMainAdmin&&data.role!=='admin_general'){
          data.role='admin_general';data.updatedAt=Date.now();await setDoc(userRef,{role:'admin_general',updatedAt:data.updatedAt},{merge:true});
        }else if(!isMainAdmin&&!CUSTOMER_ROLES.includes(data.role)){
          // Baseline migration: all former staff accounts return to simple client.
          data.role='client';data.agencyId=undefined;data.agencyName=undefined;data.updatedAt=Date.now();
          await setDoc(userRef,{role:'client',agencyId:null,agencyName:null,updatedAt:data.updatedAt},{merge:true});
        }
        if(!data.kycStatus){data.kycStatus='not_started';await setDoc(userRef,{kycStatus:'not_started',updatedAt:Date.now()},{merge:true});}
        logService.success('AUTH','USER_PROFILE_FOUND','Profil utilisateur trouvé',{userId:data.uid,userEmail:data.email,userRole:data.role});
        return data;
      }finally{resolvingUsers.delete(uid)}
    })();
    resolvingUsers.set(uid,resolvePromise);return resolvePromise;
  },

  async register(email:string,password:string,displayName:string,phone:string){
    const cleanEmail=email.trim();
    const result=await createUserWithEmailAndPassword(auth,cleanEmail,password);
    if(displayName.trim())try{await updateProfile(result.user,{displayName:displayName.trim()})}catch{}
    const role:UserRole=cleanEmail.toLowerCase()===ADMIN_EMAIL.toLowerCase()?'admin_general':'client';
    const newUser:User={uid:result.user.uid,email:cleanEmail,displayName:displayName.trim()||'Client',phone:phone.trim()||'',avatar:'',role,pinHash:'',kycStatus:'not_started',createdAt:Date.now(),updatedAt:Date.now()};
    await setDoc(doc(db,'users',result.user.uid),removeUndefined(newUser));
    return{firebaseUser:result.user,user:newUser};
  },

  async login(email:string,password:string){const result=await signInWithEmailAndPassword(auth,email.trim(),password);return{firebaseUser:result.user}},
  async loginWithGoogle(){googleProvider.setCustomParameters({prompt:'select_account'});const result=await signInWithPopup(auth,googleProvider);const userDoc=await this.resolveUser(result.user);return{firebaseUser:result.user,user:userDoc}},
  async logout(){await signOut(auth);if(typeof window!=='undefined'){try{localStorage.removeItem('market_cash_user');sessionStorage.clear()}catch{}}}
};
