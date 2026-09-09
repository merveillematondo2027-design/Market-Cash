import React,{useEffect,useState}from'react';
import{useNavigate}from'react-router-dom';
import{deleteField,doc,updateDoc}from'firebase/firestore';
import{KeyRound,ShieldCheck}from'lucide-react';
import toast from'react-hot-toast';
import{useAuthStore}from'../../store/authStore';
import{db}from'../../firebase/config';
import{getHomeRouteByRole}from'../../lib/roleNavigation';
import LogoutModal from'../../components/LogoutModal';

async function hashPin(value:string){const encoded=new TextEncoder().encode(value);const buffer=await crypto.subtle.digest('SHA-256',encoded);return Array.from(new Uint8Array(buffer)).map(b=>b.toString(16).padStart(2,'0')).join('')}

type Mode='temporary'|'setup'|'verify';

export default function PinScreen(){
  const navigate=useNavigate();
  const{user,setUser,setPinVerified}=useAuthStore();
  const[pin,setPin]=useState('');
  const[confirmPin,setConfirmPin]=useState('');
  const[mode,setMode]=useState<Mode>('verify');
  const[loading,setLoading]=useState(false);
  const[showLogoutModal,setShowLogoutModal]=useState(false);

  const forcedAgentChange=Boolean(user?.role==='agent'&&user?.mustChangePin);
  const clientSetup=Boolean(user?.role==='client'&&!user?.pinHash);

  useEffect(()=>{
    if(!user){navigate('/login');return;}
    if(forcedAgentChange){setMode('temporary');return;}
    if(user.role==='client'){setMode(clientSetup?'setup':'verify');return;}
    navigate(getHomeRouteByRole(user.role),{replace:true});
  },[user,forcedAgentChange,clientSetup,navigate]);

  const clean=(value:string)=>value.replace(/\D/g,'').slice(0,6);
  const completeSetup=async()=>{
    if(!user)return;
    if(pin.length<4||confirmPin.length<4)return toast.error('Le PIN doit contenir 4 à 6 chiffres.');
    if(pin!==confirmPin)return toast.error('Les deux codes PIN ne correspondent pas.');
    if(forcedAgentChange&&pin==='1234')return toast.error('Choisissez un code différent du code temporaire.');
    setLoading(true);
    try{
      const pinHash=await hashPin(pin);const now=Date.now();
      if(forcedAgentChange){
        await updateDoc(doc(db,'users',user.uid),{pinHash,temporaryPinHash:deleteField(),mustChangePin:false,pinChangedAt:now,updatedAt:now});
        setUser({...user,pinHash,temporaryPinHash:undefined,mustChangePin:false,pinChangedAt:now,updatedAt:now});
        setPinVerified(true);toast.success('Nouveau PIN enregistré.');navigate('/agent/terminal',{replace:true});
      }else{
        await updateDoc(doc(db,'users',user.uid),{pinHash,pinChangedAt:now,securityAutoLockMinutes:user.securityAutoLockMinutes||5,updatedAt:now});
        setUser({...user,pinHash,pinChangedAt:now,securityAutoLockMinutes:user.securityAutoLockMinutes||5,updatedAt:now});
        setPinVerified(true);toast.success('PIN créé.');navigate('/client/home',{replace:true});
      }
    }catch(error){console.error('[PIN_SAVE_ERROR]',error);toast.error('Impossible d’enregistrer le PIN.');}
    finally{setLoading(false)}
  };

  const verifyTemporary=async(e:React.FormEvent)=>{
    e.preventDefault();if(!user||pin.length<4)return;
    setLoading(true);
    try{
      const entered=await hashPin(pin);const expected=user.temporaryPinHash||user.pinHash;
      if(!expected||entered!==expected){toast.error('Code temporaire incorrect.');setPin('');return;}
      setPin('');setConfirmPin('');setMode('setup');
    }finally{setLoading(false)}
  };

  const verifyExisting=async(e:React.FormEvent)=>{
    e.preventDefault();if(!user||pin.length<4)return;
    setLoading(true);
    try{
      const entered=await hashPin(pin);
      if(user.pinHash===entered){setPinVerified(true);sessionStorage.setItem('marketcash_security_verified_at',String(Date.now()));navigate('/client/home',{replace:true})}
      else{toast.error('PIN incorrect.');setPin('')}
    }finally{setLoading(false)}
  };

  const skipForNow=()=>{
    if(!user||user.role!=='client'||user.pinHash)return;
    setPinVerified(true);
    sessionStorage.setItem('marketcash_pin_setup_deferred','1');
    toast('Vous pourrez créer votre PIN depuis Paramètres > Sécurité.');
    navigate('/client/home',{replace:true});
  };

  if(mode==='setup')return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="w-full max-w-sm rounded-[2rem] border bg-white p-7 shadow-xl">
    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-950"><ShieldCheck/></div>
    <h1 className="mt-5 text-center text-2xl font-black text-blue-950">{forcedAgentChange?'Créer votre nouveau PIN':'Sécuriser Market-Cash'}</h1>
    <p className="mt-2 text-center text-sm leading-5 text-slate-500">Choisissez directement votre PIN puis confirmez-le dans le deuxième champ.</p>
    <div className="mt-6 space-y-3"><input autoFocus type="password" inputMode="numeric" pattern="[0-9]*" value={pin} onChange={e=>setPin(clean(e.target.value))} className="w-full rounded-2xl border-2 bg-slate-50 px-5 py-4 text-center text-2xl font-black tracking-[.3em] outline-none focus:border-blue-500" placeholder="Nouveau PIN"/><input type="password" inputMode="numeric" pattern="[0-9]*" value={confirmPin} onChange={e=>setConfirmPin(clean(e.target.value))} className="w-full rounded-2xl border-2 bg-slate-50 px-5 py-4 text-center text-2xl font-black tracking-[.3em] outline-none focus:border-blue-500" placeholder="Confirmer le PIN"/></div>
    <button onClick={()=>void completeSetup()} disabled={loading||pin.length<4||confirmPin.length<4} className="mt-4 w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">{loading?'Création…':'Créer le PIN'}</button>
    {!forcedAgentChange&&<button onClick={skipForNow} disabled={loading} className="mt-3 w-full rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-black text-slate-600">Faire plus tard</button>}
    <button onClick={()=>setShowLogoutModal(true)} className="mt-6 w-full text-xs font-black uppercase tracking-wider text-red-500">Déconnexion</button>
    <LogoutModal isOpen={showLogoutModal} onClose={()=>setShowLogoutModal(false)}/>
  </div></div>;

  if(mode==='temporary')return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="w-full max-w-sm rounded-[2rem] border bg-white p-7 text-center shadow-xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-800"><ShieldCheck/></div><h1 className="mt-5 text-2xl font-black text-blue-950">Sécuriser le compte</h1><p className="mt-2 text-sm text-slate-500">Entrez d’abord le code temporaire reçu.</p><form onSubmit={verifyTemporary} className="mt-6"><input autoFocus type="password" inputMode="numeric" value={pin} onChange={e=>setPin(clean(e.target.value))} className="w-full rounded-2xl border-2 bg-slate-50 px-5 py-5 text-center text-3xl font-black tracking-[.35em] outline-none focus:border-blue-500" placeholder="••••"/><button disabled={loading||pin.length<4} className="mt-4 w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">{loading?'Vérification…':'Continuer'}</button></form><button onClick={()=>setShowLogoutModal(true)} className="mt-7 text-xs font-black uppercase tracking-wider text-red-500">Déconnexion</button><LogoutModal isOpen={showLogoutModal} onClose={()=>setShowLogoutModal(false)}/></div></div>;

  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="w-full max-w-sm rounded-[2rem] border bg-white p-7 text-center shadow-xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-950"><KeyRound/></div><h1 className="mt-5 text-2xl font-black text-blue-950">Code PIN</h1><p className="mt-2 text-sm text-slate-500">Entrez votre PIN pour ouvrir votre espace Market-Cash.</p><form onSubmit={verifyExisting} className="mt-6"><input autoFocus type="password" inputMode="numeric" value={pin} onChange={e=>setPin(clean(e.target.value))} className="w-full rounded-2xl border-2 bg-slate-50 px-5 py-5 text-center text-3xl font-black tracking-[.35em] outline-none focus:border-blue-500" placeholder="••••"/><button disabled={loading||pin.length<4} className="mt-4 w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">{loading?'Vérification…':'Déverrouiller'}</button></form><button onClick={()=>setShowLogoutModal(true)} className="mt-7 text-xs font-black uppercase tracking-wider text-red-500">Déconnexion</button><LogoutModal isOpen={showLogoutModal} onClose={()=>setShowLogoutModal(false)}/></div></div>;
}
