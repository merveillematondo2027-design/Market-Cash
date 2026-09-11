import React,{useState}from'react';
import{Navigate}from'react-router-dom';
import{EmailAuthProvider,linkWithCredential,updatePassword}from'firebase/auth';
import{doc,setDoc}from'firebase/firestore';
import{auth,db}from'../../firebase/config';
import{useAuthStore}from'../../store/authStore';
import{getHomeRouteByRole}from'../../lib/roleNavigation';
import toast from'react-hot-toast';

export default function ProfileSetup(){
 const{user,setUser}=useAuthStore();
 const[phone,setPhone]=useState(user?.phone||'');
 const[password,setPassword]=useState('');
 const[confirm,setConfirm]=useState('');
 const[loading,setLoading]=useState(false);
 if(!user||!auth.currentUser)return <Navigate to="/login" replace/>;
 if(user.phone?.trim())return <Navigate to={getHomeRouteByRole(user.role)} replace/>;
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();const cleanPhone=phone.trim();
  if(!cleanPhone)return void toast.error('Le numéro de téléphone est obligatoire.');
  if(password&&password.length<6)return void toast.error('Le mot de passe doit contenir au moins 6 caractères.');
  if(password!==confirm)return void toast.error('Les mots de passe ne correspondent pas.');
  setLoading(true);
  try{
   const firebaseUser=auth.currentUser!;
   let appPasswordEnabled=false;
   if(password){
    const hasPasswordProvider=firebaseUser.providerData.some(p=>p.providerId==='password');
    if(hasPasswordProvider)await updatePassword(firebaseUser,password);
    else if(firebaseUser.email)await linkWithCredential(firebaseUser,EmailAuthProvider.credential(firebaseUser.email,password));
    appPasswordEnabled=true;
   }
   const patch={phone:cleanPhone,appPasswordEnabled,profileSetupCompleted:true,updatedAt:Date.now()};
   await setDoc(doc(db,'users',firebaseUser.uid),patch,{merge:true});
   setUser({...user,...patch});
   toast.success('Profil Market-Cash configuré.');
  }catch(error:any){
   console.error('[PROFILE_SETUP_ERROR]',error);
   const code=String(error?.code||'');
   if(code==='auth/credential-already-in-use'||code==='auth/email-already-in-use')toast.error('Cette adresse possède déjà un mot de passe sur un autre compte Firebase.');
   else toast.error(error?.message||'Impossible d’enregistrer votre profil.');
  }finally{setLoading(false)}
 };
 return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl"><div className="text-center mb-7"><h1 className="text-2xl font-black text-blue-950">Finaliser votre compte</h1><p className="mt-2 text-sm text-slate-500">Ajoutez votre numéro de téléphone. Le mot de passe Market-Cash est facultatif.</p></div><label className="block text-sm font-bold text-slate-700 mb-1.5">Numéro de téléphone *</label><input autoFocus type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+243 ..." className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-700" required/><div className="mt-5"><label className="block text-sm font-bold text-slate-700 mb-1.5">Mot de passe de l’application <span className="font-medium text-slate-400">(facultatif)</span></label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Laisser vide pour ne pas l’activer" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-700"/><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Confirmer le mot de passe" disabled={!password} className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-700 disabled:opacity-40"/><p className="mt-2 text-xs text-slate-500">Si vous laissez ce champ vide, Market-Cash ne vous demandera pas ce mot de passe pendant votre parcours.</p></div><button disabled={loading} className="mt-7 w-full rounded-2xl bg-blue-950 py-3.5 font-black text-amber-400 disabled:opacity-50">{loading?'ENREGISTREMENT...':'CONTINUER'}</button></form></div>;
}
