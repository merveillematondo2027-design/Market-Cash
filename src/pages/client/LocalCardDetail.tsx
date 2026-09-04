import React, { useEffect, useState } from 'react';
import { ArrowLeft, Banknote, CreditCard, Eye, EyeOff, QrCode, ShieldCheck, Store, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { agentWalletService, InternalCardSummary } from '../../services/agentWalletService';
import { WalletCurrency } from '../../types/wallet';

const money = (value:number,currency:WalletCurrency) => currency === 'CDF'
  ? `${Number(value || 0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`
  : `${Number(value || 0).toFixed(2)} USD`;

export default function LocalCardDetail(){
  const[currency,setCurrency]=useState<WalletCurrency>('USD');
  const[card,setCard]=useState<InternalCardSummary|null>(null);
  const[loading,setLoading]=useState(true);
  const[revealed,setRevealed]=useState(false);
  const[secureBalances,setSecureBalances]=useState<Partial<Record<WalletCurrency,number>>>({});
  const[pinOpen,setPinOpen]=useState(false);
  const[pin,setPin]=useState('');
  const[verifying,setVerifying]=useState(false);

  useEffect(()=>{
    agentWalletService.ensureLocalCard()
      .then(()=>agentWalletService.getMyInternalCards())
      .then(cards=>setCard(cards[0]||null))
      .catch(error=>toast.error(error?.message||'Carte locale indisponible.'))
      .finally(()=>setLoading(false));
  },[]);

  const reveal=async()=>{
    if(pin.length<4)return;
    setVerifying(true);
    try{
      const result=await agentWalletService.revealLocalCardBalance(pin);
      setSecureBalances(result.balances||{});
      setRevealed(true);
      setPinOpen(false);
      setPin('');
      toast.success('Solde affiché après validation du code secret.');
    }catch(error:any){
      toast.error(error?.message||'Code secret incorrect.');
      setPin('');
    }finally{setVerifying(false)}
  };

  const toggleReveal=()=>{
    if(revealed){setRevealed(false);setSecureBalances({});return;}
    setPinOpen(true);
  };

  if(loading)return <div className="grid min-h-[55vh] place-items-center text-sm font-bold text-slate-500">Chargement de la carte locale…</div>;
  if(!card)return <div className="mx-auto max-w-xl p-6"><Link to="/client/cards" className="font-bold text-slate-500">← Retour aux cartes</Link><div className="mt-5 rounded-3xl border bg-white p-6">Carte locale indisponible.</div></div>;

  return <div className="mx-auto max-w-3xl space-y-5 p-4 pb-28 md:p-8">
    <Link to="/client/cards" className="inline-flex items-center gap-2 text-sm font-black text-slate-500"><ArrowLeft size={17}/>Retour aux cartes</Link>
    <header><p className="text-[11px] font-black uppercase tracking-[.18em] text-emerald-700">Carte locale Market-Cash</p><h1 className="mt-1 text-3xl font-black text-slate-950">Ma carte locale</h1><p className="mt-2 text-sm leading-6 text-slate-500">Une seule carte pour vos dépenses locales. Choisissez USD ou CDF selon l’opération.</p></header>

    <section className="relative aspect-[1.586/1] overflow-hidden rounded-[1.8rem] border border-blue-300/40 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-950 p-5 text-white shadow-xl sm:p-6">
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cyan-300/20 blur-2xl"/><div className="absolute -bottom-24 -left-14 h-64 w-64 rounded-full bg-blue-950/70 blur-2xl"/>
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="flex items-start justify-between"><div><p className="text-base font-black tracking-wide sm:text-lg">MARKET<span className="text-amber-300">-CASH</span></p><p className="mt-1 text-[8px] font-black uppercase tracking-[.22em] text-blue-100">Carte locale • USD / CDF</p></div><div className="rounded-xl bg-white p-1.5 shadow-lg"><QRCodeSVG value={card.qrData||`MARKET-CASH-CARD:${card.cardIdentifier}`} size={42} level="M"/></div></div>
        <div><div className="flex items-center gap-3"><div className="h-9 w-12 rounded-lg bg-gradient-to-br from-amber-100 via-amber-300 to-amber-500 shadow-inner"/><QrCode size={22}/></div><p className="mt-5 font-mono text-xl font-black tracking-[.14em] sm:text-2xl">{card.maskedNumber}</p></div>
        <div className="flex items-end justify-between gap-3"><div className="min-w-0"><p className="text-[7px] uppercase tracking-[.16em] text-blue-100">Titulaire</p><p className="mt-1 truncate text-xs font-black">{card.cardHolder}</p><p className="mt-1 font-mono text-[8px] text-blue-100">{card.cardIdentifier}</p></div><div className="text-right"><p className="text-[7px] uppercase tracking-[.16em] text-blue-100">Réseau</p><p className="mt-1 text-sm font-black italic">LOCAL</p></div></div>
      </div>
    </section>

    <section className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Solde de la carte</p><p className="mt-2 text-3xl font-black text-blue-950">{revealed?money(Number(secureBalances[currency]||0),currency):'••••••'}</p></div><button onClick={toggleReveal} className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-900" aria-label={revealed?'Masquer le solde':'Afficher le solde'}>{revealed?<EyeOff/>:<Eye/>}</button></div>
      <div className="mt-4 inline-flex rounded-2xl bg-slate-100 p-1"><button onClick={()=>setCurrency('USD')} className={`rounded-xl px-6 py-2 text-sm font-black ${currency==='USD'?'bg-white text-blue-950 shadow-sm':'text-slate-500'}`}>USD</button><button onClick={()=>setCurrency('CDF')} className={`rounded-xl px-6 py-2 text-sm font-black ${currency==='CDF'?'bg-white text-blue-950 shadow-sm':'text-slate-500'}`}>CDF</button></div>
      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={14}/>Le solde n’est révélé qu’après confirmation du code secret Market-Cash.</p>
    </section>

    <section className="grid gap-3 sm:grid-cols-3">
      <Link to={`/client/cards/local/recharge?currency=${currency}`} className="rounded-2xl bg-amber-400 p-4 text-blue-950 shadow-sm"><WalletCards size={20}/><p className="mt-3 font-black">Recharger</p><p className="mt-1 text-[11px]">Portefeuille → carte locale</p></Link>
      <Link to={`/client/wallet/pay?currency=${currency}`} className="rounded-2xl border bg-white p-4 text-blue-950 shadow-sm"><Store size={20}/><p className="mt-3 font-black">Payer</p><p className="mt-1 text-[11px] text-slate-500">Marchand Market-Cash</p></Link>
      <Link to={`/client/wallet/withdraw?currency=${currency}`} className="rounded-2xl border bg-white p-4 text-blue-950 shadow-sm"><Banknote size={20}/><p className="mt-3 font-black">Retrait</p><p className="mt-1 text-[11px] text-slate-500">Chez un Agent agréé</p></Link>
    </section>

    {pinOpen&&<div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-900"><CreditCard/></div><h2 className="mt-4 text-center text-xl font-black text-slate-950">Afficher le solde</h2><p className="mt-1 text-center text-xs leading-5 text-slate-500">Saisissez votre code secret Market-Cash.</p><input autoFocus type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} placeholder="••••" className="mt-5 w-full rounded-2xl border p-4 text-center text-xl font-black tracking-[.4em]"/><div className="mt-4 grid grid-cols-2 gap-3"><button onClick={()=>{setPinOpen(false);setPin('')}} className="rounded-2xl bg-slate-100 py-3 font-black text-slate-600">Annuler</button><button disabled={pin.length<4||verifying} onClick={()=>void reveal()} className="rounded-2xl bg-blue-950 py-3 font-black text-white disabled:opacity-40">{verifying?'Vérification…':'Confirmer'}</button></div></div></div>}
  </div>;
}
