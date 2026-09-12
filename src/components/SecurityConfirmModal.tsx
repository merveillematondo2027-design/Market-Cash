import React,{useEffect,useState}from'react';
import{Fingerprint,KeyRound,X}from'lucide-react';
import{useAuthStore}from'../store/authStore';
import{deviceSecurityService}from'../services/deviceSecurityService';

interface Props{
  open:boolean;
  title?:string;
  subtitle?:string;
  busy?:boolean;
  onClose:()=>void;
  onConfirm:(pin:string)=>Promise<void>|void;
  onBiometric?:()=>Promise<void>|void;
}

export default function SecurityConfirmModal({open,title='Confirmer avec votre code secret',subtitle='Ce code protège les actions sensibles de votre application Market-Cash.',busy=false,onClose,onConfirm,onBiometric}:Props){
  const{user}=useAuthStore();
  const[pin,setPin]=useState('');
  const[bioBusy,setBioBusy]=useState(false);
  const[bioAvailable,setBioAvailable]=useState(false);
  useEffect(()=>{if(!open)setPin('');if(open&&user?.useBiometrics&&onBiometric)void deviceSecurityService.platformAvailable().then(setBioAvailable)},[open,user?.useBiometrics,onBiometric]);
  if(!open)return null;
  const valid=/^\d{4,10}$/.test(pin);
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!valid||busy)return;await onConfirm(pin)};
  return <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
    <form onSubmit={submit} className="w-full max-w-sm rounded-[2rem] border border-white/20 bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-950"><KeyRound size={23}/></div>
        <button type="button" onClick={onClose} disabled={busy} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600"><X size={18}/></button>
      </div>
      <h2 className="mt-5 text-xl font-black text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
      <p className="mt-2 text-xs font-semibold text-slate-400">PIN de 4 à 10 chiffres.</p>
      <input autoFocus value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,10))} type="password" inputMode="numeric" autoComplete="off" minLength={4} maxLength={10} placeholder="Votre PIN" className="mt-5 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-5 py-4 text-center text-2xl font-black tracking-[.3em] outline-none transition focus:border-blue-600 focus:bg-white"/>
      <button disabled={busy||!valid} className="mt-4 w-full rounded-2xl bg-blue-950 py-4 font-black text-white shadow-sm disabled:opacity-40">{busy?'Vérification…':'Confirmer'}</button>{user?.useBiometrics&&onBiometric&&bioAvailable&&<><div className="my-3 flex items-center gap-3 text-[10px] font-black uppercase text-slate-300"><span className="h-px flex-1 bg-slate-200"/>ou<span className="h-px flex-1 bg-slate-200"/></div><button type="button" disabled={busy||bioBusy} onClick={async()=>{setBioBusy(true);try{await deviceSecurityService.verify(user.uid);await onBiometric()}finally{setBioBusy(false)}}} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-blue-200 bg-blue-50 py-4 font-black text-blue-950 disabled:opacity-40"><Fingerprint size={20}/>{bioBusy?'Vérification…':'Biométrie / sécurité appareil'}</button></>}
    </form>
  </div>;
}
