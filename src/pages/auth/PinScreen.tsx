import React,{useEffect,useMemo,useState}from'react';
import{useNavigate}from'react-router-dom';
import{deleteField,doc,updateDoc}from'firebase/firestore';
import{KeyRound,ShieldCheck}from'lucide-react';
import toast from'react-hot-toast';
import{useAuthStore}from'../../store/authStore';
import{db}from'../../firebase/config';
import{getHomeRouteByRole}from'../../lib/roleNavigation';
import LogoutModal from'../../components/LogoutModal';

async function hashPin(value:string){const encoded=new TextEncoder().encode(value);const buffer=await crypto.subtle.digest('SHA-256',encoded);return Array.from(new Uint8Array(buffer)).map(b=>b.toString(16).padStart(2,'0')).join('')}

export default function PinScreen(){
  const navigate=useNavigate();
  const{user,setUser,setPinVerified}=useAuthStore();
  const[pin,setPin]=useState('');
  const[confirmPin,setConfirmPin]=useState('');
  const[step,setStep]=useState<'temporary'|'new'|'confirm'|'verify'>('verify');
  const[loading,setLoading]=useState(false);
  const[showLogoutModal,setShowLogoutModal]=useState(false);

  const forcedAgentChange=Boolean(user?.role==='agent'&&user?.mustChangePin);
  const clientSetup=Boolean(user?.role==='client'&&!user?.pinHash);

  useEffect(()=>{
    if(!user){navigate('/login');return;}
    if(forcedAgentChange){setStep('temporary');return;}
    if(user.role==='client'){setStep(clientSetup?'new':'verify');return;}
    navigate(getHomeRouteByRole(user.role),{replace:true});
  },[user,forcedAgentChange,clientSetup,navigate]);

  const title=forcedAgentChange?'Sécuriser le compte':'Code PIN';
  const subtitle=useMemo(()=>{
    if(step==='temporary')return'Entrez le code temporaire 1234';
    if(step==='new')return forcedAgentChange?'Créez votre nouveau code PIN':'Créez votre code PIN';
    if(step==='confirm')return'Confirmez votre nouveau code';
    return'Entrez votre code PIN';
  },[step,forcedAgentChange]);

  const currentValue=step==='confirm'?confirmPin:pin;
  const setCurrent=(value:string)=>{const clean=value.replace(/\D/g,'').slice(0,6);step==='confirm'?setConfirmPin(clean):setPin(clean)};

  const finishNewPin=async()=>{
    if(!user)return;
    if(pin.length<4)return toast.error('Le PIN doit contenir 4 à 6 chiffres.');
    if(pin!==confirmPin){toast.error('Les codes ne correspondent pas.');setStep('new');setPin('');setConfirmPin('');return;}
    if(forcedAgentChange&&pin==='1234'){toast.error('Choisissez un code différent du code temporaire.');setStep('new');setPin('');setConfirmPin('');return;}
    setLoading(true);
    try{
      const pinHash=await hashPin(pin);const now=Date.now();
      if(forcedAgentChange){
        await updateDoc(doc(db,'users',user.uid),{pinHash,temporaryPinHash:deleteField(),mustChangePin:false,pinChangedAt:now,updatedAt:now});
        setUser({...user,pinHash,temporaryPinHash:undefined,mustChangePin:false,pinChangedAt:now,updatedAt:now});
        setPinVerified(true);toast.success('Nouveau code enregistré.');navigate('/agent/terminal',{replace:true});
      }else{
        await updateDoc(doc(db,'users',user.uid),{pinHash,pinChangedAt:now,updatedAt:now});
        setUser({...user,pinHash,pinChangedAt:now,updatedAt:now});setPinVerified(true);toast.success('PIN configuré.');navigate('/client/home',{replace:true});
      }
    }catch(error){console.error('[PIN_SAVE_ERROR]',error);toast.error('Impossible d’enregistrer le nouveau code.');}
    finally{setLoading(false)}
  };

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();if(!user||currentValue.length<4)return;
    if(step==='temporary'){
      setLoading(true);
      try{
        const entered=await hashPin(pin);
        const expected=user.temporaryPinHash||user.pinHash;
        if(!expected||entered!==expected){toast.error('Code temporaire incorrect.');setPin('');return;}
        setPin('');setStep('new');
      }finally{setLoading(false)}
      return;
    }
    if(step==='new'){setStep('confirm');return;}
    if(step==='confirm'){await finishNewPin();return;}
    setLoading(true);
    try{
      const entered=await hashPin(pin);
      if(user.pinHash===entered){setPinVerified(true);navigate('/client/home',{replace:true})}
      else{toast.error('PIN incorrect.');setPin('')}
    }finally{setLoading(false)}
  };

  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><div className="w-full max-w-sm rounded-[2rem] border bg-white p-7 text-center shadow-xl">
    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-950">{forcedAgentChange?<ShieldCheck/>:<KeyRound/>}</div>
    <h1 className="mt-5 text-2xl font-black text-blue-950">{title}</h1><p className="mt-2 text-sm font-medium text-slate-500">{subtitle}</p>
    {forcedAgentChange&&step==='temporary'&&<div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">Code provisoire : 1234</div>}
    <form onSubmit={submit} className="mt-6 space-y-4"><input autoFocus type="password" inputMode="numeric" pattern="[0-9]*" value={currentValue} onChange={e=>setCurrent(e.target.value)} className="w-full rounded-2xl border-2 bg-slate-50 px-5 py-5 text-center text-3xl font-black tracking-[.35em] outline-none focus:border-blue-500 focus:bg-white" placeholder="••••"/><button type="submit" disabled={loading||currentValue.length<4} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">{loading?'Traitement…':step==='confirm'?'Enregistrer':'Continuer'}</button></form>
    {(step==='confirm'||(step==='new'&&forcedAgentChange))&&<button onClick={()=>{setPin('');setConfirmPin('');setStep(forcedAgentChange?'temporary':'new')}} className="mt-4 text-xs font-black text-slate-500">Recommencer</button>}
    <button onClick={()=>setShowLogoutModal(true)} className="mt-7 text-xs font-black uppercase tracking-wider text-red-500">Déconnexion</button>
  </div><LogoutModal isOpen={showLogoutModal} onClose={()=>setShowLogoutModal(false)}/></div>;
}
