import React,{useEffect,useState}from'react';
import{Link}from'react-router-dom';
import{ArrowDownLeft,ArrowUpRight,Banknote,CreditCard,Eye,EyeOff,History,QrCode,Send,ShieldCheck,Store,WalletCards}from'lucide-react';
import toast from'react-hot-toast';
import{useAuthStore}from'../../store/authStore';
import SecurityConfirmModal from'../../components/SecurityConfirmModal';
import{agentWalletService,WalletServerSnapshot}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

const money=(v:number,c:WalletCurrency)=>c==='CDF'?`${Number(v||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(v||0).toFixed(2)} USD`;

export default function ClientHome(){
  const{user}=useAuthStore();
  const[currency,setCurrency]=useState<WalletCurrency>(()=>(localStorage.getItem('marketcash_wallet_currency')as WalletCurrency)||'USD');
  const[server,setServer]=useState<WalletServerSnapshot|null>(null);
  const[marketCashId,setMarketCashId]=useState('');
  const[revealed,setRevealed]=useState(false);
  const[securityOpen,setSecurityOpen]=useState(false);
  const[securityBusy,setSecurityBusy]=useState(false);
  const first=user?.displayName?.trim().split(' ')[0]||'Client';

  useEffect(()=>{if(!user?.uid)return;agentWalletService.ensureWalletProfile().then(setServer).catch(()=>{});agentWalletService.ensureLocalCard().catch(error=>console.warn('[LOCAL_CARD_PROVISION_WARNING]',error));agentWalletService.getMyMarketCashIdentity().then(x=>setMarketCashId(x.marketCashId)).catch(()=>{})},[user?.uid]);
  const changeCurrency=(c:WalletCurrency)=>{setCurrency(c);setRevealed(false);localStorage.setItem('marketcash_wallet_currency',c)};
  const available=Number(server?.wallets?.[currency]?.availableBalance||0);
  const confirmReveal=async(pin:string)=>{setSecurityBusy(true);try{await agentWalletService.verifyApplicationSecret(pin);setRevealed(true);setSecurityOpen(false)}catch(error:any){toast.error(error?.message||'Code secret incorrect.')}finally{setSecurityBusy(false)}};
  const actions=[{n:'Envoyer',s:'Vers Market-Cash',i:Send,to:'/client/wallet/send'},{n:'Dépôt',s:'Mobile Money / banque',i:ArrowDownLeft,to:'/client/wallet/top-up'},{n:'Retrait',s:'Depuis carte locale chez Agent',i:Banknote,to:'/client/wallet/withdraw'},{n:'Payer',s:'Avec carte locale',i:Store,to:'/client/wallet/pay'},{n:'Recevoir',s:'Mon ID / QR',i:QrCode,to:'/client/wallet/receive'},{n:'Recharger carte',s:'Wallet → carte au choix',i:CreditCard,to:'/client/cards',extra:'action=topup'},{n:'Transactions',s:'Toutes les opérations',i:History,to:'/client/wallet/transactions'}];

  return <div className="mx-auto max-w-5xl space-y-5 p-4 pb-28 md:p-8">
    <header><p className="text-sm font-semibold text-slate-500">Bonjour, {first}</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">Bienvenue sur Market-Cash</h1><p className="mt-1 text-sm text-slate-500">Votre portefeuille principal en dollars et francs congolais.</p></header>
    <section className="rounded-[2rem] bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 p-6 text-white shadow-lg"><div className="flex justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-200">Solde portefeuille principal</p><p className="mt-2 text-4xl font-black">{revealed?money(available,currency):'••••••'}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-blue-200"><ShieldCheck size={14}/>Compte Market-Cash sécurisé</p></div><div className="flex items-start gap-2"><button onClick={()=>revealed?setRevealed(false):setSecurityOpen(true)} className="grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10" aria-label={revealed?'Masquer':'Afficher'}>{revealed?<EyeOff size={20}/>:<Eye size={20}/>}</button><WalletCards className="text-amber-400" size={32}/></div></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="inline-flex rounded-2xl bg-white/10 p-1"><button onClick={()=>changeCurrency('USD')} className={`rounded-xl px-5 py-2 text-sm font-black ${currency==='USD'?'bg-white text-blue-950':'text-blue-100'}`}>USD</button><button onClick={()=>changeCurrency('CDF')} className={`rounded-xl px-5 py-2 text-sm font-black ${currency==='CDF'?'bg-white text-blue-950':'text-blue-100'}`}>CDF</button></div>{marketCashId&&<span className="rounded-xl bg-white/10 px-3 py-2 font-mono text-xs font-bold text-blue-100">ID {revealed?marketCashId:'MCW-••••••••••'}</span>}</div></section>
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">{actions.map(x=><Link key={x.n} to={`${x.to}?${x.extra?`${x.extra}&`:''}currency=${currency}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[.98]"><x.i className="text-blue-800" size={22}/><span className="mt-3 block text-sm font-black text-slate-800">{x.n}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{x.s}</span></Link>)}</section>
    <section className="grid gap-3 md:grid-cols-2"><Link to={`/client/wallet?currency=${currency}`} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><WalletCards className="text-blue-800"/><h2 className="mt-3 font-black text-slate-950">Portefeuille principal {currency}</h2><p className="mt-1 text-sm text-slate-500">Il reçoit les dépôts et alimente les cartes Market-Cash.</p></Link><Link to="/client/cards" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><CreditCard className="text-blue-800"/><h2 className="mt-3 font-black text-slate-950">Mes cartes</h2><p className="mt-1 text-sm text-slate-500">Carte locale, Visa Standard et Visa Gold sont gérées dans le module Cartes.</p></Link></section>
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100"><ArrowUpRight className="text-slate-700"/></div><div><h2 className="font-black text-slate-950">Flux des fonds</h2><p className="text-sm text-slate-500">Dépôt externe → portefeuille principal → carte choisie. Le Wallet reste la source d’alimentation des cartes.</p></div></div></section>
    <SecurityConfirmModal open={securityOpen} busy={securityBusy} onClose={()=>!securityBusy&&setSecurityOpen(false)} onConfirm={confirmReveal} title="Afficher mon solde" subtitle="Entrez le code secret de l’application pour afficher le solde et votre identifiant Market-Cash."/>
  </div>;
}
