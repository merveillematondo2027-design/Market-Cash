import React,{useEffect,useState}from'react';
import{Bell,CreditCard,Fingerprint,KeyRound,LockKeyhole,ShieldCheck,TimerReset,WalletCards}from'lucide-react';
import{doc,updateDoc}from'firebase/firestore';
import toast from'react-hot-toast';
import{db}from'../../firebase/config';
import{useAuthStore}from'../../store/authStore';
import{agentWalletService,ClientSecurityOverview}from'../../services/agentWalletService';
import{deviceSecurityService}from'../../services/deviceSecurityService';
import SecurityConfirmModal from'../../components/SecurityConfirmModal';
import{WalletCurrency}from'../../types/wallet';

async function hashPin(value:string){const encoded=new TextEncoder().encode(value);const buffer=await crypto.subtle.digest('SHA-256',encoded);return Array.from(new Uint8Array(buffer)).map(b=>b.toString(16).padStart(2,'0')).join('')}
const cleanPin=(value:string)=>value.replace(/\D/g,'').slice(0,6);
const LOCK_OPTIONS=[1,5,15,30,60] as const;

export default function ClientSettings(){
 const{user,setUser}=useAuthStore();
 const[busy,setBusy]=useState(false);
 const[useBiometrics,setUseBiometrics]=useState(!!user?.useBiometrics);
 const[biometricAvailable,setBiometricAvailable]=useState(false);
 const[preferredCurrency,setPreferredCurrency]=useState<WalletCurrency>(()=>localStorage.getItem('marketcash_wallet_currency')==='CDF'?'CDF':'USD');
 const[security,setSecurity]=useState<ClientSecurityOverview|null>(null);
 const[showCvvConfirm,setShowCvvConfirm]=useState(false);
 const[newCvv,setNewCvv]=useState('');
 const[showPinChange,setShowPinChange]=useState(false);
 const[currentPin,setCurrentPin]=useState('');
 const[nextPin,setNextPin]=useState('');
 const[confirmPin,setConfirmPin]=useState('');
 const[autoLock,setAutoLock]=useState<number>(user?.securityAutoLockMinutes||5);

 useEffect(()=>{if(!user)return;setUseBiometrics(!!user.useBiometrics);setAutoLock(user.securityAutoLockMinutes||5);void agentWalletService.getClientSecurityOverview().then(setSecurity).catch(()=>setSecurity(null));void deviceSecurityService.platformAvailable().then(setBiometricAvailable)},[user?.uid]);
 if(!user)return null;
 const hasPin=Boolean(user.pinHash||security?.hasApplicationPin);

 const toggleBio=async()=>{
   if(busy)return;setBusy(true);
   try{
     const next=!useBiometrics;
     if(next){await deviceSecurityService.enroll(user.uid,user.displayName||user.email);await updateDoc(doc(db,'users',user.uid),{useBiometrics:true,updatedAt:Date.now()});setUseBiometrics(true);setUser({...user,useBiometrics:true});toast.success('Empreinte / Face ID activé sur cet appareil.');}
     else{deviceSecurityService.remove(user.uid);await updateDoc(doc(db,'users',user.uid),{useBiometrics:false,updatedAt:Date.now()});setUseBiometrics(false);setUser({...user,useBiometrics:false});toast.success('Biométrie désactivée.');}
   }catch(error:any){toast.error(error?.message||'Activation biométrique impossible.')}finally{setBusy(false)}
 };
 const testBio=async()=>{try{await deviceSecurityService.verify(user.uid);toast.success('Biométrie confirmée.')}catch(error:any){toast.error(error?.message||'Vérification impossible.')}};
 const changeCurrency=(value:WalletCurrency)=>{setPreferredCurrency(value);localStorage.setItem('marketcash_wallet_currency',value);toast.success(`Devise préférée : ${value}`)};
 const rotateCvv=async(pin:string)=>{setBusy(true);try{const result=await agentWalletService.rotateLocalCvv(pin);setNewCvv(result.cvv);setSecurity(current=>({...current||{hasApplicationPin:true,hasLocalCvv:true,cvvVersion:0,cvvUpdatedAt:0},hasLocalCvv:true,cvvVersion:result.version,cvvUpdatedAt:result.updatedAt}));setShowCvvConfirm(false);toast.success('Nouveau CVV généré.')}catch(error:any){toast.error(error?.message||'Impossible de modifier le CVV.')}finally{setBusy(false)}};
 const saveAutoLock=async(value:number)=>{setAutoLock(value);try{const now=Date.now();await updateDoc(doc(db,'users',user.uid),{securityAutoLockMinutes:value,updatedAt:now});setUser({...user,securityAutoLockMinutes:value,updatedAt:now});toast.success(`Verrouillage automatique : ${value} min`)}catch{toast.error('Impossible d’enregistrer la durée.')}};
 const savePin=async(e:React.FormEvent)=>{
   e.preventDefault();if(nextPin.length<4)return toast.error('Le PIN doit contenir 4 à 6 chiffres.');if(nextPin!==confirmPin)return toast.error('Les deux nouveaux PIN ne correspondent pas.');if(hasPin&&currentPin.length<4)return toast.error('Entrez votre PIN actuel.');setBusy(true);
   try{
     const now=Date.now();
     if(hasPin){const result=await agentWalletService.changeApplicationPin({currentPin,newPin:nextPin});setUser({...user,pinChangedAt:result.pinChangedAt,updatedAt:result.pinChangedAt});}
     else{const pinHash=await hashPin(nextPin);await updateDoc(doc(db,'users',user.uid),{pinHash,pinChangedAt:now,securityAutoLockMinutes:autoLock||5,updatedAt:now});setUser({...user,pinHash,pinChangedAt:now,securityAutoLockMinutes:autoLock||5,updatedAt:now});setSecurity(current=>({...current||{hasApplicationPin:false,hasLocalCvv:false,cvvVersion:0,cvvUpdatedAt:0},hasApplicationPin:true}));}
     setShowPinChange(false);setCurrentPin('');setNextPin('');setConfirmPin('');toast.success(hasPin?'PIN modifié.':'PIN créé.');
   }catch(error:any){toast.error(error?.message||'Modification refusée.')}finally{setBusy(false)}
 };

 return <div className="mx-auto max-w-2xl space-y-5 p-4 pb-28 md:p-8"><header><p className="text-sm font-semibold text-slate-500">Sécurité & préférences</p><h1 className="mt-1 text-3xl font-black text-slate-950">Paramètres</h1></header>
 <section className="rounded-[2rem] border bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-900"><LockKeyhole/></div><div><h2 className="text-lg font-black">Sécurité</h2><p className="text-xs leading-5 text-slate-500">PIN, biométrie et durée avant reverrouillage.</p></div></div>
 <div className="mt-5 divide-y overflow-hidden rounded-2xl border"><button onClick={()=>setShowPinChange(true)} className="flex w-full items-center justify-between gap-3 p-4 text-left"><span className="flex items-center gap-3"><KeyRound className="text-blue-800" size={20}/><span><b className="block text-sm">PIN de l’application</b><small className="text-slate-500">{hasPin?'Modifier votre PIN':'Aucun PIN — vous pouvez le créer maintenant'}</small></span></span><b className="text-xs text-blue-700">{hasPin?'Modifier':'Créer'}</b></button>
 <button onClick={()=>void toggleBio()} disabled={busy||!biometricAvailable} className="flex w-full items-center justify-between gap-3 p-4 text-left disabled:opacity-40"><span className="flex items-center gap-3"><Fingerprint className="text-blue-800" size={20}/><span><b className="block text-sm">Empreinte digitale / Face ID</b><small className="text-slate-500">Déverrouillage rapide avec la biométrie de l’appareil</small></span></span><span className={`h-7 w-12 rounded-full p-1 ${useBiometrics?'bg-blue-950':'bg-slate-300'}`}><span className={`block h-5 w-5 rounded-full bg-white transition ${useBiometrics?'translate-x-5':''}`}/></span></button>
 {useBiometrics&&<button onClick={()=>void testBio()} className="flex w-full items-center justify-between gap-3 p-4 text-left"><span className="flex items-center gap-3"><ShieldCheck className="text-emerald-700" size={20}/><span><b className="block text-sm">Tester la biométrie</b><small className="text-slate-500">Vérifier que l’empreinte ou Face ID répond correctement</small></span></span><b className="text-xs text-emerald-700">Tester</b></button>}
 <div className="p-4"><div className="flex items-center gap-3"><TimerReset className="text-blue-800" size={20}/><div><b className="block text-sm">Reverrouillage automatique</b><small className="text-slate-500">Après une période d’inactivité</small></div></div><div className="mt-3 grid grid-cols-5 gap-1.5">{LOCK_OPTIONS.map(value=><button key={value} onClick={()=>void saveAutoLock(value)} className={`rounded-xl px-2 py-2 text-xs font-black ${autoLock===value?'bg-blue-950 text-white':'bg-slate-100 text-slate-600'}`}>{value} min</button>)}</div></div>
 <button onClick={()=>setShowCvvConfirm(true)} disabled={!hasPin||user.kycStatus!=='approved'} className="flex w-full items-center justify-between gap-3 p-4 text-left disabled:opacity-40"><span className="flex items-center gap-3"><CreditCard className="text-amber-700" size={20}/><span><b className="block text-sm">CVV Wallet + carte locale</b><small className="text-slate-500">3 chiffres · opérations financières</small></span></span><b className="text-xs text-amber-700">Régénérer</b></button></div>
 <p className="mt-3 text-[11px] leading-5 text-slate-500">La biométrie protège l’accès rapide sur cet appareil. Les opérations financières sensibles continuent d’utiliser le PIN/CVV serveur Market-Cash.</p>{security?.cvvUpdatedAt?<p className="mt-2 text-[10px] font-semibold text-slate-400">CVV renouvelé le {new Date(security.cvvUpdatedAt).toLocaleString('fr-FR')}</p>:null}{newCvv&&<div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center"><p className="text-[10px] font-black uppercase text-amber-700">Nouveau CVV</p><p className="mt-2 font-mono text-3xl font-black tracking-[.45em]">{newCvv}</p><button onClick={()=>setNewCvv('')} className="mt-3 rounded-xl bg-white px-4 py-2 text-xs font-black">Masquer</button></div>}</section>
 <section className="rounded-[2rem] border bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Préférences</h2><div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-3"><WalletCards size={19} className="text-blue-800"/><span><b className="block text-sm">Devise par défaut</b><small className="text-slate-500">Wallet et écrans de transaction</small></span></div><div className="inline-flex rounded-xl bg-white p-1 shadow-sm">{(['USD','CDF']as WalletCurrency[]).map(value=><button key={value} onClick={()=>changeCurrency(value)} className={`rounded-lg px-3 py-2 text-xs font-black ${preferredCurrency===value?'bg-blue-950 text-white':'text-slate-500'}`}>{value}</button>)}</div></div><div className="mt-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-4"><Bell size={19} className="text-blue-800"/><span><b className="block text-sm">Notifications de sécurité</b><small className="text-slate-500">Actives pour les changements sensibles</small></span></div></section>
 {showPinChange&&<div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4"><form onSubmit={savePin} className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl"><h2 className="text-xl font-black">{hasPin?'Modifier le PIN':'Créer le PIN'}</h2><p className="mt-1 text-xs text-slate-500">{hasPin?'Confirmez votre PIN actuel puis choisissez le nouveau.':'Entrez le nouveau PIN deux fois.'}</p><div className="mt-4 space-y-3">{hasPin&&<input value={currentPin} onChange={e=>setCurrentPin(cleanPin(e.target.value))} inputMode="numeric" type="password" placeholder="PIN actuel" className="w-full rounded-2xl border p-4"/>}<input value={nextPin} onChange={e=>setNextPin(cleanPin(e.target.value))} inputMode="numeric" type="password" placeholder="Nouveau PIN" className="w-full rounded-2xl border p-4"/><input value={confirmPin} onChange={e=>setConfirmPin(cleanPin(e.target.value))} inputMode="numeric" type="password" placeholder="Confirmer le PIN" className="w-full rounded-2xl border p-4"/></div><div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={()=>{setShowPinChange(false);setCurrentPin('');setNextPin('');setConfirmPin('')}} className="rounded-2xl bg-slate-100 p-3 font-black">Annuler</button><button disabled={busy} className="rounded-2xl bg-blue-950 p-3 font-black text-white disabled:opacity-40">{hasPin?'Enregistrer':'Créer le PIN'}</button></div></form></div>}
 <SecurityConfirmModal open={showCvvConfirm} busy={busy} onClose={()=>!busy&&setShowCvvConfirm(false)} onConfirm={rotateCvv} title="Régénérer le CVV" subtitle="Entrez le PIN de l’application."/></div>;
}
