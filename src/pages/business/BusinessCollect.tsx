import React,{useEffect,useMemo,useState}from'react';
import{Copy,QrCode,RefreshCw,ShieldCheck,Store}from'lucide-react';
import{QRCodeSVG}from'qrcode.react';
import toast from'react-hot-toast';
import{agentWalletService}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

export default function BusinessCollect(){
  const[marketCashId,setMarketCashId]=useState('');
  const[currency,setCurrency]=useState<WalletCurrency>('CDF');
  const[amount,setAmount]=useState('');
  const[loading,setLoading]=useState(true);

  const load=async()=>{
    setLoading(true);
    try{const identity=await agentWalletService.getMyMarketCashIdentity();setMarketCashId(identity.marketCashId);}
    catch(e){console.error('[BUSINESS_COLLECT_ID_ERROR]',e);toast.error("Impossible de charger l'identifiant marchand.");}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[]);

  const numericAmount=Number(String(amount).replace(',','.'));
  const fixedAmount=Number.isFinite(numericAmount)&&numericAmount>0?numericAmount:0;
  const paymentUrl=useMemo(()=>{
    if(!marketCashId)return'';
    const url=new URL('/client/wallet/pay',window.location.origin);
    url.searchParams.set('merchant',marketCashId);
    url.searchParams.set('currency',currency);
    if(fixedAmount>0)url.searchParams.set('amount',String(fixedAmount));
    return url.toString();
  },[marketCashId,currency,fixedAmount]);

  const copy=async(value:string,label:string)=>{
    if(!value)return;
    try{await navigator.clipboard.writeText(value);toast.success(`${label} copié.`);}
    catch{toast.error('Copie impossible.');}
  };

  return <div className="mx-auto max-w-xl space-y-5 p-4 md:p-8">
    <header><p className="text-xs font-black uppercase tracking-wider text-amber-600">Marchand Market-Cash</p><h1 className="text-2xl font-black text-blue-950">Encaisser un client</h1><p className="mt-1 text-sm text-slate-500">Créez un QR de paiement. Le client vérifie votre identité et confirme lui-même avec son PIN.</p></header>

    <section className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase text-slate-400">Montant à encaisser</p><h2 className="mt-1 font-black text-slate-950">Paiement instantané</h2></div><Store className="text-blue-800"/></div>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
        <button onClick={()=>setCurrency('CDF')} className={`rounded-xl py-3 text-sm font-black ${currency==='CDF'?'bg-blue-950 text-white shadow-sm':'text-slate-600'}`}>CDF</button>
        <button onClick={()=>setCurrency('USD')} className={`rounded-xl py-3 text-sm font-black ${currency==='USD'?'bg-blue-950 text-white shadow-sm':'text-slate-600'}`}>USD</button>
      </div>
      <input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={`Montant en ${currency} — facultatif`} className="mt-3 w-full rounded-2xl border p-4 text-xl font-black outline-none focus:border-blue-500"/>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">Laissez vide pour permettre au client de saisir le montant. Saisissez un montant pour générer un QR prérempli.</p>
    </section>

    <section className="rounded-3xl border bg-white p-5 text-center shadow-sm">
      {loading?<div className="grid min-h-72 place-items-center text-sm text-slate-500"><RefreshCw className="animate-spin"/></div>:marketCashId&&paymentUrl?<>
        <div className="mx-auto inline-block rounded-3xl border bg-white p-4"><QRCodeSVG value={paymentUrl} size={220}/></div>
        <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-left"><p className="text-[10px] font-black uppercase tracking-wider text-blue-500">ID marchand</p><div className="mt-1 flex items-center justify-between gap-3"><b className="font-mono text-blue-950">{marketCashId}</b><button onClick={()=>copy(marketCashId,'ID marchand')} className="rounded-xl bg-white p-2 text-blue-900"><Copy size={16}/></button></div></div>
        {fixedAmount>0&&<div className="mt-3 rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-black uppercase text-emerald-600">Montant demandé</p><p className="mt-1 text-2xl font-black text-emerald-900">{currency==='CDF'?`${fixedAmount.toLocaleString('fr-FR')} CDF`:`${fixedAmount.toFixed(2)} USD`}</p></div>}
        <button onClick={()=>copy(paymentUrl,'Lien de paiement')} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-blue-950 px-5 py-3 text-sm font-black text-white"><QrCode size={17}/> Copier le lien de paiement</button>
      </>:<div className="rounded-2xl bg-red-50 p-5 text-sm font-bold text-red-700">Identifiant marchand indisponible. Réessayez.</div>}
    </section>

    <section className="flex gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900"><ShieldCheck className="shrink-0"/><div><b>Le marchand ne débite jamais le client.</b><p className="mt-1 text-xs leading-5">Le paiement est déclenché et confirmé depuis le compte du client. Le serveur crédite ensuite automatiquement le portefeuille Business.</p></div></section>
  </div>;
}
