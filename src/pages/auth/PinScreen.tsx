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
  const [step, setStep] = useState(1); // 1: Enter, 2: Confirm
  const [loading, setLoading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    // Non-client roles don't need PIN screen
    if (user.role !== 'client') {
      navigate(getHomeRouteByRole(user.role));
      return;
    }

    if (!user.pinHash) {
      setIsSettingUp(true);
    }
  }, [user, navigate]);

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    if (value.length <= 6) {
      if (step === 1) setPin(value);
      else setConfirmPin(value);
    }
  };

  const handleSetupPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) {
      toast.error('Le PIN doit contenir entre 4 et 6 chiffres.');
      return;
    }
    
    if (step === 1) {
      setStep(2);
      return;
    }

    if (pin !== confirmPin) {
      toast.error('Les PIN ne correspondent pas. Réessayez.');
      setStep(1);
      setPin('');
      setConfirmPin('');
      return;
    }

    setLoading(true);
    try {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        // In a real app, hash this before sending to server or in Cloud Function
        // But requested to not store in clear. A basic client-side SHA256 could be used.
        // For simplicity and adhering to "jamais en clair", let's use a simple hash function.
        const encoded = new TextEncoder().encode(pin);
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const pinHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        await updateDoc(userRef, { pinHash });
        setUser({ ...user, pinHash });
        setPinVerified(true);
        console.log('[PIN_CREATED]');
        toast.success('PIN configuré avec succès !');
        navigate('/client/cards');
      }
    } catch (error) {
      console.log('[PIN_ERROR]', error);
      toast.error('Erreur lors de la configuration du PIN.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;
    
    setLoading(true);
    try {
      const encoded = new TextEncoder().encode(pin);
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const enteredHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      if (user?.pinHash === enteredHash) {
        setPinVerified(true);
        console.log('[PIN_VERIFIED]');
        navigate('/client/cards');
      } else {
        console.log('[PIN_ERROR]', 'Incorrect PIN');
        toast.error('PIN incorrect.');
        setPin('');
      }
    } catch (error) {
      console.log('[PIN_ERROR]', error);
      toast.error('Erreur lors de la vérification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800">
      <div className="w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl border-4 border-slate-100/50 p-10 text-center">
        <h1 className="text-3xl font-black text-slate-800 tracking-tight mb-3">Code PIN</h1>
        <p className="text-slate-500 mb-8 font-medium">
          {isSettingUp 
            ? (step === 1 ? 'Créez votre code PIN (4-6 chiffres)' : 'Confirmez votre code PIN')
            : 'Entrez votre code PIN pour accéder à vos cartes'}
        </p>

        <form onSubmit={isSettingUp ? handleSetupPin : handleVerifyPin} className="space-y-6">
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={step === 1 ? pin : confirmPin}
            onChange={handlePinChange}
            className="w-full text-center text-4xl font-black tracking-widest px-5 py-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-blue-500 focus:bg-white focus:ring-0 outline-none transition-all text-slate-800"
            placeholder="••••"
            required
          />

          <button
            type="submit"
            disabled={loading || (step === 1 ? pin.length < 4 : confirmPin.length < 4)}
            className="w-full bg-blue-950 text-white py-4 rounded-2xl font-black tracking-wide hover:bg-blue-900 transition-colors disabled:opacity-50 shadow-lg shadow-blue-950/30"
          >
            {loading ? 'TRAITEMENT...' : 'CONTINUER'}
          </button>
        </form>
        
        {isSettingUp && step === 2 && (
           <button 
             onClick={() => { setStep(1); setPin(''); setConfirmPin(''); }}
             className="mt-6 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
           >
             Recommencer
           </button>
        )}

        <button 
          onClick={() => setShowLogoutModal(true)}
          className="mt-8 text-sm font-bold text-red-500 hover:text-red-700 transition-colors uppercase tracking-widest"
        >
          Déconnexion
        </button>
      </div>

      <LogoutModal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} />
    </div>
  );
}
