import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { LogOut, Key, User, Edit3, Fingerprint, Shield, Check, X, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import LogoutModal from '../../components/LogoutModal';

export default function ClientProfile() {
  const { user, setUser } = useAuthStore();
  const [cardCount, setCardCount] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  // Biometrics
  const [useBiometrics, setUseBiometrics] = useState(user?.useBiometrics || false);
  const [updatingBiometrics, setUpdatingBiometrics] = useState(false);

  // Edit Profile Modal
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Change PIN Modal
  const [showChangePin, setShowChangePin] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    if (user) {
      loadCardCount();
      setUseBiometrics(!!user.useBiometrics);
      setDisplayName(user.displayName || '');
      setPhone(user.phone || '');
    }
  }, [user]);

  const loadCardCount = async () => {
    if (!user) return;
    try {
      const qCards = query(collection(db, 'cards'), where('userId', '==', user.uid));
      const snap = await getDocs(qCards);
      setCardCount(snap.docs.length);
    } catch (error) {
      console.error('[PROFILE_CARD_COUNT_ERROR]', error);
    }
  };

  const handleToggleBiometrics = async () => {
    if (!user) return;
    const nextVal = !useBiometrics;
    setUpdatingBiometrics(true);

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        useBiometrics: nextVal,
        updatedAt: Date.now()
      });

      setUseBiometrics(nextVal);
      setUser({ ...user, useBiometrics: nextVal });
      toast.success(
        nextVal 
          ? "Authentification par empreinte digitale activée pour vos cartes." 
          : "Authentification par empreinte désactivée (PIN actif)."
      );
    } catch (error) {
      console.error(error);
      toast.error("Impossible de modifier le paramètre d'empreinte digitale.");
    } finally {
      setUpdatingBiometrics(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: displayName.trim(),
        phone: phone.trim(),
        updatedAt: Date.now()
      });

      setUser({ ...user, displayName: displayName.trim(), phone: phone.trim() });
      toast.success('Profil mis à jour.');
      setShowEditProfile(false);
    } catch (error) {
      toast.error('Erreur lors de la mise à jour du profil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (newPin.length < 4 || newPin.length > 6) {
      toast.error('Le nouveau code PIN doit comporter 4 à 6 chiffres.');
      return;
    }

    if (newPin !== confirmNewPin) {
      toast.error('Les nouveaux codes PIN ne correspondent pas.');
      return;
    }

    setSavingPin(true);
    try {
      // 1. Verify old PIN if old PIN is set
      if (user.pinHash) {
        const encodedOld = new TextEncoder().encode(oldPin);
        const hashOldBuffer = await crypto.subtle.digest('SHA-256', encodedOld);
        const hashOldArray = Array.from(new Uint8Array(hashOldBuffer));
        const enteredOldHash = hashOldArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (enteredOldHash !== user.pinHash) {
          toast.error('Votre code PIN actuel est incorrect.');
          setSavingPin(false);
          return;
        }
      }

      // 2. Hash new PIN (never stored in plaintext)
      const encodedNew = new TextEncoder().encode(newPin);
      const hashNewBuffer = await crypto.subtle.digest('SHA-256', encodedNew);
      const hashNewArray = Array.from(new Uint8Array(hashNewBuffer));
      const newPinHash = hashNewArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        pinHash: newPinHash,
        updatedAt: Date.now()
      });

      setUser({ ...user, pinHash: newPinHash });
      toast.success('Code PIN modifié avec succès.');
      setShowChangePin(false);
      setOldPin('');
      setNewPin('');
      setConfirmNewPin('');
    } catch (error) {
      console.error(error);
      toast.error('Erreur lors du changement de PIN.');
    } finally {
      setSavingPin(false);
    }
  };

  if (!user) return null;

  return (
    <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto space-y-8">
      {/* Header Profile */}
      <div className="bg-white rounded-[2.5rem] p-8 md:p-10 border-4 border-slate-100/50 shadow-xl shadow-slate-200/40 flex flex-col items-center text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-br from-blue-950 to-blue-900"></div>
        <div className="w-32 h-32 bg-amber-400 rounded-3xl flex items-center justify-center text-blue-950 mb-6 border-4 border-white shadow-lg relative z-10 overflow-hidden transform rotate-3 transition-transform hover:rotate-0 duration-300">
          {user.avatar ? (
            <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <User size={56} />
          )}
        </div>
        <h2 className="text-3xl font-black text-slate-800 tracking-tight">{user.displayName || 'Client MARKET-CASH'}</h2>
        <p className="text-slate-500 mb-8 font-medium">{user.email}</p>

        <div className="grid grid-cols-2 gap-4 w-full max-w-md">
          <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100/50 shadow-sm">
            <div className="text-4xl font-black text-blue-600 mb-1">{cardCount}</div>
            <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Cartes actives</div>
          </div>
          <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100/50 shadow-sm flex flex-col justify-center">
            <div className="text-lg font-bold text-slate-700 mb-1">
              {new Date(user.createdAt).toLocaleDateString('fr-FR')}
            </div>
            <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Membre depuis</div>
          </div>
        </div>
      </div>

      {/* Security & Settings Section */}
      <div className="bg-white rounded-[2.5rem] p-6 border-4 border-slate-100/50 shadow-sm space-y-4">
        <div className="flex items-center gap-3 mb-2 px-2">
          <Shield className="text-blue-600" size={22} />
          <div>
            <h3 className="font-black text-slate-800 text-lg">Sécurité du compte</h3>
            <p className="text-xs text-slate-400 font-medium">Contrôle d'accès et protection de vos cartes</p>
          </div>
        </div>

        {/* Biometrics Toggle */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 bg-blue-100/80 rounded-xl flex items-center justify-center text-blue-700 flex-shrink-0">
              <Fingerprint size={24} />
            </div>
            <div>
              <div className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                🔐 Utiliser l'empreinte digitale pour afficher les informations de carte
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Vérification biométrique rapide avec repli automatique sur votre code PIN.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={updatingBiometrics}
            onClick={handleToggleBiometrics}
            className={`w-14 h-8 flex items-center rounded-full p-1 transition-colors cursor-pointer flex-shrink-0 ${
              useBiometrics ? 'bg-blue-600' : 'bg-slate-300'
            }`}
          >
            <div
              className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform ${
                useBiometrics ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-4">
        <button 
          onClick={() => setShowEditProfile(true)}
          className="w-full flex items-center justify-between p-6 bg-white rounded-[2rem] border-4 border-slate-100/50 shadow-sm hover:shadow-lg hover:shadow-slate-200/40 hover:-translate-y-1 transition-all duration-300 text-slate-800 font-bold cursor-pointer"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <Edit3 size={24} />
            </div>
            <span className="text-lg tracking-tight">Modifier mon profil</span>
          </div>
        </button>
        
        <button 
          onClick={() => setShowChangePin(true)}
          className="w-full flex items-center justify-between p-6 bg-white rounded-[2rem] border-4 border-slate-100/50 shadow-sm hover:shadow-lg hover:shadow-slate-200/40 hover:-translate-y-1 transition-all duration-300 text-slate-800 font-bold cursor-pointer"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
              <Key size={24} />
            </div>
            <span className="text-lg tracking-tight">Changer mon PIN</span>
          </div>
        </button>

        <button 
          onClick={() => setShowLogoutConfirm(true)}
          className="w-full flex items-center justify-between p-6 bg-white rounded-[2rem] border-4 border-slate-100/50 shadow-sm hover:shadow-lg hover:shadow-red-200/40 hover:-translate-y-1 hover:border-red-100 transition-all duration-300 text-slate-800 font-bold group cursor-pointer"
        >
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-slate-50 group-hover:bg-red-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-red-500 transition-colors">
              <LogOut size={24} />
            </div>
            <span className="text-lg tracking-tight group-hover:text-red-600 transition-colors">Se déconnecter</span>
          </div>
        </button>
      </div>

      {/* Edit Profile Modal */}
      {showEditProfile && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <form onSubmit={handleSaveProfile} className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl space-y-5">
            <div className="flex justify-between items-center pb-2">
              <h3 className="font-black text-2xl text-slate-800 tracking-tight">Modifier mon profil</h3>
              <button 
                type="button" 
                onClick={() => setShowEditProfile(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-full cursor-pointer"
              >
                <X size={22} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Nom complet</label>
              <input 
                type="text" 
                value={displayName} 
                onChange={e => setDisplayName(e.target.value)} 
                required
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-semibold text-slate-800 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Numéro de téléphone</label>
              <input 
                type="tel" 
                value={phone} 
                onChange={e => setPhone(e.target.value)} 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-semibold text-slate-800 text-sm"
              />
            </div>

            <div className="flex gap-4 pt-3">
              <button 
                type="button" 
                onClick={() => setShowEditProfile(false)} 
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition cursor-pointer"
              >
                Annuler
              </button>
              <button 
                type="submit" 
                disabled={savingProfile} 
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer shadow-md shadow-blue-600/30"
              >
                {savingProfile ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Change PIN Modal */}
      {showChangePin && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <form onSubmit={handleChangePin} className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2">
              <div className="flex items-center gap-2">
                <Lock className="text-amber-500" size={22} />
                <h3 className="font-black text-2xl text-slate-800 tracking-tight">Changer mon PIN</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setShowChangePin(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-full cursor-pointer"
              >
                <X size={22} />
              </button>
            </div>

            {user.pinHash && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Code PIN actuel</label>
                <input 
                  type="password" 
                  maxLength={6}
                  value={oldPin} 
                  onChange={e => setOldPin(e.target.value.replace(/\D/g, ''))} 
                  required
                  placeholder="••••"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-mono text-center tracking-widest text-lg text-slate-800 font-bold"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Nouveau code PIN (4-6 chiffres)</label>
              <input 
                type="password" 
                maxLength={6}
                value={newPin} 
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} 
                required
                placeholder="••••"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-mono text-center tracking-widest text-lg text-slate-800 font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">Confirmer le nouveau code PIN</label>
              <input 
                type="password" 
                maxLength={6}
                value={confirmNewPin} 
                onChange={e => setConfirmNewPin(e.target.value.replace(/\D/g, ''))} 
                required
                placeholder="••••"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-mono text-center tracking-widest text-lg text-slate-800 font-bold"
              />
            </div>

            <div className="flex gap-4 pt-3">
              <button 
                type="button" 
                onClick={() => setShowChangePin(false)} 
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition cursor-pointer"
              >
                Annuler
              </button>
              <button 
                type="submit" 
                disabled={savingPin || newPin.length < 4} 
                className="flex-1 py-3 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 transition disabled:opacity-50 cursor-pointer shadow-md shadow-amber-500/30"
              >
                {savingPin ? 'Modification...' : 'Confirmer le PIN'}
              </button>
            </div>
          </form>
        </div>
      )}

      <LogoutModal isOpen={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} />
    </div>
  );
}

