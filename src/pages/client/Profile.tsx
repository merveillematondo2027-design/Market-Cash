import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Edit3, Fingerprint, Key, Lock, LogOut, Shield, User, X } from 'lucide-react';
import toast from 'react-hot-toast';
import LogoutModal from '../../components/LogoutModal';

export default function ClientProfile() {
  const { user, setUser } = useAuthStore();
  const [cardCount, setCardCount] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [useBiometrics, setUseBiometrics] = useState(user?.useBiometrics || false);
  const [updatingBiometrics, setUpdatingBiometrics] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  useEffect(() => {
    if (!user) return;
    const loadCardCount = async () => {
      try {
        const qCards = query(collection(db, 'cards'), where('userId', '==', user.uid));
        const snap = await getDocs(qCards);
        setCardCount(snap.docs.length);
      } catch (error) {
        console.error('[PROFILE_CARD_COUNT_ERROR]', error);
      }
    };
    loadCardCount();
    setUseBiometrics(!!user.useBiometrics);
    setDisplayName(user.displayName || '');
    setPhone(user.phone || '');
  }, [user?.uid, user?.displayName, user?.phone, user?.useBiometrics]);

  const memberSince = useMemo(() => {
    if (!user?.createdAt) return 'Date non disponible';
    const date = new Date(user.createdAt);
    return Number.isNaN(date.getTime()) ? 'Date non disponible' : date.toLocaleDateString('fr-FR');
  }, [user?.createdAt]);

  const handleToggleBiometrics = async () => {
    if (!user) return;
    const nextVal = !useBiometrics;
    setUpdatingBiometrics(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { useBiometrics: nextVal, updatedAt: Date.now() });
      setUseBiometrics(nextVal);
      setUser({ ...user, useBiometrics: nextVal });
      toast.success(nextVal ? 'Empreinte digitale activée.' : 'Empreinte digitale désactivée.');
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
      const nextName = displayName.trim();
      const nextPhone = phone.trim();
      await updateDoc(doc(db, 'users', user.uid), { displayName: nextName, phone: nextPhone, updatedAt: Date.now() });
      setUser({ ...user, displayName: nextName, phone: nextPhone });
      toast.success('Profil mis à jour.');
      setShowEditProfile(false);
    } catch (error) {
      console.error(error);
      toast.error('Erreur lors de la mise à jour du profil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (newPin.length < 4 || newPin.length > 6) return toast.error('Le nouveau code PIN doit comporter 4 à 6 chiffres.');
    if (newPin !== confirmNewPin) return toast.error('Les nouveaux codes PIN ne correspondent pas.');
    setSavingPin(true);
    try {
      if (user.pinHash) {
        const encodedOld = new TextEncoder().encode(oldPin);
        const hashOldBuffer = await crypto.subtle.digest('SHA-256', encodedOld);
        const enteredOldHash = Array.from(new Uint8Array(hashOldBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        if (enteredOldHash !== user.pinHash) {
          toast.error('Votre code PIN actuel est incorrect.');
          return;
        }
      }
      const encodedNew = new TextEncoder().encode(newPin);
      const hashNewBuffer = await crypto.subtle.digest('SHA-256', encodedNew);
      const newPinHash = Array.from(new Uint8Array(hashNewBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      await updateDoc(doc(db, 'users', user.uid), { pinHash: newPinHash, updatedAt: Date.now() });
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
    <div className="mx-auto max-w-2xl p-4 md:p-8 pb-28 space-y-5">
      <header>
        <p className="text-sm font-semibold text-slate-500">Compte Market-Cash</p>
        <h1 className="mt-1 text-2xl md:text-3xl font-black tracking-tight text-slate-950">Mon profil</h1>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-blue-950 text-white">
            {user.avatar ? <img src={user.avatar} alt="Avatar" className="h-full w-full object-cover" /> : <User size={28} />}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-black text-slate-950">{user.displayName || 'Client Market-Cash'}</h2>
            <p className="truncate text-sm text-slate-500">{user.email}</p>
            {user.phone && <p className="mt-1 text-sm font-semibold text-slate-700">{user.phone}</p>}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-50 p-4"><div className="text-2xl font-black text-blue-950">{cardCount}</div><div className="mt-1 text-xs font-semibold text-slate-500">Cartes enregistrées</div></div>
          <div className="rounded-2xl bg-slate-50 p-4"><div className="text-sm font-black text-slate-800">{memberSince}</div><div className="mt-1 text-xs font-semibold text-slate-500">Membre depuis</div></div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-900"><Shield size={20}/></div>
          <div><h2 className="font-black text-slate-950">Sécurité du compte</h2><p className="text-xs text-slate-500">Protégez l'accès aux informations sensibles de vos cartes.</p></div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex min-w-0 items-center gap-3"><Fingerprint className="shrink-0 text-blue-800" size={22}/><div><div className="text-sm font-bold text-slate-800">Empreinte digitale</div><p className="text-xs text-slate-500">Utiliser la biométrie avec repli sur le PIN.</p></div></div>
          <button type="button" disabled={updatingBiometrics} onClick={handleToggleBiometrics} aria-label="Activer ou désactiver la biométrie" className={`relative h-7 w-12 shrink-0 rounded-full transition ${useBiometrics ? 'bg-blue-950' : 'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${useBiometrics ? 'translate-x-6' : 'translate-x-1'}`}/></button>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
        <button onClick={() => setShowEditProfile(true)} className="flex w-full items-center gap-3 p-5 text-left hover:bg-slate-50"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-800"><Edit3 size={20}/></div><div><div className="font-bold text-slate-900">Modifier mon profil</div><div className="text-xs text-slate-500">Nom et numéro de téléphone</div></div></button>
        <button onClick={() => setShowChangePin(true)} className="flex w-full items-center gap-3 p-5 text-left hover:bg-slate-50"><div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><Key size={20}/></div><div><div className="font-bold text-slate-900">Changer mon PIN</div><div className="text-xs text-slate-500">Code de sécurité Market-Cash</div></div></button>
        <button onClick={() => setShowLogoutConfirm(true)} className="flex w-full items-center gap-3 p-5 text-left hover:bg-red-50"><div className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-600"><LogOut size={20}/></div><div className="font-bold text-red-600">Se déconnecter</div></button>
      </section>

      {showEditProfile && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4"><form onSubmit={handleSaveProfile} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4"><div className="flex items-center justify-between"><h3 className="text-xl font-black text-slate-950">Modifier mon profil</h3><button type="button" onClick={() => setShowEditProfile(false)} className="p-2 text-slate-400"><X size={20}/></button></div><label className="block"><span className="text-xs font-bold text-slate-600">Nom complet</span><input value={displayName} onChange={e => setDisplayName(e.target.value)} required className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-800"/></label><label className="block"><span className="text-xs font-bold text-slate-600">Numéro de téléphone</span><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-800"/></label><div className="grid grid-cols-2 gap-3 pt-2"><button type="button" onClick={() => setShowEditProfile(false)} className="rounded-xl bg-slate-100 py-3 font-bold text-slate-700">Annuler</button><button type="submit" disabled={savingProfile} className="rounded-xl bg-blue-950 py-3 font-bold text-white disabled:opacity-50">{savingProfile ? 'Enregistrement...' : 'Enregistrer'}</button></div></form></div>}

      {showChangePin && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4"><form onSubmit={handleChangePin} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Lock className="text-blue-950" size={20}/><h3 className="text-xl font-black text-slate-950">Changer mon PIN</h3></div><button type="button" onClick={() => setShowChangePin(false)} className="p-2 text-slate-400"><X size={20}/></button></div>{user.pinHash && <label className="block"><span className="text-xs font-bold text-slate-600">PIN actuel</span><input type="password" inputMode="numeric" maxLength={6} value={oldPin} onChange={e => setOldPin(e.target.value.replace(/\D/g,''))} required className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center font-mono text-lg font-bold tracking-widest outline-none focus:border-blue-800"/></label>}<label className="block"><span className="text-xs font-bold text-slate-600">Nouveau PIN (4 à 6 chiffres)</span><input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g,''))} required className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center font-mono text-lg font-bold tracking-widest outline-none focus:border-blue-800"/></label><label className="block"><span className="text-xs font-bold text-slate-600">Confirmer le nouveau PIN</span><input type="password" inputMode="numeric" maxLength={6} value={confirmNewPin} onChange={e => setConfirmNewPin(e.target.value.replace(/\D/g,''))} required className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center font-mono text-lg font-bold tracking-widest outline-none focus:border-blue-800"/></label><div className="grid grid-cols-2 gap-3 pt-2"><button type="button" onClick={() => setShowChangePin(false)} className="rounded-xl bg-slate-100 py-3 font-bold text-slate-700">Annuler</button><button type="submit" disabled={savingPin || newPin.length < 4} className="rounded-xl bg-blue-950 py-3 font-bold text-white disabled:opacity-50">{savingPin ? 'Modification...' : 'Confirmer'}</button></div></form></div>}

      <LogoutModal isOpen={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} />
    </div>
  );
}
