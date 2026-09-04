import React,{useEffect,useState}from'react';
import{Link}from'react-router-dom';
import{ArrowDownLeft,ArrowUpRight,Banknote,CreditCard,History,QrCode,Send,ShieldCheck,Store,WalletCards}from'lucide-react';
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
    agentWalletService.ensureLocalCard().catch(error=>console.warn('[LOCAL_CARD_PROVISION_WARNING]',error));
    agentWalletService.getMyMarketCashIdentity().then(x=>setMarketCashId(x.marketCashId)).catch(()=>{});
  },[user?.uid]);

  const changeCurrency=(c:WalletCurrency)=>{setCurrency(c);localStorage.setItem('marketcash_wallet_currency',c)};
  const available=Number(server?.wallets?.[currency]?.availableBalance||0);
  const actions=[
    {n:'Envoyer',s:'Vers Market-Cash',i:Send,to:'/client/wallet/send'},
    {n:'Dépôt',s:'Mobile Money / banque',i:ArrowDownLeft,to:'/client/wallet/top-up'},
    {n:'Retrait',s:'Depuis carte locale chez Agent',i:Banknote,to:'/client/wallet/withdraw'},
    {n:'Payer',s:'Avec carte locale',i:Store,to:'/client/wallet/pay'},
    {n:'Recevoir',s:'Mon ID / QR',i:QrCode,to:'/client/wallet/receive'},
    {n:'Recharger carte',s:'Wallet → carte locale',i:CreditCard,to:'/client/wallet/card-topup'},
    {n:'Historique',s:'Toutes les opérations',i:History,to:'/client/wallet/transactions'},
  ];

  return <div className="mx-auto max-w-5xl space-y-5 p-4 pb-28 md:p-8">
    <header><p className="text-sm font-semibold text-slate-500">Bonjour, {first}</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">Bienvenue sur Market-Cash</h1><p className="mt-1 text-sm text-slate-500">Votre portefeuille principal en dollars et francs congolais.</p></header>
    <section className="rounded-3xl bg-blue-950 p-6 text-white shadow-lg">
      <div className="flex justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-200">Solde portefeuille principal</p><p className="mt-2 text-4xl font-black">{money(available,currency)}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-blue-200"><ShieldCheck size={14}/> Compte Market-Cash sécurisé</p></div><WalletCards className="text-amber-400" size={32}/></div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="inline-flex rounded-2xl bg-white/10 p-1"><button onClick={()=>changeCurrency('USD')} className={`rounded-xl px-5 py-2 text-sm font-black ${currency==='USD'?'bg-white text-blue-950':'text-blue-100'}`}>USD</button><button onClick={()=>changeCurrency('CDF')} className={`rounded-xl px-5 py-2 text-sm font-black ${currency==='CDF'?'bg-white text-blue-950':'text-blue-100'}`}>CDF</button></div>{marketCashId&&<span className="rounded-xl bg-white/10 px-3 py-2 font-mono text-xs font-bold text-blue-100">ID {marketCashId}</span>}</div>
    </section>
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">{actions.map(x=><Link key={x.n} to={`${x.to}?currency=${currency}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[.98]"><x.i className="text-blue-800" size={22}/><span className="mt-3 block text-sm font-black text-slate-800">{x.n}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{x.s}</span></Link>)}</section>
    <section className="grid gap-3 md:grid-cols-2"><Link to={`/client/wallet?currency=${currency}`} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><WalletCards className="text-blue-800"/><h2 className="mt-3 font-black text-slate-950">Portefeuille principal {currency}</h2><p className="mt-1 text-sm text-slate-500">Il reçoit les dépôts et permet les transferts internes Market-Cash. Pour dépenser, rechargez d’abord votre carte locale.</p></Link><Link to="/client/cards" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><CreditCard className="text-blue-800"/><h2 className="mt-3 font-black text-slate-950">Mes cartes</h2><p className="mt-1 text-sm text-slate-500">Une carte locale Market-Cash pour paiements et retraits, plus un espace Visa séparé disponible uniquement sur demande d’achat.</p></Link></section>
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100"><ArrowUpRight className="text-slate-700"/></div><div><h2 className="font-black text-slate-950">Flux des fonds</h2><p className="text-sm text-slate-500">Dépôt externe → portefeuille principal → recharge carte locale → paiement marchand ou retrait chez un Agent. La Visa reste séparée des opérations locales.</p></div></div></section>
  </div>
}
