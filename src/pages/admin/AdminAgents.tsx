import React,{useEffect,useMemo,useState}from'react';
import{collection,getDocs,orderBy,query}from'firebase/firestore';
import{Search,ShieldCheck,WalletCards}from'lucide-react';
import toast from'react-hot-toast';
import{db}from'../../firebase/config';
import{User}from'../../types';
import{WalletCurrency}from'../../types/wallet';
import{agentWalletService}from'../../services/agentWalletService';

export default function AdminAgents(){
  const[users,setUsers]=useState<User[]>([]);
  const[q,setQ]=useState('');
  const[selected,setSelected]=useState<User|null>(null);
  const[currency,setCurrency]=useState<WalletCurrency>('CDF');
  const[amount,setAmount]=useState('');
  const[reason,setReason]=useState('Dépôt cash reçu par la direction');
  const[loading,setLoading]=useState(false);

  useEffect(()=>{getDocs(query(collection(db,'users'),orderBy('createdAt','desc'))).then(s=>setUsers(s.docs.map(d=>({...d.data(),uid:d.id}as User)))).catch(()=>toast.error('Impossible de charger les agents.'));},[]);

  const filtered=useMemo(()=>{
    const agents=users.filter(u=>u.role==='agent');
    const x=q.trim().toLowerCase();
    if(!x)return agents.slice(0,30);
    return agents.filter(u=>[u.displayName,u.email,u.phone,u.uid].some(v=>String(v||'').toLowerCase().includes(x))).slice(0,30);
  },[users,q]);

  const fund=async()=>{
    if(!selected)return;
    const n=Number(amount);
    if(!Number.isFinite(n)||n<=0)return toast.error('Montant invalide');
    if(reason.trim().length<5)return toast.error('Motif obligatoire.');
    setLoading(true);
    try{await agentWalletService.fundAgent({agentUid:selected.uid,currency,amount:n,reason:reason.trim()});toast.success(`Float agent crédité de ${n} ${currency}.`);setAmount('');}
    catch(e:any){toast.error(e?.message||'Crédit agent impossible.');}
    finally{setLoading(false)}
  };

  return <div className="mx-auto max-w-5xl space-y-4">
    <header><p className="text-xs font-black uppercase tracking-wider text-amber-600">Réseau Market-Cash</p><h1 className="text-2xl font-black text-blue-950">Agents & Float</h1><p className="mt-1 text-sm text-slate-500">Seuls les comptes Agent déjà approuvés dans « KYC & comptes professionnels » apparaissent ici. Cette page sert ensuite à gérer leur float.</p></header>

    <section className="rounded-3xl border bg-white p-4 shadow-sm"><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Rechercher un agent approuvé" className="w-full rounded-2xl border p-3 pl-10 outline-none focus:border-blue-500"/></div><div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{filtered.length===0?<div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Aucun Agent point de vente approuvé pour le moment.</div>:filtered.map(u=><button key={u.uid} onClick={()=>setSelected(u)} className={`flex w-full items-center justify-between gap-3 rounded-2xl p-3 text-left ${selected?.uid===u.uid?'border border-blue-200 bg-blue-50':'bg-slate-50'}`}><div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{u.displayName||'Agent Market-Cash'}</p><p className="truncate text-xs text-slate-500">{u.email||u.phone}</p><p className="mt-1 text-[10px] font-bold text-emerald-600">Agent approuvé</p></div><span className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-900">Gérer</span></button>)}</div></section>

    {selected&&<section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><WalletCards/></div><div><h2 className="font-black text-slate-950">Float de {selected.displayName}</h2><p className="text-xs text-slate-500">Créditez uniquement après réception réelle du cash par Market-Cash.</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={()=>setCurrency('CDF')} className={`rounded-xl py-2.5 font-black ${currency==='CDF'?'bg-blue-950 text-white':'bg-slate-100'}`}>CDF</button><button onClick={()=>setCurrency('USD')} className={`rounded-xl py-2.5 font-black ${currency==='USD'?'bg-blue-950 text-white':'bg-slate-100'}`}>USD</button></div><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="Montant du float" className="mt-3 w-full rounded-2xl border p-4 font-black"/><textarea value={reason} onChange={e=>setReason(e.target.value)} className="mt-3 w-full rounded-2xl border p-4 text-sm" rows={3}/><div className="mt-3 flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><ShieldCheck size={16} className="shrink-0"/>Cette opération est auditée et représente le cash déjà remis à la direction par l’agent.</div><button disabled={loading} onClick={fund} className="mt-3 w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-40">{loading?'Traitement…':'Créditer le float agent'}</button></section>}
  </div>;
}
