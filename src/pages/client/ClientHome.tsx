import React,{useEffect,useState}from'react';
import{Link}from'react-router-dom';
import{ArrowDownLeft,ArrowUpRight,CreditCard,History,QrCode,Send,ShieldCheck,WalletCards}from'lucide-react';
import{useAuthStore}from'../../store/authStore';
import{agentWalletService,WalletServerSnapshot}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

const money=(v:number,c:WalletCurrency)=>c==='CDF'?`${v.toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${v.toFixed(2)} USD`;

export default function ClientHome(){
  const{user}=useAuthStore();
  const[currency,setCurrency]=useState<WalletCurrency>(()=>(localStorage.getItem('marketcash_wallet_currency')as WalletCurrency)||'USD');
  const[server,setServer]=useState<WalletServerSnapshot|null>(null);
  const[marketCashId,setMarketCashId]=useState('');
  const first=user?.displayName?.trim().split(' ')[0]||'Client';

  useEffect(()=>{
    if(!user?.uid)return;
    agentWalletService.ensureWalletProfile().then(setServer).catch(()=>{});
    agentWalletService.getMyMarketCashIdentity().then(x=>setMarketCashId(x.marketCashId)).catch(()=>{});
  },[user?.uid]);

  const changeCurrency=(c:WalletCurrency)=>{setCurrency(c);localStorage.setItem('marketcash_wallet_currency',c)};
  const available=Number(server?.wallets?.[currency]?.availableBalance||0);
  const actions=[
    {n:'Envoyer',s:'Vers Market-Cash',i:Send,to:'/client/wallet/send'},
    {n:'Dépôt',s:'Mobile Money / banque',i:ArrowDownLeft,to:'/client/wallet/top-up'},
    {n:'Recharger carte',s:'Depuis le portefeuille',i:CreditCard,to:'/client/wallet/card-topup'},
    {n:'Recevoir',s:'Mon ID / QR',i:QrCode,to:'/client/wallet/receive'},
    {n:'Historique',s:'Toutes les opérations',i:History,to:'/client/wallet/transactions'},
  ];

  return <div className="mx-auto max-w-5xl p-4 md:p-8 pb-28 space-y-5">
    <header><p className="text-sm font-semibold text-slate-500">Bonjour, {first}</p><h1 className="mt-1 text-2xl md:text-3xl font-black tracking-tight text-slate-950">Bienvenue sur Market-Cash</h1><p className="mt-1 text-sm text-slate-500">Votre portefeuille principal en dollars et francs congolais.</p></header>
    <section className="rounded-3xl bg-blue-950 p-6 text-white shadow-lg">
      <div className="flex justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-200">Solde disponible</p><p className="mt-2 text-4xl font-black">{money(available,currency)}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-blue-200"><ShieldCheck size={14}/> Compte Market-Cash sécurisé</p></div><WalletCards className="text-amber-400" size={32}/></div>
      <div className="mt-5 flex items-center justify-between gap-3 flex-wrap"><div className="inline-flex rounded-2xl bg-white/10 p-1"><button onClick={()=>changeCurrency('USD')} className={`px-5 py-2 rounded-xl text-sm font-black ${currency==='USD'?'bg-white text-blue-950':'text-blue-100'}`}>USD</button><button onClick={()=>changeCurrency('CDF')} className={`px-5 py-2 rounded-xl text-sm font-black ${currency==='CDF'?'bg-white text-blue-950':'text-blue-100'}`}>CDF</button></div>{marketCashId&&<span className="rounded-xl bg-white/10 px-3 py-2 font-mono text-xs font-bold text-blue-100">ID {marketCashId}</span>}</div>
    </section>
    <section className="grid grid-cols-2 md:grid-cols-5 gap-3">{actions.map(x=><Link key={x.n} to={`${x.to}?currency=${currency}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[.98]"><x.i className="text-blue-800" size={22}/><span className="mt-3 block text-sm font-black text-slate-800">{x.n}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{x.s}</span></Link>)}</section>
    <section className="grid gap-3 md:grid-cols-2"><Link to={`/client/wallet?currency=${currency}`} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><WalletCards className="text-blue-800"/><h2 className="mt-3 font-black text-slate-950">Portefeuille principal {currency}</h2><p className="mt-1 text-sm text-slate-500">Il reçoit les dépôts et peut uniquement transférer vers un autre portefeuille Market-Cash ou alimenter vos cartes internes.</p></Link><Link to="/client/cards" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><CreditCard className="text-blue-800"/><h2 className="mt-3 font-black text-slate-950">Mes cartes</h2><p className="mt-1 text-sm text-slate-500">Les cartes internes sont alimentées uniquement depuis votre portefeuille principal. La Visa virtuelle reste séparée.</p></Link></section>
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100"><ArrowUpRight className="text-slate-700"/></div><div><h2 className="font-black text-slate-950">Dépôts externes sécurisés</h2><p className="text-sm text-slate-500">Mobile Money et banque seront orchestrés par le backend Market-Cash, avec MHT APIs comme moteur prioritaire vers les partenaires. Aucun appel partenaire sensible ne sera exécuté directement dans le navigateur.</p></div></div></section>
  </div>
}
