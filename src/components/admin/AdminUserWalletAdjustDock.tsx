import{useEffect,useMemo,useState}from'react';
import{MinusCircle,PlusCircle,RefreshCw,WalletCards,X}from'lucide-react';
import toast from'react-hot-toast';
import{adminUserService,AdminUserControlSnapshot}from'../../services/adminUserService';

const money=(value:number,currency:'USD'|'CDF')=>currency==='CDF'?`${Number(value||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(value||0).toFixed(2)} USD`;

export default function AdminUserWalletAdjustDock({targetUid,onClose}:{targetUid:string;onClose?:()=>void}){
 const[control,setControl]=useState<AdminUserControlSnapshot|null>(null);
 const[loading,setLoading]=useState(true);
 const[busy,setBusy]=useState('');
 const[currency,setCurrency]=useState<'USD'|'CDF'>('USD');
 const[amount,setAmount]=useState('');
 const[reason,setReason]=useState('Ajustement administratif du wallet');

 const wallet=useMemo(()=>control?.wallets?.[currency]||null,[control,currency]);
 async function load(){setLoading(true);try{setControl(await adminUserService.getControl(targetUid))}catch(e:any){console.error('[ADMIN_WALLET_ADJUST_DOCK_LOAD]',e);toast.error(e?.message||'Impossible de lire les wallets.')}finally{setLoading(false)}}
 useEffect(()=>{void load()},[targetUid]);

 async function adjust(direction:'credit'|'debit'){
  const parsed=Number(String(amount).replace(/\s/g,'').replace(',','.'));
  if(!Number.isFinite(parsed)||parsed<=0)return toast.error('Montant invalide.');
  if(reason.trim().length<5)return toast.error('Motif obligatoire.');
  const available=Number(wallet?.availableBalance||0);
  if(direction==='debit'&&parsed>available)return toast.error(`Solde insuffisant : ${money(available,currency)} disponible.`);
  if(direction==='debit'&&!window.confirm(`Confirmer la réduction de ${money(parsed,currency)} ?`))return;
  setBusy(direction);
  try{
   const result=await adminUserService.adjustWallet(targetUid,currency,direction,parsed,reason.trim());
   setAmount('');
   toast.success(direction==='credit'?`${money(parsed,currency)} ajoutés.`:`${money(parsed,currency)} retirés.`);
   await load();
   return result;
  }catch(e:any){toast.error(e?.message||'Ajustement du wallet impossible.')}finally{setBusy('')}
 }

 return <aside className="fixed bottom-20 right-4 z-[120] w-[min(92vw,390px)] rounded-[1.6rem] border border-blue-100 bg-white p-4 shadow-2xl md:bottom-5 md:right-5">
  <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-950 text-white"><WalletCards size={18}/></div><div><h3 className="font-black text-blue-950">Ajuster les wallets</h3><p className="max-w-[250px] truncate text-[10px] text-slate-400">Utilisateur {targetUid}</p></div></div><div className="flex gap-1"><button onClick={()=>void load()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" disabled={loading}><RefreshCw size={16} className={loading?'animate-spin':''}/></button>{onClose&&<button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={16}/></button>}</div></div>
  <div className="mt-4 grid grid-cols-2 gap-2">{(['USD','CDF']as const).map(c=><button key={c} onClick={()=>setCurrency(c)} className={`rounded-xl py-2.5 text-sm font-black ${currency===c?'bg-blue-950 text-white':'bg-slate-100 text-slate-600'}`}>{c}</button>)}</div>
  <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase text-slate-400">Solde disponible</p><p className="mt-1 text-xl font-black text-slate-950">{loading?'…':money(Number(wallet?.availableBalance||0),currency)}</p><p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{wallet?.status||'wallet non initialisé'}</p></div>
  <label className="mt-3 block"><span className="text-[10px] font-black uppercase text-slate-400">Montant</span><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={currency==='CDF'?'50 000':'100'} className="mt-1 w-full rounded-xl border p-3 font-black outline-none focus:border-blue-500"/></label>
  <label className="mt-3 block"><span className="text-[10px] font-black uppercase text-slate-400">Motif</span><input value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 w-full rounded-xl border p-3 text-sm outline-none focus:border-blue-500"/></label>
  <div className="mt-3 grid grid-cols-2 gap-2"><button disabled={!!busy} onClick={()=>void adjust('credit')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-black text-white disabled:opacity-40"><PlusCircle size={15}/>{busy==='credit'?'Ajout…':'Ajouter'}</button><button disabled={!!busy} onClick={()=>void adjust('debit')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-xs font-black text-white disabled:opacity-40"><MinusCircle size={15}/>{busy==='debit'?'Retrait…':'Réduire'}</button></div>
 </aside>;
}
