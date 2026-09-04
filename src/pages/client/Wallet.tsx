import React,{useEffect,useMemo,useState}from'react';
import{Link,useSearchParams}from'react-router-dom';
import{ArrowDownLeft,ArrowRightLeft,ArrowUpRight,Banknote,CreditCard,Eye,EyeOff,History,Send,ShieldCheck,ShoppingBag,WalletCards}from'lucide-react';
import toast from'react-hot-toast';
import{useAuthStore}from'../../store/authStore';
import{walletService}from'../../services/walletService';
import{agentWalletService,WalletServerSnapshot}from'../../services/agentWalletService';
import SecurityConfirmModal from'../../components/SecurityConfirmModal';
import{WalletCurrency}from'../../types/wallet';
const money=(v:number,c:WalletCurrency)=>c==='CDF'?`${Number(v||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(v||0).toFixed(2)} USD`;

export default function ClientWallet(){
  const{user}=useAuthStore();
  const[params]=useSearchParams();
  const initial=(params.get('currency')==='CDF'?'CDF':(localStorage.getItem('marketcash_wallet_currency')as WalletCurrency)||'USD')as WalletCurrency;
  const[currency,setCurrency]=useState<WalletCurrency>(initial);
  const[server,setServer]=useState<WalletServerSnapshot|null>(null);
  const[loading,setLoading]=useState(false);
  const[revealed,setRevealed]=useState(false);
  const[securityOpen,setSecurityOpen]=useState(false);
  const[securityBusy,setSecurityBusy]=useState(false);
  const preview=useMemo(()=>user?.uid?walletService.getWalletsPreview(user.uid):null,[user?.uid]);
  useEffect(()=>{if(!user?.uid)return;setLoading(true);agentWalletService.getMyWallets().then(setServer).catch(e=>console.warn('[WALLET_SERVER_UNAVAILABLE]',e)).finally(()=>setLoading(false))},[user?.uid]);
  const raw=server?.wallets?.[currency];
  const wallet=raw?{...preview?.[currency],...raw}:preview?.[currency];
  const transactions=walletService.getTransactionsPreview(currency);
  if(!wallet)return <div className="p-5">Portefeuille indisponible.</div>;
  const change=(c:WalletCurrency)=>{setCurrency(c);setRevealed(false);localStorage.setItem('marketcash_wallet_currency',c)};
  const toggleReveal=()=>{if(revealed){setRevealed(false);return}setSecurityOpen(true)};
  const confirmReveal=async(pin:string)=>{setSecurityBusy(true);try{await agentWalletService.verifyApplicationSecret(pin);setRevealed(true);setSecurityOpen(false)}catch(error:any){toast.error(error?.message||'Code secret incorrect.')}finally{setSecurityBusy(false)}};
  const hidden='••••••';

  return <div className="mx-auto max-w-6xl space-y-6 p-4 pb-28 md:p-8">
    <header><p className="text-sm font-semibold text-slate-500">Votre portefeuille général</p><div className="flex items-center justify-between gap-3"><h1 className="mt-1 text-2xl font-black text-slate-950 md:text-3xl">Market-Cash Wallet</h1>{loading&&<span className="text-[10px] font-bold text-slate-400">Mise à jour…</span>}</div><p className="mt-1 text-xs text-slate-500">Votre Wallet conserve le solde principal. Le code secret de l’application protège son affichage ; le CVV Market-Cash confirme les transactions.</p></header>

    <section className="rounded-[2rem] bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 p-6 text-white shadow-lg"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-200">Solde disponible</p><h2 className="mt-2 text-4xl font-black">{revealed?money(Number(wallet.availableBalance||0),currency):hidden}</h2><p className="mt-3 flex items-center gap-2 text-xs font-semibold text-blue-200"><ShieldCheck size={14}/>Wallet {currency} actif</p></div><div className="flex items-center gap-2"><button onClick={toggleReveal} className="grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10" aria-label={revealed?'Masquer les soldes':'Afficher les soldes'}>{revealed?<EyeOff size={20}/>:<Eye size={20}/>}</button><WalletCards size={30} className="text-amber-400"/></div></div>
      <div className="mt-5 inline-flex rounded-2xl bg-white/10 p-1"><button onClick={()=>change('USD')} className={`rounded-xl px-5 py-2 text-sm font-black ${currency==='USD'?'bg-white text-blue-950':'text-blue-100'}`}>USD</button><button onClick={()=>change('CDF')} className={`rounded-xl px-5 py-2 text-sm font-black ${currency==='CDF'?'bg-white text-blue-950':'text-blue-100'}`}>CDF</button></div>
      <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-blue-200">Solde comptable</p><p className="mt-1 font-black">{revealed?money(Number(wallet.ledgerBalance||0),currency):hidden}</p></div><div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-blue-200">Montant réservé</p><p className="mt-1 font-black">{revealed?money(Number(wallet.heldBalance||0),currency):hidden}</p></div></div>
      {server?.rechargeNumber&&<div className="mt-4 rounded-2xl bg-white/10 px-4 py-3"><p className="text-[10px] font-black uppercase text-blue-200">Mon numéro de recharge</p><p className="font-mono text-xl font-black tracking-wider">{revealed?server.rechargeNumber:'•••••••••••'}</p><p className="mt-1 text-[10px] text-blue-200">Les informations du Wallet restent masquées jusqu’à validation du code secret de l’application.</p></div>}
    </section>

    <section className="grid grid-cols-3 gap-2 md:grid-cols-7">{[{n:'Envoyer',i:Send,to:'send'},{n:'Recevoir',i:ArrowDownLeft,to:'receive'},{n:'Payer',i:ShoppingBag,to:'pay'},{n:'Retirer',i:Banknote,to:'withdraw'},{n:'Recharger',i:ArrowUpRight,to:'top-up'},{n:'Convertir',i:ArrowRightLeft,to:'exchange'},{n:'Historique',i:History,to:'transactions'}].map(x=><Link key={x.n} to={`/client/wallet/${x.to}?currency=${currency}`} className="rounded-2xl border border-slate-200 bg-white px-2 py-4 text-center shadow-sm"><x.i className="mx-auto text-blue-800" size={21}/><span className="mt-2 block text-[11px] font-bold text-slate-700">{x.n}</span></Link>)}</section>

    <Link to="/client/cards" className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Moyens de paiement</p><h2 className="mt-1 font-black text-slate-950">Cartes Market-Cash</h2><p className="mt-1 text-xs text-slate-500">Carte locale, Visa Standard et Visa Gold sont gérées dans le module Cartes.</p></div><CreditCard className="shrink-0 text-blue-800"/></Link>
    <section className="rounded-3xl border bg-white shadow-sm"><div className="flex justify-between border-b p-5"><h2 className="font-black">Activité {currency}</h2><span className="text-xs text-slate-400">Ledger serveur</span></div>{transactions.length===0&&<div className="p-8 text-center text-sm text-slate-500">Aucune transaction {currency} pour le moment.</div>}</section>

    <SecurityConfirmModal open={securityOpen} busy={securityBusy} onClose={()=>!securityBusy&&setSecurityOpen(false)} onConfirm={confirmReveal} title="Afficher mon Wallet" subtitle="Entrez le code secret de l’application pour afficher les soldes et les informations du portefeuille. Les transactions restent confirmées séparément par CVV."/>
  </div>;
}
