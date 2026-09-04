import React,{useEffect,useMemo,useState}from'react';
import{ArrowLeft,CheckCircle2,CreditCard,Eye,EyeOff,Store}from'lucide-react';
import{Link,useSearchParams}from'react-router-dom';
import toast from'react-hot-toast';
import SecurityConfirmModal from'../../components/SecurityConfirmModal';
import{useSensitiveReveal}from'../../hooks/useSensitiveReveal';
import{agentWalletService,InternalCardSummary,MarketCashRecipient}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

const key=()=>`pay_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
const fmt=(value:number,currency:WalletCurrency)=>currency==='CDF'?`${Number(value||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(value||0).toFixed(2)} USD`;

export default function MerchantPay(){
  const[params]=useSearchParams();
  const currency=(params.get('currency')==='CDF'?'CDF':'USD')as WalletCurrency;
  const initialMerchant=(params.get('merchant')||params.get('id')||'').trim().toUpperCase();
  const initialAmount=(params.get('amount')||'').trim();
  const[card,setCard]=useState<InternalCardSummary|null>(null);
  const[merchantId,setMerchantId]=useState(initialMerchant);
  const[amount,setAmount]=useState(initialAmount);
  const[merchant,setMerchant]=useState<MarketCashRecipient|null>(null);
  const[cvv,setCvv]=useState('');
  const[step,setStep]=useState<'form'|'review'|'cvv'|'done'>('form');
  const[busy,setBusy]=useState(false);
  const[loadingCard,setLoadingCard]=useState(true);
  const[reference,setReference]=useState('');
  const secure=useSensitiveReveal(90000);

  const refreshCard=async()=>{const cards=await agentWalletService.getMyInternalCards();setCard(cards[0]||null)};
  useEffect(()=>{refreshCard().catch(()=>setCard(null)).finally(()=>setLoadingCard(false))},[]);
  const cardBalance=Number(card?.balances?.[currency]||0);
  const value=useMemo(()=>Number(String(amount).replace(',','.')),[amount]);
  const valid=Number.isFinite(value)&&value>0&&value<=cardBalance;

  const identify=async()=>{if(!merchantId.trim()||!valid||!card)return;setBusy(true);try{const result=await agentWalletService.lookupMerchantRecipient(merchantId.trim().toUpperCase());setMerchant(result);setStep('review')}catch(error:any){toast.error(error?.message||'Marchand introuvable ou non autorisé.')}finally{setBusy(false)}};
  const pay=async()=>{if(!merchant||!valid||cvv.length!==3||!card)return;setBusy(true);try{const result=await agentWalletService.payMerchant({cardId:card.cardId,marketCashId:merchant.marketCashId,currency,amount:value,cvv,idempotencyKey:key()});setReference(result.reference);setStep('done');setCvv('');toast.success('Paiement confirmé.');await refreshCard()}catch(error:any){toast.error(error?.message||'Paiement refusé. Vérifiez votre CVV.')}finally{setBusy(false)}};

  return <div className="mx-auto max-w-xl p-4 pb-28 md:p-8">
    <Link to="/client/cards?card=local" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft size={16}/>Ma carte locale</Link>
    <section className="mt-5 rounded-[2rem] border bg-white p-5 shadow-sm md:p-6">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><Store/></div>
      <h1 className="mt-4 text-2xl font-black text-slate-950">Payer un marchand</h1>
      <p className="mt-1 text-sm leading-6 text-slate-500">Le paiement est débité de votre unique carte locale et confirmé par son CVV à 3 chiffres.</p>
      {initialMerchant&&<div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">QR / lien marchand détecté. Vérifiez le bénéficiaire et le montant.</div>}

      {loadingCard?<div className="mt-5 rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">Chargement de la carte locale…</div>:!card?<div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Aucune carte locale disponible.</b><Link to="/client/cards" className="mt-3 block rounded-xl bg-blue-950 px-4 py-3 text-center font-black text-white">Ouvrir Mes cartes</Link></div>:<>
        <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-blue-950"><div className="flex items-center gap-2"><CreditCard size={17}/><span className="text-xs font-black uppercase tracking-wide">Carte locale utilisée</span><button onClick={secure.request} className="ml-auto grid h-9 w-9 place-items-center rounded-xl bg-white" aria-label="Afficher le solde">{secure.revealed?<EyeOff size={17}/>:<Eye size={17}/>}</button></div><div className="mt-3 flex items-center justify-between gap-3"><div><p className="font-mono text-sm font-black">{card.maskedNumber}</p><p className="mt-1 text-xs font-bold text-slate-500">Une seule carte locale par client</p></div><div className="text-right"><p className="text-[10px] font-black uppercase text-slate-400">Solde {currency}</p><p className="font-black">{secure.revealed?fmt(cardBalance,currency):'••••••'}</p></div></div></div>

        {step==='form'&&<div className="mt-5 space-y-3"><label className="block text-xs font-black uppercase text-slate-500">ID Marchand Market-Cash</label><input value={merchantId} onChange={e=>setMerchantId(e.target.value.toUpperCase())} placeholder="MCM-123456M" className="w-full rounded-2xl border p-4 font-mono"/><label className="block text-xs font-black uppercase text-slate-500">Montant</label><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={`Montant en ${currency}`} className="w-full rounded-2xl border p-4"/>{value>cardBalance&&<p className="text-xs font-bold text-red-600">Solde de la carte locale insuffisant.</p>}<button disabled={busy||!merchantId.trim()||!valid} onClick={identify} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">{busy?'Vérification…':'Vérifier le marchand'}</button></div>}
        {step==='review'&&merchant&&<div className="mt-5 space-y-3"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Marchand vérifié</p><p className="mt-1 text-lg font-black">{merchant.displayName}</p>{merchant.legalName&&merchant.legalName!==merchant.displayName&&<p className="text-xs text-slate-500">{merchant.legalName}</p>}<p className="mt-1 font-mono text-sm text-slate-500">{merchant.marketCashId}</p><div className="mt-4 flex justify-between border-t pt-3"><span>À débiter</span><b>{fmt(value,currency)}</b></div></div><button onClick={()=>setStep('cvv')} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white">Continuer</button><button onClick={()=>setStep('form')} className="w-full py-2 text-sm font-bold text-slate-500">Modifier</button></div>}
        {step==='cvv'&&<div className="mt-5 space-y-3"><label className="block text-xs font-black uppercase text-slate-500">CVV Market-Cash · 3 chiffres</label><p className="text-[11px] leading-5 text-slate-400">Le CVV de la carte locale confirme le débit. Votre code secret de l'application ne confirme jamais une transaction.</p><input value={cvv} onChange={e=>setCvv(e.target.value.replace(/\D/g,'').slice(0,3))} type="password" inputMode="numeric" autoComplete="off" placeholder="•••" className="w-full rounded-2xl border-2 p-4 text-center text-2xl font-black tracking-[.45em]"/><button disabled={busy||cvv.length!==3} onClick={pay} className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-40">{busy?'Paiement…':'Confirmer le paiement'}</button></div>}
        {step==='done'&&<div className="mt-6 rounded-3xl bg-emerald-50 p-6 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={42}/><h2 className="mt-3 text-xl font-black text-emerald-900">Paiement envoyé</h2><p className="mt-1 text-sm text-emerald-700">{fmt(value,currency)} vers {merchant?.displayName}</p><p className="mt-3 font-mono text-xs text-emerald-800">{reference}</p><Link to="/client/wallet/transactions" className="mt-5 inline-flex rounded-2xl bg-white px-4 py-3 text-sm font-black text-emerald-800">Voir l'historique</Link></div>}
      </>}
    </section>
    <SecurityConfirmModal open={secure.open} busy={secure.busy} onClose={secure.close} onConfirm={secure.confirm} title="Afficher le solde de la carte" subtitle="Entrez le code secret de l'application. Le paiement restera confirmé uniquement par le CVV."/>
  </div>;
}
