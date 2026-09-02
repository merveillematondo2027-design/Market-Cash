import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { getHomeRouteByRole } from '../../lib/roleNavigation';
import toast from 'react-hot-toast';
import LogoutModal from '../../components/LogoutModal';

export default function PinScreen() {
  const navigate = useNavigate();
  const { user, setUser, setPinVerified } = useAuthStore();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (user.role !== 'client') { navigate(getHomeRouteByRole(user.role)); return; }
    if (!user.pinHash) setIsSettingUp(true);
  }, [user, navigate]);

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length <= 6) step === 1 ? setPin(value) : setConfirmPin(value);
  };

  const hashPin = async (value: string) => {
    const encoded = new TextEncoder().encode(value);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const handleSetupPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return toast.error('Le PIN doit contenir entre 4 et 6 chiffres.');
    if (step === 1) { setStep(2); return; }
    if (pin !== confirmPin) { toast.error('Les PIN ne correspondent pas. Réessayez.'); setStep(1); setPin(''); setConfirmPin(''); return; }
    setLoading(true);
    try {
      if (user) {
        const pinHash = await hashPin(pin);
        await updateDoc(doc(db, 'users', user.uid), { pinHash });
        setUser({ ...user, pinHash });
        setPinVerified(true);
        console.log('[PIN_CREATED]');
        toast.success('PIN configuré avec succès !');
        navigate('/client/home');
      }
    } catch (error) { console.log('[PIN_ERROR]', error); toast.error('Erreur lors de la configuration du PIN.'); }
    finally { setLoading(false); }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;
    setLoading(true);
    try {
      const enteredHash = await hashPin(pin);
      if (user?.pinHash === enteredHash) { setPinVerified(true); console.log('[PIN_VERIFIED]'); navigate('/client/home'); }
      else { console.log('[PIN_ERROR]', 'Incorrect PIN'); toast.error('PIN incorrect.'); setPin(''); }
    } catch (error) { console.log('[PIN_ERROR]', error); toast.error('Erreur lors de la vérification.'); }
    finally { setLoading(false); }
  };

  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800"><div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl border-4 border-slate-100/50 p-10 text-center"><h1 className="text-3xl font-black text-slate-800 tracking-tight mb-3">Code PIN</h1><p className="text-slate-500 mb-8 font-medium">{isSettingUp ? (step === 1 ? 'Créez votre code PIN (4-6 chiffres)' : 'Confirmez votre code PIN') : 'Entrez votre code PIN pour accéder à Market-Cash'}</p><form onSubmit={isSettingUp ? handleSetupPin : handleVerifyPin} className="space-y-6"><input type="password" inputMode="numeric" pattern="[0-9]*" value={step === 1 ? pin : confirmPin} onChange={handlePinChange} className="w-full text-center text-4xl font-black tracking-widest px-5 py-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-blue-500 focus:bg-white focus:ring-0 outline-none transition-all text-slate-800" placeholder="••••" required/><button type="submit" disabled={loading || (step === 1 ? pin.length < 4 : confirmPin.length < 4)} className="w-full bg-blue-950 text-white py-4 rounded-2xl font-black tracking-wide hover:bg-blue-900 transition-colors disabled:opacity-50 shadow-lg shadow-blue-950/30">{loading ? 'TRAITEMENT...' : 'CONTINUER'}</button></form>{isSettingUp && step === 2 && <button onClick={() => { setStep(1); setPin(''); setConfirmPin(''); }} className="mt-6 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Recommencer</button>}<button onClick={() => setShowLogoutModal(true)} className="mt-8 text-sm font-bold text-red-500 hover:text-red-700 transition-colors uppercase tracking-widest">Déconnexion</button></div><LogoutModal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} /></div>;
}
