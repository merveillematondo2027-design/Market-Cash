import React,{useState}from'react';
import{Navigate}from'react-router-dom';
import{doc,setDoc}from'firebase/firestore';
import{auth,db}from'../../firebase/config';
import{useAuthStore}from'../../store/authStore';
import{getHomeRouteByRole}from'../../lib/roleNavigation';
import toast from'react-hot-toast';

export default function ProfileSetup(){
 const{user,setUser}=useAuthStore();
 const[phone,setPhone]=useState(user?.phone||'');
 const[loading,setLoading]=useState(false);
 if(!user||!auth.currentUser)return <Navigate to="/login" replace/>;
 if(user.phone?.trim())return <Navigate to={getHomeRouteByRole(user.role)} replace/>;
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();const cleanPhone=phone.trim();
  if(!cleanPhone)return void toast.error('Le numéro de téléphone est obligatoire.');
  if(!/^\+?[0-9][0-9\s().-]{6,19}$/.test(cleanPhone))return void toast.error('Entrez un numéro de téléphone valide.');
  setLoading(true);
  try{
   const firebaseUser=auth.currentUser!;
   const patch={phone:cleanPhone,profileSetupCompleted:true,updatedAt:Date.now()};
   await setDoc(doc(db,'users',firebaseUser.uid),patch,{merge:true});
   setUser({...user,...patch});
   toast.success('Numéro de téléphone enregistré.');
  }catch(error:any){
   console.error('[PROFILE_SETUP_ERROR]',error);
   toast.error(error?.message||'Impossible d’enregistrer votre numéro.');
  }finally{setLoading(false)}
 };
 return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl"><div className="text-center mb-7"><h1 className="text-2xl font-black text-blue-950">Finaliser votre compte</h1><p className="mt-2 text-sm text-slate-500">Ajoutez simplement votre numéro de téléphone pour accéder à Market-Cash.</p></div><label className="block text-sm font-bold text-slate-700 mb-1.5">Numéro de téléphone *</label><input autoFocus type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+243 ..." className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-700" required/><div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><b>PIN facultatif au départ.</b> Une fois dans votre espace, vous pourrez créer un PIN de 4 à 10 chiffres depuis Paramètres &gt; Sécurité.</div><button disabled={loading} className="mt-7 w-full rounded-2xl bg-blue-950 py-3.5 font-black text-amber-400 disabled:opacity-50">{loading?'ENREGISTREMENT...':'CONTINUER'}</button></form></div>;
}
