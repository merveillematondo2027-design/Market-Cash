import React,{useState}from'react';
import{Link,Navigate}from'react-router-dom';
import{authService,formatAuthError}from'../../services/authService';
import{useAuthStore}from'../../store/authStore';
import{getHomeRouteByRole}from'../../lib/roleNavigation';
import ProfileSetup from'./ProfileSetup';
import toast from'react-hot-toast';

export default function Register(){
 const{isAuthenticated,user}=useAuthStore();const[loading,setLoading]=useState(false);
 if(isAuthenticated&&user){if(!user.phone?.trim())return <ProfileSetup/>;return <Navigate to={getHomeRouteByRole(user.role)} replace/>}
 const handleGoogle=async()=>{setLoading(true);try{await authService.loginWithGoogle();toast.success('Compte Google connecté !')}catch(error:any){toast.error(formatAuthError(error));setLoading(false)}};
 return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4"><div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl"><div className="mb-5"><Link to="/" className="text-xs font-black text-blue-700">← Retour à l’accueil</Link></div><div className="text-center"><div className="w-14 h-14 bg-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-4 -rotate-3 border-3 border-blue-950"><div className="w-6 h-6 border-3 border-blue-950 rounded-full"/></div><h1 className="text-3xl font-black text-slate-800">MARKET-CASH</h1><p className="mt-2 text-sm text-slate-500">Sélectionnez votre adresse Google pour créer votre compte.</p></div><button onClick={handleGoogle} disabled={loading} className="mt-8 w-full rounded-2xl bg-blue-950 py-3.5 font-black text-amber-400 disabled:opacity-50">{loading?'OUVERTURE...':'INSCRIPTION'}</button><div className="mt-6 text-center text-xs text-slate-600">Vous avez déjà un compte ? <Link to="/login" className="font-bold text-blue-700">Connexion</Link></div></div></div>;
}
