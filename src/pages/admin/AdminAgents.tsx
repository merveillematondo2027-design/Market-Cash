import React,{useEffect,useMemo,useState}from'react';
import{collection,getDocs,orderBy,query}from'firebase/firestore';
import{Activity,KeyRound,MapPin,RefreshCw,Search,ShieldCheck,UserRound,WalletCards}from'lucide-react';
import toast from'react-hot-toast';
import{db}from'../../firebase/config';
import{User}from'../../types';
import{WalletCurrency}from'../../types/wallet';
import{agentAdminService,AgentAdminDetails}from'../../services/agentAdminService';
import{adminUserService}from'../../services/adminUserService';

const money=(value:number,currency:WalletCurrency)=>currency==='CDF'?`${Number(value||0).toLocaleString('fr-FR')} CDF`:`${Number(value||0).toFixed(2)} USD`;
const date=(value?:number)=>value?new Date(value).toLocaleString('fr-FR'):'—';

export default function AdminAgents(){
  const[users,setUsers]=useState<User[]>([]);
  const[q,setQ]=useState('');
  const[selected,setSelected]=useState<User|null>(null);
  const[details,setDetails]=useState<AgentAdminDetails|null>(null);
  const[currency,setCurrency]=useState<WalletCurrency>('CDF');
  const[amount,setAmount]=useState('');
  const[reason,setReason]=useState('Dépôt cash reçu par la direction');
  const[loading,setLoading]=useState(false);
  const[detailsLoading,setDetailsLoading]=useState(false);
  const[resettingPin,setResettingPin]=useState(false);

  const loadUsers=async()=>{
    try{const s=await getDocs(query(collection(db,'users'),orderBy('createdAt','desc')));setUsers(s.docs.map(d=>({...d.data(),uid:d.id}as User)))}
    catch{toast.error('Impossible de charger les agents.')}
  };
  useEffect(()=>{void loadUsers()},[]);

  const filtered=useMemo(()=>{
    const agents=users.filter(u=>u.role==='agent');const x=q.trim().toLowerCase();
    return(x?agents.filter(u=>[u.displayName,u.email,u.phone,u.uid].some(v=>String(v||'').toLowerCase().includes(x))):agents).slice(0,50);
  },[users,q]);

  const loadDetails=async(uid:string)=>{setDetailsLoading(true);try{setDetails(await agentAdminService.getDetails(uid))}catch(e:any){setDetails(null);toast.error(e?.message||'Détails agent indisponibles.')}finally{setDetailsLoading(false)}};
  const choose=(u:User)=>{setSelected(u);setAmount('');void loadDetails(u.uid)};

  const fund=async()=>{
    if(!selected)return;const n=Number(String(amount).replace(',','.'));
    if(!Number.isFinite(n)||n<=0)return toast.error('Montant invalide.');
    if(reason.trim().length<5)return toast.error('Motif obligatoire.');
    setLoading(true);
    try{const result=await agentAdminService.fund({agentUid:selected.uid,currency,amount:n,reason:reason.trim()});setDetails(current=>current?{...current,wallets:result.wallets}:current);setAmount('');toast.success(`${money(n,currency)} crédités et vérifiés.`);await loadDetails(selected.uid)}
    catch(e:any){toast.error(e?.message||'Crédit du float impossible.')}finally{setLoading(false)}
  };

  const resetPin=async()=>{
    if(!selected||!window.confirm('Réinitialiser le code agent ? Le code temporaire deviendra 1234 et devra être changé avant accès au terminal.'))return;
    setResettingPin(true);
    try{await adminUserService.resetPin(selected.uid);toast.success('Code temporaire 1234 activé.');await loadDetails(selected.uid)}
    catch(e:any){toast.error(e?.message||'Réinitialisation impossible.')}finally{setResettingPin(false)}
  };

  return <div className="mx-auto max-w-6xl space-y-4 pb-20">
    <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-amber-600">Réseau</p><h1 className="text-2xl font-black text-blue-950">Agents</h1></div><button onClick={()=>{void loadUsers();if(selected)void loadDetails(selected.uid)}} className="grid h-11 w-11 place-items-center rounded-2xl border bg-white text-blue-950 shadow-sm"><RefreshCw size={18}/></button></div>

    <section className="rounded-3xl border bg-white p-4 shadow-sm"><div className="relative"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Nom, téléphone ou e-mail" className="w-full rounded-2xl border bg-slate-50 p-3.5 pl-11 outline-none focus:border-blue-500"/></div><div className="mt-3 grid gap-2 md:grid-cols-2">{filtered.length===0?<div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Aucun agent actif.</div>:filtered.map(u=><button key={u.uid} onClick={()=>choose(u)} className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition ${selected?.uid===u.uid?'border-blue-300 bg-blue-50':'border-slate-100 bg-white hover:bg-slate-50'}`}><div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><UserRound size={19}/></div><div className="min-w-0"><p className="truncate text-sm font-black text-slate-950">{u.displayName||'Agent Market-Cash'}</p><p className="truncate text-xs text-slate-500">{u.phone||u.email}</p></div></div><span className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-black text-blue-950">Gérer</span></button>)}</div></section>

    {selected&&<>{detailsLoading&&!details?<div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-500">Chargement du compte agent…</div>:details&&<div className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
      <div className="space-y-4">
        <section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black text-slate-950">{details.agent.displayName}</h2><p className="mt-1 text-sm text-slate-500">{details.agent.pointName||'Point de vente Market-Cash'}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${details.agent.accountStatus==='active'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-700'}`}>{details.agent.accountStatus}</span></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2"><Info label="Téléphone" value={details.agent.phone||'—'}/><Info label="E-mail" value={details.agent.email||'—'}/><Info label="ID Market-Cash" value={details.agent.marketCashId||'—'} mono/><Info label="Numéro interne" value={details.agent.rechargeNumber||'—'} mono/><Info label="KYC" value={details.agent.kycStatus}/><Info label="PIN" value={details.agent.mustChangePin?'Changement obligatoire':'Configuré'}/><Info label="Activité" value={details.agent.activity||'—'}/><Info label="Approbation" value={date(details.agent.approvedAt)}/></div>
          {(details.agent.city||details.agent.address)&&<div className="mt-3 flex gap-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600"><MapPin size={15} className="shrink-0"/>{[details.agent.address,details.agent.city].filter(Boolean).join(' · ')}</div>}
          <button disabled={resettingPin} onClick={resetPin} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 disabled:opacity-40"><KeyRound size={14}/>{resettingPin?'Traitement…':'Réinitialiser PIN → 1234'}</button>
        </section>

        <section className="grid grid-cols-2 gap-3"><Balance title="Float CDF" value={money(details.wallets.CDF?.availableBalance||0,'CDF')} status={details.wallets.CDF?.status}/><Balance title="Float USD" value={money(details.wallets.USD?.availableBalance||0,'USD')} status={details.wallets.USD?.status}/></section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Activity size={18} className="text-blue-900"/><h3 className="font-black text-slate-950">Activité récente</h3></div><div className="mt-3 space-y-2">{details.transactions.length===0?<div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Aucune transaction agent.</div>:details.transactions.slice(0,8).map((t:any)=><div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{transactionLabel(t.type)}</p><p className="mt-1 text-[10px] text-slate-400">{date(Number(t.createdAt||0))} · {t.reference||t.id}</p></div><p className="shrink-0 text-sm font-black text-blue-950">{money(Number(t.amount||0),(t.currency||'CDF')as WalletCurrency)}</p></div>)}</div></section>
      </div>

      <section className="h-fit rounded-3xl border bg-white p-5 shadow-sm xl:sticky xl:top-5"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><WalletCards/></div><div><h2 className="font-black text-slate-950">Créditer le float</h2><p className="text-xs text-slate-500">Solde vérifié après chaque opération.</p></div></div><div className="mt-5 grid grid-cols-2 gap-2"><button onClick={()=>setCurrency('CDF')} className={`rounded-2xl py-3 font-black ${currency==='CDF'?'bg-blue-950 text-white':'bg-slate-100 text-slate-700'}`}>CDF</button><button onClick={()=>setCurrency('USD')} className={`rounded-2xl py-3 font-black ${currency==='USD'?'bg-blue-950 text-white':'bg-slate-100 text-slate-700'}`}>USD</button></div><label className="mt-4 block"><span className="text-xs font-black text-slate-500">Montant</span><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={currency==='CDF'?'50 000':'100'} className="mt-1 w-full rounded-2xl border p-4 text-xl font-black outline-none focus:border-blue-500"/></label><label className="mt-3 block"><span className="text-xs font-black text-slate-500">Motif</span><textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} className="mt-1 w-full rounded-2xl border p-3 text-sm outline-none focus:border-blue-500"/></label><div className="mt-3 flex gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900"><ShieldCheck size={16} className="shrink-0"/>Opération financière auditée.</div><button disabled={loading} onClick={fund} className="mt-4 w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-40">{loading?'Vérification…':'Créditer le float'}</button></section>
    </div>}</>}
  </div>;
}

function Info({label,value,mono=false}:{label:string;value:string;mono?:boolean}){return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-1 break-words text-sm font-black text-slate-800 ${mono?'font-mono':''}`}>{value}</p></div>}
function Balance({title,value,status}:{title:string;value:string;status?:string}){return <div className="rounded-3xl bg-blue-950 p-5 text-white shadow-sm"><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-wider text-blue-200">{title}</p><WalletCards size={17} className="text-amber-400"/></div><p className="mt-3 text-xl font-black">{value}</p><p className="mt-2 text-[10px] text-blue-200">{status||'active'}</p></div>}
function transactionLabel(type:string){const map:Record<string,string>={agent_float_funding:'Crédit float',cash_in:'Dépôt client',cash_out:'Retrait client',agent_card_cash_out:'Retrait carte locale'};return map[String(type||'')]||String(type||'Transaction').replaceAll('_',' ')}
