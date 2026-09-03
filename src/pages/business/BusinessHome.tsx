import React,{useEffect,useState}from'react';
import{ArrowRight,Building2,History,RefreshCw,ShieldCheck,WalletCards,QrCode}from'lucide-react';
import{Link}from'react-router-dom';
import toast from'react-hot-toast';
import{useAuthStore}from'../../store/authStore';
import{agentWalletService,WalletServerSnapshot}from'../../services/agentWalletService';

const money=(value:number,currency:'USD'|'CDF')=>currency==='CDF'?`${Number(value||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(value||0).toFixed(2)} USD`;

export default function BusinessHome(){
  const{user}=useAuthStore();
  const[wallet,setWallet]=useState<WalletServerSnapshot|null>(null);
  const[history,setHistory]=useState<any[]>([]);
  const[loading,setLoading]=useState(true);

  const load=async()=>{
    setLoading(true);
    try{
      const[w,h]=await Promise.all([agentWalletService.getMyWallets(),agentWalletService.getMyWalletHistory()]);
      setWallet(w);setHistory(h.slice(0,5));
    }catch(e){console.error('[BUSINESS_HOME_LOAD_ERROR]',e);toast.error('Impossible de charger le compte Business.');}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[]);

  return <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
    <header className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-amber-600">Marchand approuvé</p><h1 className="text-2xl font-black text-blue-950">Bonjour, {user?.displayName||'Marchand Market-Cash'}</h1><p className="mt-1 text-sm text-slate-500">Encaissez les clients et suivez votre activité professionnelle.</p></div><button disabled={loading} onClick={load} className="rounded-2xl bg-white p-3 text-blue-900 shadow-sm disabled:opacity-40"><RefreshCw size={18} className={loading?'animate-spin':''}/></button></header>

    <section className="rounded-3xl bg-blue-950 p-6 text-white shadow-lg"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-amber-300">Portefeuille Business</p><h2 className="mt-2 text-xl font-black">Market-Cash Marchand</h2><p className="mt-1 text-sm text-blue-200">Les paiements clients arrivent directement ici.</p></div><Building2 className="shrink-0 text-amber-400" size={30}/></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Balance label="Solde CDF" value={money(Number(wallet?.wallets?.CDF?.availableBalance||0),'CDF')}/><Balance label="Solde USD" value={money(Number(wallet?.wallets?.USD?.availableBalance||0),'USD')}/></div></section>

    <div className="grid gap-3 sm:grid-cols-2">
      <Link to="/business/collect" className="group rounded-3xl border border-blue-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-800"><QrCode/></div><ArrowRight className="text-slate-300 transition group-hover:translate-x-1"/></div><h2 className="mt-4 font-black text-slate-950">Encaisser un client</h2><p className="mt-1 text-xs leading-5 text-slate-500">Générez un QR ou un lien de paiement avec montant facultatif.</p></Link>
      <Link to="/business/history" className="group rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><History/></div><ArrowRight className="text-slate-300 transition group-hover:translate-x-1"/></div><h2 className="mt-4 font-black text-slate-950">Historique des encaissements</h2><p className="mt-1 text-xs leading-5 text-slate-500">Consultez les références, montants, devises et dates.</p></Link>
    </div>

    <section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Activité récente</p><h3 className="mt-1 text-lg font-black text-slate-950">Derniers mouvements</h3></div><WalletCards className="text-blue-800"/></div><div className="mt-4 space-y-2">{history.length===0?<div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">Aucune transaction pour le moment.</div>:history.map((t:any)=>{const incoming=String(t.recipientId||'')===user?.uid||String(t.destinationWalletId||'').includes(user?.uid||'');return <div key={t.id||t.reference} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><b className="text-sm text-slate-900">{t.type==='merchant_payment'?'Paiement client':incoming?'Crédit reçu':t.type||'Transaction'}</b><p className="mt-1 font-mono text-[10px] text-slate-400">{t.reference||t.id}</p></div><b className={incoming?'text-emerald-700':'text-blue-950'}>{incoming?'+':''}{money(Number(t.amount||0),t.currency==='CDF'?'CDF':'USD')}</b></div><p className="mt-2 text-[10px] text-slate-400">{t.createdAt?new Date(t.createdAt).toLocaleString('fr-FR'):'—'}</p></div>})}</div><Link to="/business/history" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-blue-900">Voir tout <ArrowRight size={16}/></Link></section>

    <section className="flex gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900"><ShieldCheck className="shrink-0"/><div><b>Compte marchand séparé des accès administratifs.</b><p className="mt-1 text-xs leading-5">Le marchand reçoit les paiements, mais ne peut jamais débiter le portefeuille d'un client. Toute opération monétaire est exécutée côté serveur et journalisée.</p></div></section>
  </div>;
}

function Balance({label,value}:{label:string;value:string}){return <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-blue-200">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>}
