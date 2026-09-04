import React,{useEffect,useMemo,useState}from'react';
import{ArrowLeft,CheckCircle2,CreditCard,WalletCards}from'lucide-react';
import{Link,useSearchParams}from'react-router-dom';
import toast from'react-hot-toast';
import{agentWalletService,InternalCardSummary,WalletServerSnapshot}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

const money=(value:number,currency:WalletCurrency)=>currency==='CDF'?`${Number(value||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(value||0).toFixed(2)} USD`;
const makeKey=()=>`local_topup_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;

export default function LocalCardTopup(){
  const[params]=useSearchParams();
  const[currency,setCurrency]=useState<WalletCurrency>(params.get('currency')==='CDF'?'CDF':'USD');
  const[server,setServer]=useState<WalletServerSnapshot|null>(null);
  const[card,setCard]=useState<InternalCardSummary|null>(null);
  const[amount,setAmount]=useState('');
  const[cvv,setCvv]=useState('');
  const[busy,setBusy]=useState(false);
  const[loading,setLoading]=useState(true);
  const[done,setDone]=useState(false);
  const[reference,setReference]=useState('');

  const load=async()=>{
    const[wallet,cards]=await Promise.all([agentWalletService.getMyWallets(),agentWalletService.getMyInternalCards()]);
    setServer(wallet);setCard(cards[0]||null);
  };
  useEffect(()=>{load().catch(()=>toast.error('Impossible de charger la carte locale.')).finally(()=>setLoading(false))},[]);

  const walletBalance=Number(server?.wallets?.[currency]?.availableBalance||0);
  const cardBalance=Number(card?.balances?.[currency]||0);
  const numericAmount=useMemo(()=>Number(String(amount).replace(',','.')),[amount]);
  const validAmount=Number.isFinite(numericAmount)&&numericAmount>0&&numericAmount<=walletBalance;

  const submit=async()=>{
    if(!card||!validAmount||cvv.length!==3)return;
    setBusy(true);
    try{
      const result=await agentWalletService.fundInternalCard({cardId:card.cardId,currency,amount:numericAmount,cvv,idempotencyKey:makeKey()});
      setReference(result.reference);setDone(true);setAmount('');setCvv('');await load();toast.success('Carte locale rechargée.');
    }catch(error:any){toast.error(error?.message||'Recharge refusée. Vérifiez votre CVV.')}finally{setBusy(false)}
  };

  return <div className="mx-auto max-w-xl p-4 pb-28 md:p-8">
    <Link to="/client/cards?card=local" className="inline-flex items-center gap-2 text-sm font-black text-slate-500"><ArrowLeft size={17}/>Ma carte locale</Link>
    <section className="mt-5 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-blue-950 to-blue-800 p-6 text-white"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-200">Market-Cash Locale</p><h1 className="mt-2 text-2xl font-black">Recharger ma carte</h1></div><div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10"><WalletCards size={24}/></div></div><p className="mt-4 text-sm text-blue-100">Le montant est transféré de votre portefeuille principal vers votre unique carte locale.</p></div>

      <div className="space-y-5 p-5 md:p-6">
        {loading?<div className="rounded-2xl bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">Chargement…</div>:!card?<div className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900">Aucune carte locale active.</div>:<div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-blue-900"><CreditCard/></div><div className="min-w-0 flex-1"><p className="truncate font-black text-slate-950">{card.cardHolder}</p><p className="font-mono text-sm font-black text-blue-950">{card.maskedNumber}</p></div></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-blue-100 pt-4"><div><p className="text-[9px] font-black uppercase text-slate-400">Solde wallet</p><p className="mt-1 font-black text-slate-950">{money(walletBalance,currency)}</p></div><div><p className="text-[9px] font-black uppercase text-slate-400">Solde carte</p><p className="mt-1 font-black text-slate-950">{money(cardBalance,currency)}</p></div></div></div>}

        <div className="inline-flex rounded-2xl bg-slate-100 p-1">{(['USD','CDF']as WalletCurrency[]).map(item=><button key={item} onClick={()=>{setCurrency(item);setDone(false)}} className={`rounded-xl px-5 py-2 text-xs font-black ${currency===item?'bg-white text-blue-950 shadow-sm':'text-slate-500'}`}>{item}</button>)}</div>

        {done?<div className="rounded-3xl bg-emerald-50 p-6 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={42}/><h2 className="mt-3 text-xl font-black text-emerald-900">Recharge confirmée</h2><p className="mt-2 text-sm text-emerald-700">Votre carte locale a été créditée.</p><p className="mt-3 font-mono text-xs font-bold text-emerald-800">{reference}</p><button onClick={()=>setDone(false)} className="mt-5 rounded-2xl bg-white px-5 py-3 text-sm font-black text-emerald-800">Nouvelle recharge</button></div>:<>
          <label className="block"><span className="text-xs font-black uppercase tracking-wide text-slate-500">Montant · {currency}</span><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="0" className="mt-2 w-full rounded-2xl border-2 border-slate-200 px-4 py-4 text-xl font-black text-blue-950 outline-none focus:border-blue-600"/></label>
          {numericAmount>walletBalance&&<p className="text-xs font-bold text-red-600">Solde du portefeuille insuffisant.</p>}
          <label className="block"><span className="text-xs font-black uppercase tracking-wide text-slate-500">CVV Market-Cash · 3 chiffres</span><p className="mt-1 text-[11px] leading-5 text-slate-400">Le CVV confirme la transaction. Ce n’est pas votre code secret de l’application.</p><input value={cvv} onChange={e=>setCvv(e.target.value.replace(/\D/g,'').slice(0,3))} type="password" inputMode="numeric" autoComplete="off" placeholder="•••" className="mt-2 w-full rounded-2xl border-2 border-slate-200 px-4 py-4 text-center text-2xl font-black tracking-[.45em] outline-none focus:border-blue-600"/></label>
          <button disabled={busy||!card||!validAmount||cvv.length!==3} onClick={submit} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white shadow-sm disabled:opacity-40">{busy?'Traitement…':`Confirmer la recharge · ${validAmount?money(numericAmount,currency):currency}`}</button>
        </>}
      </div>
    </section>
  </div>;
}
