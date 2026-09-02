import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { authService, formatAuthError } from '../../services/authService';
import { useAuthStore } from '../../store/authStore';
import { getHomeRouteByRole } from '../../lib/roleNavigation';
import toast from 'react-hot-toast';

export default function Login() {
  const { isAuthenticated, user, isPinVerified } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated && user) {
    if (user.role === 'client') {
      if (!isPinVerified) return <Navigate to="/pin" replace />;
      return <Navigate to={getHomeRouteByRole(user.role)} replace />;
    }
    return <Navigate to={getHomeRouteByRole(user.role)} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return void toast.error('Veuillez renseigner votre email et mot de passe.');
    setLoading(true);
    try { await authService.login(email, password); toast.success('Connexion réussie !'); }
    catch (error: any) { toast.error(formatAuthError(error)); setLoading(false); }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try { await authService.loginWithGoogle(); toast.success('Connexion Google réussie !'); }
    catch (error: any) { toast.error(formatAuthError(error)); setLoading(false); }
  };

  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-3 sm:p-4 font-sans text-slate-800"><div className="w-full max-w-md bg-white rounded-3xl sm:rounded-[2.5rem] shadow-xl border border-slate-200/80 p-6 sm:p-10 my-auto"><div className="mb-4"><Link to="/" className="text-xs font-black text-blue-700">← Retour à l’accueil</Link></div><div className="text-center mb-6 sm:mb-8"><div className="w-14 h-14 bg-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4 transform -rotate-3 border-3 border-blue-950 shadow-md"><div className="w-6 h-6 border-3 border-blue-950 rounded-full"/></div><h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">MARKET-CASH</h1><p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">Connectez-vous à votre compte</p></div><form onSubmit={handleSubmit} className="space-y-4"><div><label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5">Adresse email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="ex: nom@domaine.com" className="w-full px-4 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none text-xs sm:text-sm font-medium" required/></div><div><label className="block text-xs sm:text-sm font-bold text-slate-700 mb-1.5">Mot de passe</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none text-xs sm:text-sm font-medium" required/></div><button type="submit" disabled={loading} className="w-full bg-blue-950 text-amber-400 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm tracking-wide disabled:opacity-50 shadow-md shadow-blue-950/20">{loading?'CONNEXION EN COURS...':'SE CONNECTER'}</button></form><div className="mt-5 flex items-center justify-center space-x-3"><div className="h-px bg-slate-200 flex-1"/><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ou</span><div className="h-px bg-slate-200 flex-1"/></div><button onClick={handleGoogleLogin} disabled={loading} type="button" className="mt-4 w-full flex items-center justify-center px-4 py-2.5 sm:py-3 border border-slate-200 rounded-xl sm:rounded-2xl bg-white text-xs sm:text-sm font-bold text-slate-700 disabled:opacity-50"><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 mr-2.5"/>Continuer avec Google</button><div className="mt-6 text-center text-xs font-medium text-slate-600">Vous n'avez pas de compte ? <Link to="/register" className="text-blue-600 font-bold">Créer un compte</Link></div></div></div>;
}
