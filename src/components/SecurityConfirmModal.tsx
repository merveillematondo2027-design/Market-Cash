import React,{useEffect,useState}from'react';
import{KeyRound,X}from'lucide-react';

interface Props{
  open:boolean;
  title?:string;
  subtitle?:string;
  busy?:boolean;
  onClose:()=>void;
  onConfirm:(pin:string)=>Promise<void>|void;
}

export default function SecurityConfirmModal({open,title='Confirmer avec votre code secret',subtitle='Ce code protège les actions sensibles de votre application Market-Cash.',busy=false,onClose,onConfirm}:Props){
  const[pin,setPin]=useState('');
  useEffect(()=>{if(!open)setPin('')},[open]);
  if(!open)return null;
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(pin.length<4||busy)return;await onConfirm(pin)};
  return <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
    <form onSubmit={submit} className="w-full max-w-sm rounded-[2rem] border border-white/20 bg-white p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-950"><KeyRound size={23}/></div>
        <button type="button" onClick={onClose} disabled={busy} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600"><X size={18}/></button>
      </div>
      <h2 className="mt-5 text-xl font-black text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
      <input autoFocus value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} type="password" inputMode="numeric" autoComplete="off" placeholder="••••" className="mt-5 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-5 py-4 text-center text-2xl font-black tracking-[.35em] outline-none transition focus:border-blue-600 focus:bg-white"/>
      <button disabled={busy||pin.length<4} className="mt-4 w-full rounded-2xl bg-blue-950 py-4 font-black text-white shadow-sm disabled:opacity-40">{busy?'Vérification…':'Confirmer'}</button>
    </form>
  </div>;
}
