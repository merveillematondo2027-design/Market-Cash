import React,{useEffect,useState}from'react';
import{Building2,Copy,History,RefreshCw,ShieldCheck,WalletCards}from'lucide-react';
import{Link}from'react-router-dom';
import{QRCodeSVG}from'qrcode.react';
import toast from'react-hot-toast';
import{useAuthStore}from'../../store/authStore';
import{agentWalletService,WalletServerSnapshot}from'../../services/agentWalletService';

const money=(value:number,currency:'USD'|'CDF')=>currency==='CDF'?`${Number(value||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(value||0).toFixed(2)} USD`;

export default function BusinessHome(){
  const{user}=useAuthStore();
  const[wallet,setWallet]=useState<WalletServerSnapshot|null>(null);
  const[marketCashId,setMarketCashId]=useState('');
  const[history,setHistory]=useState<any[]>([]);
  const[loading,setLoading]=useState(true);

  const load=async()=>{
    setLoading(true);
    try{
      const[w,id,h]=await Promise.all([
        agentWalletService.getMyWallets(),
        agentWalletService.getMyMarketCashIdentity(),
        agentWalletService.getMyWalletHistory()
      ]);
      setWallet(w);setMarketCashId(id.marketCashId);setHistory(h.slice(0,12));
    }catch(e){console.error('[BUSINESS_HOME_LOAD_ERROR]',e);toast.error('Impossible de charger le portefeuille Business.');}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[]);

  const copyId=async()=>{
    if(!marketCashId)return;
    try{await navigator.clipboard.writeText(marketCashId);toast.success('ID marchand copié.');}
    catch{toast.error('Copie impossible.');}
  };

  return <main className="min-h-screen bg-slate-50 pb-10">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between p-4"><div><p className="text-xs font-black uppercase text-slate-400">Compte marchand</p><h1 className="text-xl font-black text-blue-950">Market-Cash Business</h1></div><Link to="/business/profile" className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-blue-800">Profil</Link></div></header>

    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <section className="rounded-3xl bg-blue-950 p-6 text-white shadow-lg"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-amber-300">Marchand vérifié</p><h2 className="mt-2 text-2xl font-black">{user?.displayName||'Marchand Market-Cash'}</h2><p className="mt-1 text-sm text-blue-200">Encaissez les clients Market-Cash sur votre portefeuille professionnel.</p></div><Building2 className="shrink-0 text-amber-400" size={30}/></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><Balance label="Solde CDF" value={money(Number(wallet?.wallets?.CDF?.availableBalance||0),'CDF')}/><Balance label="Solde USD" value={money(Number(wallet?.wallets?.USD?.availableBalance||0),'USD')}/></div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
        <section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Encaissement</p><h3 className="mt-1 text-lg font-black text-slate-950">Mon QR marchand</h3></div><WalletCards className="text-blue-800"/></div>
          {loading?<div className="mt-5 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">Chargement…</div>:marketCashId?<div className="mt-5 text-center"><div className="inline-block rounded-3xl border bg-white p-4"><QRCodeSVG value={`MARKET-CASH-PAY:${marketCashId}`} size={190}/></div><p className="mt-4 font-mono text-lg font-black text-blue-950">{marketCashId}</p><button onClick={copyId} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2 text-xs font-black text-blue-900"><Copy size={15}/> Copier l'ID</button><p className="mt-4 text-xs leading-5 text-slate-500">Le client choisit <b>Payer</b>, vérifie votre nom puis confirme avec son PIN Market-Cash.</p></div>:<p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">Identifiant marchand indisponible.</p>}
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Activité</p><h3 className="mt-1 text-lg font-black text-slate-950">Transactions récentes</h3></div><button disabled={loading} onClick={load} className="rounded-xl bg-slate-100 p-2 text-slate-600 disabled:opacity-40"><RefreshCw size={17}/></button></div>
          <div className="mt-4 space-y-2">{history.length===0?<div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500"><History className="mx-auto mb-2 text-slate-400"/>Aucune transaction pour le moment.</div>:history.map((t:any)=>{
            const incoming=String(t.recipientId||'')===user?.uid||String(t.destinationWalletId||'').includes(user?.uid||'');
            return <div key={t.id||t.reference} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><b className="text-sm text-slate-900">{incoming?'Encaissement reçu':t.type==='local_transfer'?'Transfert envoyé':t.type==='wallet_deposit'?'Recharge portefeuille':t.type||'Transaction'}</b><p className="mt-1 font-mono text-[10px] text-slate-400">{t.reference||t.id}</p></div><b className={incoming?'text-emerald-700':'text-blue-950'}>{incoming?'+':''}{money(Number(t.amount||0),t.currency==='CDF'?'CDF':'USD')}</b></div><p className="mt-2 text-[10px] text-slate-400">{t.createdAt?new Date(t.createdAt).toLocaleString('fr-FR'):'—'}</p></div>})}</div>
        </section>
      </div>

      <div className="mt-5 flex gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900"><ShieldCheck className="shrink-0"/><div><b>Compte professionnel séparé des rôles administratifs.</b><p className="mt-1 text-xs leading-5">Les mouvements monétaires sont exécutés côté serveur et enregistrés dans le ledger Market-Cash.</p></div></div>
    </div>
  </main>;
}

function Balance({label,value}:{label:string;value:string}){return <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-blue-200">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>}
