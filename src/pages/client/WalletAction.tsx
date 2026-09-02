import React,{useEffect,useMemo,useState}from'react';
import{ArrowDownLeft,ArrowLeft,ArrowUpRight,Building2,ChevronRight,CreditCard,History,QrCode,Send,Smartphone,WalletCards}from'lucide-react';
import{Link,useSearchParams}from'react-router-dom';
import{QRCodeSVG}from'qrcode.react';
import toast from'react-hot-toast';
import{agentWalletService,InternalCardSummary,MarketCashRecipient,WalletServerSnapshot}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

type Action='send'|'receive'|'transactions'|'top-up'|'card-topup'|'withdraw'|'pay'|'exchange';
type SendStep='channels'|'form'|'review'|'pin'|'done';
const meta={send:{title:'Envoyer',icon:Send},receive:{title:'Recevoir',icon:ArrowDownLeft},transactions:{title:'Historique',icon:History},'top-up':{title:'Dépôt',icon:ArrowDownLeft},'card-topup':{title:'Recharger une carte',icon:CreditCard},withdraw:{title:'Retrait',icon:ArrowUpRight},pay:{title:'Paiement',icon:WalletCards},exchange:{title:'Conversion',icon:ArrowUpRight}};
const mobileProviders=['M-Pesa','Airtel Money','Orange Money','Afrimoney'];
const bankOptions=['Compte bancaire','Virement bancaire'];
const fmt=(v:number,c:WalletCurrency)=>c==='CDF'?`${v.toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${v.toFixed(2)} USD`;
const idempotency=(prefix:string)=>`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

export default function WalletAction({action}:{action:Action}){
  const[params]=useSearchParams();
  const currency=(params.get('currency')==='CDF'?'CDF':'USD')as WalletCurrency;
  const[server,setServer]=useState<WalletServerSnapshot|null>(null);
  const[identity,setIdentity]=useState('');
  const[amount,setAmount]=useState('');
  const[destination,setDestination]=useState('');
  const[recipient,setRecipient]=useState<MarketCashRecipient|null>(null);
  const[pin,setPin]=useState('');
  const[step,setStep]=useState<SendStep>('channels');
  const[busy,setBusy]=useState(false);
  const[cards,setCards]=useState<InternalCardSummary[]>([]);
  const[selectedCard,setSelectedCard]=useState('');
  const[history,setHistory]=useState<any[]>([]);
  const Icon=meta[action].icon;

  useEffect(()=>{
    agentWalletService.getMyWallets().then(setServer).catch(()=>{});
    agentWalletService.getMyMarketCashIdentity().then(x=>setIdentity(x.marketCashId)).catch(()=>{});
    if(action==='card-topup')agentWalletService.getMyInternalCards().then(setCards).catch(()=>setCards([]));
    if(action==='transactions')agentWalletService.getMyWalletHistory().then(setHistory).catch(()=>setHistory([]));
  },[action]);

  const balance=Number(server?.wallets?.[currency]?.availableBalance||0);
  const numericAmount=useMemo(()=>Number(String(amount).replace(',','.')),[amount]);
  const validAmount=Number.isFinite(numericAmount)&&numericAmount>0&&numericAmount<=balance;

  const reservePartner=(label:string,kind:'mobile'|'bank')=>{
    toast(`${label} sera relié par Market-Cash → MHT APIs → partenaire. Aucun débit n'est exécuté tant que l'API partenaire n'est pas activée.`,{icon:kind==='mobile'?'📱':'🏦',duration:6000});
  };

  const lookupRecipient=async()=>{
    if(!destination.trim()||!validAmount)return;
    setBusy(true);
    try{const found=await agentWalletService.lookupMarketCashRecipient(destination.trim());setRecipient(found);setStep('review');}
    catch(e:any){toast.error(e?.message||'Bénéficiaire Market-Cash introuvable.');}
    finally{setBusy(false)}
  };

  const executeTransfer=async()=>{
    if(!recipient||!pin||!validAmount)return;
    setBusy(true);
    try{const res=await agentWalletService.transferMarketCash({marketCashId:recipient.marketCashId,currency,amount:numericAmount,pin,idempotencyKey:idempotency('transfer')});toast.success(`Transfert réussi • ${res.reference}`);setStep('done');setServer(await agentWalletService.getMyWallets());}
    catch(e:any){toast.error(e?.message||'Transfert refusé.');}
    finally{setBusy(false)}
  };

  const executeCardTopup=async()=>{
    if(!selectedCard||!pin||!validAmount)return;
    setBusy(true);
    try{const res=await agentWalletService.fundInternalCard({cardId:selectedCard,currency,amount:numericAmount,pin,idempotencyKey:idempotency('card')});toast.success(`Carte rechargée • ${res.reference}`);setAmount('');setPin('');setServer(await agentWalletService.getMyWallets());setCards(await agentWalletService.getMyInternalCards());}
    catch(e:any){toast.error(e?.message||'Recharge de carte refusée.');}
    finally{setBusy(false)}
  };

  const back=`/client/home`;
  return <div className="mx-auto max-w-xl p-4 md:p-8 pb-28"><Link to={back} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft size={16}/> Retour à l'accueil</Link><section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm"><div className="flex items-start justify-between"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-900"><Icon size={24}/></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{currency}</span></div><h1 className="mt-4 text-2xl font-black text-slate-950">{meta[action].title}</h1><p className="mt-1 text-sm text-slate-500">Solde portefeuille : <b>{fmt(balance,currency)}</b></p>

  {action==='send'&&<div className="mt-6 space-y-4">
    {step==='channels'&&<><p className="text-sm font-black text-slate-700">Choisir la destination</p><button onClick={()=>setStep('form')} className="w-full rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 text-left flex justify-between items-center"><span><WalletCards className="inline mr-3 text-blue-800"/><b>Vers Market-Cash</b><small className="block ml-9 mt-1 text-slate-500">Transfert instantané vers le portefeuille principal d'un autre utilisateur.</small></span><ChevronRight/></button><button onClick={()=>reservePartner('Envoi vers Mobile Money','mobile')} className="w-full rounded-2xl border p-4 text-left flex justify-between items-center"><span><Smartphone className="inline mr-3 text-blue-700"/><b>Vers Mobile Money</b><small className="block ml-9 mt-1 text-slate-500">Réservé à MHT APIs et au partenaire opérateur.</small></span><ChevronRight/></button><button onClick={()=>reservePartner('Envoi bancaire','bank')} className="w-full rounded-2xl border p-4 text-left flex justify-between items-center"><span><Building2 className="inline mr-3 text-violet-700"/><b>Vers une banque</b><small className="block ml-9 mt-1 text-slate-500">Réservé à MHT APIs et au partenaire bancaire.</small></span><ChevronRight/></button></>}
    {step==='form'&&<><label className="text-xs font-black uppercase text-slate-500">ID Market-Cash du bénéficiaire</label><input value={destination} onChange={e=>setDestination(e.target.value.toUpperCase())} placeholder="Ex. MCW-12AB34CD56" className="w-full rounded-2xl border p-4 font-mono"/><label className="text-xs font-black uppercase text-slate-500">Montant</label><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={`Montant en ${currency}`} className="w-full rounded-2xl border p-4"/>{numericAmount>balance&&<p className="text-xs font-bold text-red-600">Solde insuffisant.</p>}<button disabled={!destination.trim()||!validAmount||busy} onClick={lookupRecipient} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">{busy?'Vérification…':'Continuer'}</button></>}
    {step==='review'&&recipient&&<><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Bénéficiaire</p><p className="mt-1 text-lg font-black text-slate-900">{recipient.displayName}</p><p className="font-mono text-sm text-slate-500">{recipient.marketCashId}</p><div className="mt-4 border-t pt-3 flex justify-between"><span>Montant</span><b>{fmt(numericAmount,currency)}</b></div></div><button onClick={()=>setStep('pin')} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white">Envoyer</button><button onClick={()=>setStep('form')} className="w-full py-2 text-sm font-bold text-slate-500">Modifier</button></>}
    {step==='pin'&&<><div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Confirmez cette opération avec votre code secret Market-Cash. Le code n'est jamais envoyé au bénéficiaire.</div><input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} inputMode="numeric" type="password" placeholder="Code secret" className="w-full rounded-2xl border p-4 text-center tracking-[.4em]"/><button disabled={!pin||busy} onClick={executeTransfer} className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-40">{busy?'Traitement…':'Confirmer le transfert'}</button></>}
    {step==='done'&&<div className="rounded-3xl bg-emerald-50 p-6 text-center"><p className="text-3xl">✓</p><h2 className="mt-2 text-lg font-black text-emerald-900">Transfert terminé</h2><p className="mt-1 text-sm text-emerald-700">Le portefeuille du bénéficiaire a été crédité directement.</p><Link to={`/client/home`} className="mt-5 inline-block rounded-xl bg-emerald-600 px-5 py-3 font-black text-white">Retour à l'accueil</Link></div>}
  </div>}

  {action==='top-up'&&<div className="mt-6 space-y-3"><p className="text-sm font-black text-slate-700">D'où vient l'argent ?</p><p className="text-xs text-slate-500">Un dépôt crédite uniquement votre portefeuille principal. Il ne recharge jamais directement une carte.</p>{mobileProviders.map(p=><button key={p} onClick={()=>reservePartner(p,'mobile')} className="w-full rounded-2xl border p-4 flex justify-between items-center text-left"><span><Smartphone className="inline mr-3 text-blue-700"/><b>{p}</b><small className="block ml-9 text-slate-500">Dépôt via MHT APIs → opérateur Mobile Money.</small></span><ChevronRight/></button>)}{bankOptions.map(p=><button key={p} onClick={()=>reservePartner(p,'bank')} className="w-full rounded-2xl border p-4 flex justify-between items-center text-left"><span><Building2 className="inline mr-3 text-violet-700"/><b>{p}</b><small className="block ml-9 text-slate-500">Dépôt via MHT APIs → partenaire bancaire.</small></span><ChevronRight/></button>)}</div>}

  {action==='card-topup'&&<div className="mt-6 space-y-4"><p className="text-xs text-slate-500">Cette opération débite votre portefeuille principal et crédite uniquement une carte interne Market-Cash. Les Visa virtuelles ne sont pas concernées.</p>{cards.length===0?<div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Aucune carte interne Market-Cash active disponible pour le moment.</div>:<><label className="text-xs font-black uppercase text-slate-500">Choisir la carte</label><div className="space-y-2">{cards.map(c=><button key={c.cardId} onClick={()=>setSelectedCard(c.cardId)} className={`w-full rounded-2xl border p-4 text-left ${selectedCard===c.cardId?'border-blue-700 bg-blue-50':'border-slate-200'}`}><b>{c.cardHolder||'Carte Market-Cash'}</b><span className="block text-xs font-mono text-slate-500">{c.cardIdentifier} • {c.maskedNumber}</span><span className="block mt-1 text-xs text-slate-500">Solde carte : {fmt(Number(c.balances?.[currency]||0),currency)}</span></button>)}</div><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={`Montant à transférer en ${currency}`} className="w-full rounded-2xl border p-4"/><input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} inputMode="numeric" type="password" placeholder="Code secret Market-Cash" className="w-full rounded-2xl border p-4 text-center"/><button disabled={!selectedCard||!validAmount||!pin||busy} onClick={executeCardTopup} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">{busy?'Traitement…':'Confirmer la recharge'}</button></>}</div>}

  {action==='receive'&&<div className="mt-6 text-center">{identity?<><div className="inline-block rounded-3xl border p-4"><QRCodeSVG value={`MARKET-CASH:${identity}`} size={180}/></div><p className="mt-4 font-mono text-lg font-black text-blue-950">{identity}</p><p className="mt-1 text-sm text-slate-500">Partagez uniquement cet ID Market-Cash pour recevoir un transfert dans votre portefeuille.</p></>:<p className="text-sm text-slate-500">Création de votre identifiant Market-Cash…</p>}</div>}

  {action==='transactions'&&<div className="mt-6 space-y-2">{history.length===0?<div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">Aucune opération enregistrée.</div>:history.map((t:any)=><div key={t.id||t.reference} className="rounded-2xl border p-4"><div className="flex justify-between gap-3"><div><b className="text-slate-900">{t.type==='local_transfer'?'Transfert Market-Cash':t.type==='wallet_to_card'?'Recharge carte':t.type||'Opération'}</b><p className="text-xs text-slate-500">{t.reference}</p></div><b className="text-blue-950">{fmt(Number(t.amount||0),t.currency||currency)}</b></div><p className="mt-2 text-[11px] text-slate-400">{t.createdAt?new Date(t.createdAt).toLocaleString('fr-FR'):''}</p></div>)}</div>}

  {(action==='withdraw'||action==='pay'||action==='exchange')&&<div className="mt-6 rounded-2xl bg-slate-50 p-5"><h2 className="font-black text-slate-900">Action retirée du portefeuille principal</h2><p className="mt-2 text-sm text-slate-500">Le portefeuille principal est volontairement limité : dépôt, transfert vers un autre portefeuille Market-Cash et alimentation des cartes internes. Les paiements et sorties de fonds seront exécutés depuis les produits/cartes prévus à cet effet.</p></div>}
  </section></div>
}
