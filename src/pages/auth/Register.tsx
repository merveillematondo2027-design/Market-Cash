import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { authService, formatAuthError } from '../../services/authService';
import { useAuthStore } from '../../store/authStore';
import { getHomeRouteByRole } from '../../lib/roleNavigation';
import toast from 'react-hot-toast';

export default function Register() {
  const { isAuthenticated, user, isPinVerified } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    if (!name.trim() || !email.trim() || !password) return void toast.error('Veuillez remplir tous les champs obligatoires.');
    if (password.length < 6) return void toast.error('Le mot de passe doit comporter au moins 6 caractères.');
    if (password !== confirmPassword) return void toast.error('Les mots de passe ne correspondent pas.');
    setLoading(true);
    try { await authService.register(email, password, name, phone); toast.success('Compte créé avec succès !'); }
    catch (error: any) { toast.error(formatAuthError(error)); setLoading(false); }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try { await authService.loginWithGoogle(); toast.success('Connexion Google réussie !'); }
    catch (error: any) { toast.error(formatAuthError(error)); setLoading(false); }
  };

  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-3 sm:p-4 font-sans text-slate-800"><div className="w-full max-w-md bg-white rounded-3xl sm:rounded-[2.5rem] shadow-xl border border-slate-200/80 p-6 sm:p-8 my-auto"><div className="mb-3"><Link to="/" className="text-xs font-black text-blue-700">← Retour à l’accueil</Link></div><div className="text-center mb-5 sm:mb-6"><div className="w-12 h-12 bg-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-2.5 sm:mb-3 transform -rotate-3 border-3 border-blue-950 shadow-md"><div className="w-5 h-5 border-3 border-blue-950 rounded-full"/></div><h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">MARKET-CASH</h1><p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">Créez votre compte client</p></div><form onSubmit={handleSubmit} className="space-y-3"><div><label className="block text-xs font-bold text-slate-700 mb-1">Nom complet</label><input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="ex: Jean Dupont" className="w-full px-3.5 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none text-xs sm:text-sm font-medium" required/></div><div><label className="block text-xs font-bold text-slate-700 mb-1">Adresse email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="ex: jean.dupont@email.com" className="w-full px-3.5 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none text-xs sm:text-sm font-medium" required/></div><div><label className="block text-xs font-bold text-slate-700 mb-1">Numéro de téléphone</label><input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="ex: +243 81 234 5678" className="w-full px-3.5 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none text-xs sm:text-sm font-medium"/></div><div className="grid grid-cols-2 gap-2"><div><label className="block text-xs font-bold text-slate-700 mb-1">Mot de passe</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Min 6 car." className="w-full px-3 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none text-xs sm:text-sm font-medium" required/></div><div><label className="block text-xs font-bold text-slate-700 mb-1">Confirmer</label><input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Répétez" className="w-full px-3 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none text-xs sm:text-sm font-medium" required/></div></div><button type="submit" disabled={loading} className="w-full bg-blue-950 text-amber-400 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm tracking-wide disabled:opacity-50 shadow-md shadow-blue-950/20 mt-2">{loading?'CRÉATION DU COMPTE...':'CRÉER MON COMPTE'}</button></form><div className="mt-4 flex items-center justify-center space-x-3"><div className="h-px bg-slate-200 flex-1"/><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ou</span><div className="h-px bg-slate-200 flex-1"/></div><button onClick={handleGoogleLogin} disabled={loading} type="button" className="mt-3 w-full flex items-center justify-center px-4 py-2 sm:py-2.5 border border-slate-200 rounded-xl sm:rounded-2xl bg-white text-xs font-bold text-slate-700 disabled:opacity-50"><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-4 h-4 mr-2"/>Continuer avec Google</button><div className="mt-4 text-center text-xs font-medium text-slate-600">Vous avez déjà un compte ? <Link to="/login" className="text-blue-600 font-bold">Se connecter</Link></div></div></div>;
}
