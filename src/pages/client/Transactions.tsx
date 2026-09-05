import React,{useEffect,useMemo,useState}from'react';
import{ArrowLeft,CheckCircle2,ChevronRight,CircleX,Filter,LockKeyhole,ReceiptText,RefreshCw,Search}from'lucide-react';
import{Link,useSearchParams}from'react-router-dom';
import toast from'react-hot-toast';
import SecurityConfirmModal from'../../components/SecurityConfirmModal';
import TransactionDetailsModal from'../../components/TransactionDetailsModal';
import{useSensitiveReveal}from'../../hooks/useSensitiveReveal';
import{agentWalletService}from'../../services/agentWalletService';

type StatusFilter='all'|'success'|'failed';
const money=(value:any,currency='USD')=>String(currency).toUpperCase()==='CDF'?`${Number(value||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(value||0).toFixed(2)} USD`;
const words=(value:any)=>String(value||'Transaction').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const failed=(t:any)=>['failed','declined','rejected','cancelled'].includes(String(t?.status||'').toLowerCase());
const balanceAfter=(t:any)=>{for(const value of[t?.balanceAfter,t?.cardBalanceAfter,t?.walletBalanceAfter,t?.clientBalanceAfter,t?.senderBalanceAfter]){if(value!==undefined&&value!==null&&value!==''&&Number.isFinite(Number(value)))return Number(value)}return null};

export default function Transactions(){
  const[params]=useSearchParams();
  const[items,setItems]=useState<any[]>([]);
  const[loading,setLoading]=useState(true);
  const[search,setSearch]=useState('');
  const[status,setStatus]=useState<StatusFilter>('all');
  const[selected,setSelected]=useState<any|null>(null);
  const secure=useSensitiveReveal(90000);
  const requested=params.get('transaction');

  const load=async()=>{setLoading(true);try{setItems(await agentWalletService.getMyWalletHistory())}catch(error){console.error('[CLIENT_TRANSACTIONS_LOAD_ERROR]',error);toast.error('Impossible de charger les transactions.')}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  useEffect(()=>{if(!secure.revealed||!requested||!items.length)return;const found=items.find(t=>String(t.id||'')===requested||String(t.transactionId||'')===requested||String(t.reference||'')===requested);if(found)setSelected(found)},[secure.revealed,requested,items]);

  const visible=useMemo(()=>{const q=search.trim().toLowerCase();return items.filter(t=>{if(status==='failed'&&!failed(t))return false;if(status==='success'&&failed(t))return false;if(!q)return true;return[t.reference,t.externalReference,t.type,t.status,t.developerName,t.merchantName,t.appName,t.amount,t.currency,t.failureCode].some(v=>String(v||'').toLowerCase().includes(q))})},[items,search,status]);

  return <div className="mx-auto max-w-3xl space-y-5 p-4 pb-28 md:p-8">
    <header className="flex items-start justify-between gap-4"><div><Link to="/client/home" className="inline-flex items-center gap-2 text-xs font-bold text-slate-500"><ArrowLeft size={14}/>Accueil</Link><h1 className="mt-3 text-2xl font-black text-slate-950">Transactions</h1><p className="mt-1 text-sm text-slate-500">Toutes vos opérations Market-Cash, réussies ou refusées, avec leurs références et soldes disponibles.</p></div><button disabled={loading} onClick={load} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border bg-white text-blue-900 shadow-sm disabled:opacity-40" aria-label="Actualiser"><RefreshCw size={18} className={loading?'animate-spin':''}/></button></header>

    {!secure.revealed?<button onClick={secure.request} className="w-full rounded-3xl border border-blue-100 bg-white p-8 text-center shadow-sm"><LockKeyhole className="mx-auto text-blue-800" size={34}/><h2 className="mt-3 font-black text-blue-950">Afficher mes transactions</h2><p className="mt-1 text-sm text-slate-500">Votre code secret d'application protège les montants et les détails.</p></button>:<>
      <section className="rounded-3xl border bg-white p-4 shadow-sm"><div className="relative"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Référence, bénéficiaire, montant…" className="w-full rounded-2xl border bg-slate-50 p-3.5 pl-11 text-sm outline-none focus:border-blue-500"/></div><div className="mt-3 flex items-center gap-2 overflow-x-auto"><Filter size={15} className="shrink-0 text-slate-400"/>{([['all','Toutes'],['success','Réussies'],['failed','Échouées']]as const).map(([key,label])=><button key={key} onClick={()=>setStatus(key)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-black ${status===key?'bg-blue-950 text-white':'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div></section>

      <section className="space-y-3">{loading?<div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-500">Chargement…</div>:visible.length===0?<div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-500"><ReceiptText className="mx-auto mb-2 text-slate-300"/>Aucune transaction trouvée.</div>:visible.map(t=>{const isFailed=failed(t);const after=balanceAfter(t);const c=String(t.currency||'USD').toUpperCase();const title=t.developerName||t.merchantName||t.appName||words(t.type);return <button key={t.id||t.reference} onClick={()=>setSelected(t)} className="w-full rounded-3xl border bg-white p-4 text-left shadow-sm transition active:scale-[.995]"><div className="flex items-start gap-3"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${isFailed?'bg-rose-50 text-rose-700':'bg-emerald-50 text-emerald-700'}`}>{isFailed?<CircleX size={20}/>:<CheckCircle2 size={20}/>}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-black text-slate-950">{title}</h2><p className="mt-1 truncate font-mono text-[10px] text-slate-400">{t.reference||t.id}</p></div><div className="shrink-0 text-right"><p className={`font-black ${isFailed?'text-rose-700':'text-blue-950'}`}>{money(t.amount,c)}</p><p className={`mt-1 text-[9px] font-black uppercase ${isFailed?'text-rose-500':'text-emerald-600'}`}>{isFailed?'Échouée':'Réussie'}</p></div></div><div className="mt-3 flex items-end justify-between gap-3"><div><p className="text-[10px] text-slate-400">{t.createdAt?new Date(Number(t.createdAt)).toLocaleString('fr-FR'):'—'}</p>{after!==null&&<p className="mt-1 text-[10px] font-bold text-slate-500">Solde après : {money(after,c)}</p>}</div><ChevronRight size={17} className="shrink-0 text-slate-300"/></div></div></div></button>})}</section>
    </>}

    <SecurityConfirmModal open={secure.open} busy={secure.busy} onClose={secure.close} onConfirm={secure.confirm} title="Afficher mes transactions" subtitle="Entrez votre code secret d'application pour consulter les opérations Market-Cash."/>
    {secure.revealed&&selected&&<TransactionDetailsModal transaction={selected} onClose={()=>setSelected(null)}/>} 
  </div>;
}
