import React,{useEffect,useMemo,useState}from'react';
import{ArrowDownLeft,History,LockKeyhole,RefreshCw,Search,ChevronRight}from'lucide-react';
import toast from'react-hot-toast';
import SecurityConfirmModal from'../../components/SecurityConfirmModal';
import TransactionDetailsModal from'../../components/TransactionDetailsModal';
import{useSensitiveReveal}from'../../hooks/useSensitiveReveal';
import{useAuthStore}from'../../store/authStore';
import{agentWalletService}from'../../services/agentWalletService';

const money=(value:number,currency:string)=>currency==='CDF'?`${Number(value||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(value||0).toFixed(2)} USD`;

export default function BusinessHistory(){
  const{user}=useAuthStore();
  const[history,setHistory]=useState<any[]>([]);
  const[loading,setLoading]=useState(true);
  const[search,setSearch]=useState('');
  const[selected,setSelected]=useState<any|null>(null);
  const secure=useSensitiveReveal(90000);
  const load=async()=>{setLoading(true);try{setHistory(await agentWalletService.getMyWalletHistory())}catch(e){console.error('[BUSINESS_TRANSACTIONS_LOAD_ERROR]',e);toast.error('Impossible de charger les transactions.')}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  const transactions=useMemo(()=>{const q=search.trim().toLowerCase();return history.filter((item:any)=>{const incoming=String(item.recipientId||'')===user?.uid||String(item.destinationWalletId||'').includes(user?.uid||'');if(!incoming&&item.type!=='merchant_payment')return false;if(!q)return true;return[item.reference,item.merchantName,item.type,item.currency,item.amount].some(v=>String(v||'').toLowerCase().includes(q))})},[history,search,user?.uid]);

  return <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-8">
    <header className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-amber-600">Compte Business</p><h1 className="text-2xl font-black text-blue-950">Transactions d'encaissement</h1><p className="mt-1 text-sm text-slate-500">Les opérations sont protégées par votre code secret d'application et chaque ligne peut être ouverte.</p></div><button disabled={loading} onClick={load} className="rounded-2xl bg-white p-3 text-blue-900 shadow-sm disabled:opacity-40"><RefreshCw size={18} className={loading?'animate-spin':''}/></button></header>
    {!secure.revealed?<button onClick={secure.request} className="w-full rounded-3xl border border-blue-100 bg-white p-8 text-center shadow-sm"><LockKeyhole className="mx-auto text-blue-800" size={34}/><h2 className="mt-3 font-black text-blue-950">Afficher les transactions</h2><p className="mt-1 text-sm text-slate-500">Entrez le code secret de l'application pour consulter les montants, références et détails.</p></button>:<><div className="relative"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Référence, montant ou devise" className="w-full rounded-2xl border bg-white p-4 pl-11 outline-none focus:border-blue-500"/></div><section className="space-y-3">{loading?<div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-500">Chargement…</div>:transactions.length===0?<div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-500"><History className="mx-auto mb-2 text-slate-400"/>Aucun encaissement trouvé.</div>:transactions.map((t:any)=>{const incoming=String(t.recipientId||'')===user?.uid||String(t.destinationWalletId||'').includes(user?.uid||'');return <button key={t.id||t.reference} onClick={()=>setSelected(t)} className="w-full rounded-3xl border bg-white p-5 text-left shadow-sm transition active:scale-[.995]"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><ArrowDownLeft size={20}/></div><div className="min-w-0"><h2 className="font-black text-slate-950">{t.type==='merchant_payment'?'Paiement client':'Crédit reçu'}</h2><p className="mt-1 truncate font-mono text-[10px] text-slate-400">{t.reference||t.id}</p><p className="mt-1 text-[11px] text-slate-500">{t.createdAt?new Date(t.createdAt).toLocaleString('fr-FR'):'Date inconnue'}</p></div></div><div className="flex items-center gap-2"><div className="text-right"><b className="text-lg text-emerald-700">{incoming?'+':''}{money(Number(t.amount||0),String(t.currency||'USD'))}</b><p className="mt-1 text-[10px] font-black uppercase text-slate-400">{String(t.status||'settled')}</p></div><ChevronRight size={17} className="text-slate-300"/></div></div></button>})}</section></>}
    <SecurityConfirmModal open={secure.open} busy={secure.busy} onClose={secure.close} onConfirm={secure.confirm} title="Afficher les transactions Business" subtitle="Entrez le code secret de l'application. Il protège la consultation, pas les transactions."/>
    {secure.revealed&&selected&&<TransactionDetailsModal transaction={selected} onClose={()=>setSelected(null)}/>} 
  </div>;
}
