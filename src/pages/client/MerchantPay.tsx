import React,{useEffect,useMemo,useState}from'react';
import{ArrowLeft,CheckCircle2,Store}from'lucide-react';
import{Link,useSearchParams}from'react-router-dom';
import toast from'react-hot-toast';
import{agentWalletService,MarketCashRecipient,WalletServerSnapshot}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

const key=()=>`pay_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
const fmt=(v:number,c:WalletCurrency)=>c==='CDF'?`${v.toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${v.toFixed(2)} USD`;

export default function MerchantPay(){
  const[params]=useSearchParams();
  const currency=(params.get('currency')==='CDF'?'CDF':'USD')as WalletCurrency;
  const initialMerchant=(params.get('merchant')||params.get('id')||'').trim().toUpperCase();
  const initialAmount=(params.get('amount')||'').trim();
  const[wallet,setWallet]=useState<WalletServerSnapshot|null>(null);
  const[merchantId,setMerchantId]=useState(initialMerchant);
  const[amount,setAmount]=useState(initialAmount);
  const[merchant,setMerchant]=useState<MarketCashRecipient|null>(null);
  const[pin,setPin]=useState('');
  const[step,setStep]=useState<'form'|'review'|'pin'|'done'>('form');
  const[busy,setBusy]=useState(false);
  const[reference,setReference]=useState('');

  const refresh=()=>agentWalletService.getMyWallets().then(setWallet).catch(()=>setWallet(null));
  useEffect(()=>{void refresh();},[]);
  const balance=Number(wallet?.wallets?.[currency]?.availableBalance||0);
  const value=useMemo(()=>Number(String(amount).replace(',','.')),[amount]);
  const valid=Number.isFinite(value)&&value>0&&value<=balance;

  const identify=async()=>{
    if(!merchantId.trim()||!valid)return;
    setBusy(true);
    try{
      const result=await agentWalletService.lookupMerchantRecipient(merchantId.trim().toUpperCase());
      setMerchant(result);setStep('review');
    }catch(e:any){toast.error(e?.message||'Marchand introuvable ou non autorisé. Vérifiez son ID Market-Cash.');}
    finally{setBusy(false)}
  };

  const pay=async()=>{
    if(!merchant||!valid||!pin)return;
    setBusy(true);
    try{
      const result=await agentWalletService.payMerchant({marketCashId:merchant.marketCashId,currency,amount:value,pin,idempotencyKey:key()});
      setReference(result.reference);setStep('done');setPin('');
      toast.success('Paiement marchand confirmé.');
      await refresh();
    }catch(e:any){toast.error(e?.message||'Paiement refusé.');}
    finally{setBusy(false)}
  };

  return <div className="mx-auto max-w-xl p-4 pb-28 md:p-8">
    <Link to="/client/home" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft size={16}/> Retour à l'accueil</Link>
    <section className="mt-5 rounded-3xl border bg-white p-5 shadow-sm md:p-6">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><Store/></div>
      <h1 className="mt-4 text-2xl font-black text-slate-950">Payer un marchand</h1>
      <p className="mt-1 text-sm text-slate-500">Paiement instantané vers un compte Marchand Market-Cash approuvé.</p>
      {initialMerchant&&<div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">QR / lien marchand détecté. Vérifiez le montant puis le nom du bénéficiaire avant confirmation.</div>}
      <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-950">Solde {currency} : <b>{fmt(balance,currency)}</b></div>

      {step==='form'&&<div className="mt-5 space-y-3">
        <label className="block text-xs font-black uppercase text-slate-500">ID Market-Cash du marchand</label>
        <input value={merchantId} onChange={e=>setMerchantId(e.target.value.toUpperCase())} placeholder="MCW-XXXXXXXXXX" className="w-full rounded-2xl border p-4 font-mono"/>
        <label className="block text-xs font-black uppercase text-slate-500">Montant</label>
        <input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={`Montant en ${currency}`} className="w-full rounded-2xl border p-4"/>
        {value>balance&&<p className="text-xs font-bold text-red-600">Solde insuffisant.</p>}
        <button disabled={busy||!merchantId.trim()||!valid} onClick={identify} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">{busy?'Vérification…':'Vérifier le marchand'}</button>
      </div>}

      {step==='review'&&merchant&&<div className="mt-5 space-y-3">
        <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Marchand vérifié</p><p className="mt-1 text-lg font-black">{merchant.displayName}</p>{merchant.legalName&&merchant.legalName!==merchant.displayName&&<p className="text-xs text-slate-500">{merchant.legalName}</p>}<p className="mt-1 font-mono text-sm text-slate-500">{merchant.marketCashId}</p><div className="mt-4 flex justify-between border-t pt-3"><span>À payer</span><b>{fmt(value,currency)}</b></div></div>
        <div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900">Vérifiez le nom affiché avec le marchand avant de confirmer. Le serveur refuse les comptes qui ne sont pas des marchands actifs.</div>
        <button onClick={()=>setStep('pin')} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white">Continuer</button>
        <button onClick={()=>setStep('form')} className="w-full py-2 text-sm font-bold text-slate-500">Modifier</button>
      </div>}

      {step==='pin'&&<div className="mt-5 space-y-3">
        <label className="block text-xs font-black uppercase text-slate-500">Code PIN Market-Cash</label>
        <input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} type="password" inputMode="numeric" placeholder="••••" className="w-full rounded-2xl border p-4 text-center tracking-[.35em]"/>
        <button disabled={busy||!pin} onClick={pay} className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-40">{busy?'Paiement…':'Confirmer le paiement'}</button>
      </div>}

      {step==='done'&&<div className="mt-6 rounded-3xl bg-emerald-50 p-6 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={42}/><h2 className="mt-3 text-xl font-black text-emerald-900">Paiement envoyé</h2><p className="mt-1 text-sm text-emerald-700">{fmt(value,currency)} vers {merchant?.displayName}</p><p className="mt-3 font-mono text-xs text-emerald-800">{reference}</p><Link to="/client/wallet/transactions" className="mt-5 inline-flex rounded-2xl bg-white px-4 py-3 text-sm font-black text-emerald-800">Voir l'historique</Link></div>}
    </section>
  </div>;
}
