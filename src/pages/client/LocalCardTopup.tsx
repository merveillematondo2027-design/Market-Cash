import React,{useEffect,useMemo,useState}from'react';
import{ArrowLeft,CheckCircle2,CreditCard,ShieldCheck}from'lucide-react';
import{Link,useSearchParams}from'react-router-dom';
import toast from'react-hot-toast';
import{agentWalletService,InternalCardSummary,WalletServerSnapshot}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

const money=(value:number,currency:WalletCurrency)=>currency==='CDF'?`${Number(value||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(value||0).toFixed(2)} USD`;
const key=()=>`localtopup_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;

export default function LocalCardTopup(){
  const[params]=useSearchParams();
  const[currency,setCurrency]=useState<WalletCurrency>(params.get('currency')==='CDF'?'CDF':'USD');
  const[wallet,setWallet]=useState<WalletServerSnapshot|null>(null);
  const[card,setCard]=useState<InternalCardSummary|null>(null);
  const[amount,setAmount]=useState('');
  const[pin,setPin]=useState('');
  const[busy,setBusy]=useState(false);
  const[done,setDone]=useState(false);
  const[reference,setReference]=useState('');

  const refresh=async()=>{
    await agentWalletService.ensureLocalCard();
    const[w,cards]=await Promise.all([agentWalletService.getMyWallets(),agentWalletService.getMyInternalCards()]);
    setWallet(w);setCard(cards[0]||null);
  };
  useEffect(()=>{refresh().catch(e=>toast.error(e?.message||'Impossible de charger la carte.'))},[]);

  const value=useMemo(()=>Number(String(amount).replace(',','.')),[amount]);
  const walletBalance=Number(wallet?.wallets?.[currency]?.availableBalance||0);
  const valid=!!card&&Number.isFinite(value)&&value>0&&value<=walletBalance&&pin.length>=4;

  const submit=async()=>{
    if(!valid||!card)return;
    setBusy(true);
    try{
      const result=await agentWalletService.fundInternalCard({cardId:card.cardId,currency,amount:value,pin,idempotencyKey:key()});
      setReference(result.reference);setDone(true);setAmount('');setPin('');await refresh();
      toast.success('Carte locale rechargée.');
    }catch(error:any){toast.error(error?.message||'Recharge refusée.')}finally{setBusy(false)}
  };

  return <div className="mx-auto max-w-xl p-4 pb-28 md:p-8">
    <Link to="/client/cards/local" className="inline-flex items-center gap-2 text-sm font-black text-slate-500"><ArrowLeft size={17}/>Retour à la carte locale</Link>
    <section className="mt-5 rounded-3xl border bg-white p-5 shadow-sm md:p-6">
      <div className="flex items-start justify-between"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-900"><CreditCard/></div><div className="inline-flex rounded-2xl bg-slate-100 p-1"><button onClick={()=>setCurrency('USD')} className={`rounded-xl px-4 py-2 text-xs font-black ${currency==='USD'?'bg-white text-blue-950 shadow-sm':'text-slate-500'}`}>USD</button><button onClick={()=>setCurrency('CDF')} className={`rounded-xl px-4 py-2 text-xs font-black ${currency==='CDF'?'bg-white text-blue-950 shadow-sm':'text-slate-500'}`}>CDF</button></div></div>
      <h1 className="mt-4 text-2xl font-black text-slate-950">Recharger la carte locale</h1>
      <p className="mt-1 text-sm text-slate-500">Solde portefeuille : <b>{money(walletBalance,currency)}</b></p>
      <div className="mt-5 rounded-2xl bg-blue-50 p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Carte unique du compte</p><p className="mt-1 font-black text-blue-950">{card?.cardHolder||'Carte locale Market-Cash'}</p><p className="mt-1 font-mono text-xs text-slate-500">{card?.cardIdentifier||'MCL-•••••••••••'} • {card?.maskedNumber||'•••• •••• •••• ••••'}</p></div>
      <p className="mt-4 flex items-start gap-2 rounded-2xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800"><ShieldCheck size={16} className="mt-0.5 shrink-0"/>Il n’y a aucune carte à choisir : ce compte possède une seule carte locale. La devise choisie détermine la poche USD ou CDF créditée.</p>

      {!done?<div className="mt-5 space-y-4">
        <div><label className="text-xs font-black uppercase text-slate-500">Montant en {currency}</label><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={`Montant en ${currency}`} className="mt-2 w-full rounded-2xl border p-4 text-lg font-bold"/>{value>walletBalance&&<p className="mt-2 text-xs font-bold text-red-600">Solde portefeuille insuffisant.</p>}</div>
        <div><label className="text-xs font-black uppercase text-slate-500">Code secret Market-Cash</label><input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} type="password" inputMode="numeric" placeholder="••••" className="mt-2 w-full rounded-2xl border p-4 text-center text-lg font-black tracking-[.35em]"/></div>
        <button disabled={!valid||busy} onClick={()=>void submit()} className="w-full rounded-2xl bg-amber-400 py-4 font-black text-blue-950 disabled:bg-slate-300 disabled:text-white">{busy?'Traitement…':'Confirmer la recharge'}</button>
      </div>:<div className="mt-6 rounded-3xl bg-emerald-50 p-6 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={42}/><h2 className="mt-3 text-xl font-black text-emerald-900">Recharge terminée</h2><p className="mt-2 font-mono text-xs text-emerald-700">{reference}</p><button onClick={()=>setDone(false)} className="mt-5 rounded-2xl bg-white px-5 py-3 text-sm font-black text-emerald-800">Faire une autre recharge</button></div>}
    </section>
  </div>;
}
