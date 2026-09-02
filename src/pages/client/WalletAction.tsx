import React,{useEffect,useMemo,useState}from'react';
import{ArrowDownLeft,ArrowLeft,Building2,ChevronRight,CreditCard,History,QrCode,Send,Smartphone,WalletCards}from'lucide-react';
import{Link,useSearchParams}from'react-router-dom';
import{QRCodeSVG}from'qrcode.react';
import toast from'react-hot-toast';
import{agentWalletService,InternalCardSummary,MarketCashRecipient,WalletDepositRequest,WalletServerSnapshot}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

type Action='send'|'receive'|'transactions'|'top-up'|'card-topup'|'withdraw'|'pay'|'exchange';
type SendStep='channels'|'form'|'review'|'pin'|'done';
type DepositRail='mobile_money'|'bank'|null;
type DepositStep='source'|'details'|'review'|'processing'|'done';
const meta={send:{title:'Envoyer',icon:Send},receive:{title:'Recevoir',icon:ArrowDownLeft},transactions:{title:'Historique',icon:History},'top-up':{title:'Recharger le portefeuille',icon:ArrowDownLeft},'card-topup':{title:'Recharger une carte',icon:CreditCard},withdraw:{title:'Retrait',icon:ArrowDownLeft},pay:{title:'Paiement',icon:WalletCards},exchange:{title:'Conversion',icon:ArrowDownLeft}};
const mobileProviders=['M-Pesa','Airtel Money','Orange Money','Afrimoney'];
const bankOptions=['Banque partenaire','Virement bancaire'];
const fmt=(v:number,c:WalletCurrency)=>c==='CDF'?`${v.toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${v.toFixed(2)} USD`;
const makeKey=(prefix:string)=>`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;

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
  const[depositRail,setDepositRail]=useState<DepositRail>(null);
  const[depositStep,setDepositStep]=useState<DepositStep>('source');
  const[network,setNetwork]=useState('');
  const[phone,setPhone]=useState('');
  const[bank,setBank]=useState('');
  const[depositResult,setDepositResult]=useState<WalletDepositRequest|null>(null);
  const Icon=meta[action].icon;

  const refreshWallet=async()=>setServer(await agentWalletService.getMyWallets());
  useEffect(()=>{
    refreshWallet().catch(()=>{});
    agentWalletService.getMyMarketCashIdentity().then(x=>setIdentity(x.marketCashId)).catch(()=>{});
    if(action==='card-topup')agentWalletService.getMyInternalCards().then(setCards).catch(()=>setCards([]));
    if(action==='transactions')agentWalletService.getMyWalletHistory().then(setHistory).catch(()=>setHistory([]));
  },[action]);

  const balance=Number(server?.wallets?.[currency]?.availableBalance||0);
  const numericAmount=useMemo(()=>Number(String(amount).replace(',','.')),[amount]);
  const validOutgoing=Number.isFinite(numericAmount)&&numericAmount>0&&numericAmount<=balance;
  const validDeposit=Number.isFinite(numericAmount)&&numericAmount>0;
  const normalizedPhone=phone.replace(/[^+\d]/g,'');
  const mobileReady=depositRail==='mobile_money'&&!!network&&/^\+?\d{9,15}$/.test(normalizedPhone)&&validDeposit;
  const bankReady=depositRail==='bank'&&bank.length>=2&&validDeposit;

  const lookupRecipient=async()=>{
    if(!destination.trim()||!validOutgoing)return;
    setBusy(true);
    try{const found=await agentWalletService.lookupMarketCashRecipient(destination.trim());setRecipient(found);setStep('review');}
    catch(e:any){toast.error(e?.message||'Bénéficiaire Market-Cash introuvable.');}
    finally{setBusy(false)}
  };

  const executeTransfer=async()=>{
    if(!recipient||!pin||!validOutgoing)return;
    setBusy(true);
    try{const res=await agentWalletService.transferMarketCash({marketCashId:recipient.marketCashId,currency,amount:numericAmount,pin,idempotencyKey:makeKey('transfer')});toast.success(`Transfert réussi • ${res.reference}`);setStep('done');await refreshWallet();}
    catch(e:any){toast.error(e?.message||'Transfert refusé.');}
    finally{setBusy(false)}
  };

  const executeCardTopup=async()=>{
    if(!selectedCard||!pin||!validOutgoing)return;
    setBusy(true);
    try{const res=await agentWalletService.fundInternalCard({cardId:selectedCard,currency,amount:numericAmount,pin,idempotencyKey:makeKey('card')});toast.success(`Carte rechargée • ${res.reference}`);setAmount('');setPin('');await refreshWallet();setCards(await agentWalletService.getMyInternalCards());}
    catch(e:any){toast.error(e?.message||'Recharge de carte refusée.');}
    finally{setBusy(false)}
  };

  const startDeposit=(rail:Exclude<DepositRail,null>)=>{setDepositRail(rail);setDepositStep('details');setNetwork('');setPhone('');setBank('');setAmount('');setDepositResult(null)};
  const confirmDeposit=async()=>{
    if(!(mobileReady||bankReady)||!depositRail)return;
    setBusy(true);setDepositStep('processing');
    try{
      const result=await agentWalletService.createWalletDeposit({rail:depositRail,currency,amount:numericAmount,network:depositRail==='mobile_money'?network:undefined,phone:depositRail==='mobile_money'?normalizedPhone:undefined,bank:depositRail==='bank'?bank:undefined,idempotencyKey:makeKey('deposit')});
      setDepositResult(result);setDepositStep('done');
      if(result.status==='pending_user_confirmation'||result.pushRequested)toast.success('Demande envoyée. Confirmez maintenant sur votre téléphone.');
      else if(result.status==='awaiting_mht_configuration')toast('Parcours prêt. La connexion MHT APIs doit encore être activée pour déclencher le push opérateur.',{icon:'🛡️',duration:7000});
      else toast.success('Demande de recharge créée.');
    }catch(e:any){setDepositStep('review');toast.error(e?.message||'Impossible de lancer la recharge. Aucun montant n’a été débité.');}
    finally{setBusy(false)}
  };

  return <div className="mx-auto max-w-xl p-4 md:p-8 pb-28"><Link to="/client/home" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft size={16}/> Retour à l'accueil</Link><section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm"><div className="flex items-start justify-between"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-900"><Icon size={24}/></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{currency}</span></div><h1 className="mt-4 text-2xl font-black text-slate-950">{meta[action].title}</h1><p className="mt-1 text-sm text-slate-500">Solde portefeuille : <b>{fmt(balance,currency)}</b></p>

  {action==='send'&&<div className="mt-6 space-y-4">
    {step==='channels'&&<><p className="text-sm font-black text-slate-700">Choisir la destination</p><button onClick={()=>setStep('form')} className="w-full rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 text-left flex justify-between items-center"><span><WalletCards className="inline mr-3 text-blue-800"/><b>Vers Market-Cash</b><small className="block ml-9 mt-1 text-slate-500">Transfert direct vers le portefeuille principal d'un autre utilisateur.</small></span><ChevronRight/></button><div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">Mobile Money et banque sont réservés aux intégrations MHT APIs. Le portefeuille principal reste limité aux transferts internes Market-Cash.</div></>}
    {step==='form'&&<><label className="text-xs font-black uppercase text-slate-500">ID Market-Cash du bénéficiaire</label><input value={destination} onChange={e=>setDestination(e.target.value.toUpperCase())} placeholder="Ex. MCW-12AB34CD56" className="w-full rounded-2xl border p-4 font-mono"/><label className="text-xs font-black uppercase text-slate-500">Montant</label><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={`Montant en ${currency}`} className="w-full rounded-2xl border p-4"/>{numericAmount>balance&&<p className="text-xs font-bold text-red-600">Solde insuffisant.</p>}<button disabled={!destination.trim()||!validOutgoing||busy} onClick={lookupRecipient} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">{busy?'Vérification…':'Continuer'}</button></>}
    {step==='review'&&recipient&&<><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Bénéficiaire</p><p className="mt-1 text-lg font-black text-slate-900">{recipient.displayName}</p><p className="font-mono text-sm text-slate-500">{recipient.marketCashId}</p><div className="mt-4 border-t pt-3 flex justify-between"><span>Montant</span><b>{fmt(numericAmount,currency)}</b></div></div><button onClick={()=>setStep('pin')} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white">Envoyer</button><button onClick={()=>setStep('form')} className="w-full py-2 text-sm font-bold text-slate-500">Modifier</button></>}
    {step==='pin'&&<><div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Confirmez avec votre code secret Market-Cash.</div><input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} inputMode="numeric" type="password" placeholder="Code secret" className="w-full rounded-2xl border p-4 text-center tracking-[.4em]"/><button disabled={!pin||busy} onClick={executeTransfer} className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-40">{busy?'Traitement…':'Confirmer le transfert'}</button></>}
    {step==='done'&&<div className="rounded-3xl bg-emerald-50 p-6 text-center"><p className="text-3xl">✓</p><h2 className="mt-2 text-lg font-black text-emerald-900">Transfert terminé</h2><p className="mt-1 text-sm text-emerald-700">Le portefeuille du bénéficiaire a été crédité directement.</p></div>}
  </div>}

  {action==='top-up'&&<div className="mt-6 space-y-4">
    {depositStep==='source'&&<><p className="text-sm font-black text-slate-700">D'où vient l'argent ?</p><p className="text-xs text-slate-500">La recharge crédite uniquement le portefeuille principal. Jamais une carte directement.</p><button onClick={()=>startDeposit('mobile_money')} className="w-full rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 flex justify-between items-center text-left"><span><Smartphone className="inline mr-3 text-blue-700"/><b>Mobile Money</b><small className="block ml-9 mt-1 text-slate-500">M-Pesa, Airtel Money, Orange Money, Afrimoney.</small></span><ChevronRight/></button><button onClick={()=>startDeposit('bank')} className="w-full rounded-2xl border p-4 flex justify-between items-center text-left"><span><Building2 className="inline mr-3 text-violet-700"/><b>Banque</b><small className="block ml-9 mt-1 text-slate-500">Partenaire bancaire via MHT APIs.</small></span><ChevronRight/></button></>}
    {depositStep==='details'&&depositRail==='mobile_money'&&<><label className="text-xs font-black uppercase text-slate-500">Réseau Mobile Money</label><div className="grid grid-cols-2 gap-2">{mobileProviders.map(p=><button key={p} onClick={()=>setNetwork(p)} className={`rounded-2xl border p-3 text-sm font-black ${network===p?'border-blue-700 bg-blue-50 text-blue-900':'text-slate-700'}`}>{p}</button>)}</div><label className="text-xs font-black uppercase text-slate-500">Numéro d'où vient l'argent</label><input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" placeholder="Ex. +243 82 000 0000" className="w-full rounded-2xl border p-4"/><label className="text-xs font-black uppercase text-slate-500">Montant à recharger</label><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={`Montant en ${currency}`} className="w-full rounded-2xl border p-4"/><button disabled={!mobileReady} onClick={()=>setDepositStep('review')} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">Continuer</button></>}
    {depositStep==='details'&&depositRail==='bank'&&<><label className="text-xs font-black uppercase text-slate-500">Mode bancaire</label><div className="space-y-2">{bankOptions.map(p=><button key={p} onClick={()=>setBank(p)} className={`w-full rounded-2xl border p-4 text-left font-black ${bank===p?'border-violet-700 bg-violet-50':'border-slate-200'}`}>{p}</button>)}</div><label className="text-xs font-black uppercase text-slate-500">Montant à recharger</label><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={`Montant en ${currency}`} className="w-full rounded-2xl border p-4"/><button disabled={!bankReady} onClick={()=>setDepositStep('review')} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">Continuer</button></>}
    {depositStep==='review'&&depositRail&&<><div className="rounded-2xl bg-slate-50 p-4 space-y-3"><p className="text-xs font-black uppercase text-slate-400">Récapitulatif</p><div className="flex justify-between"><span>Source</span><b>{depositRail==='mobile_money'?network:bank}</b></div>{depositRail==='mobile_money'&&<div className="flex justify-between gap-4"><span>Numéro</span><b>{normalizedPhone}</b></div>}<div className="flex justify-between"><span>Montant</span><b>{fmt(numericAmount,currency)}</b></div><div className="border-t pt-3 text-xs text-slate-500">Après confirmation, Market-Cash transmet la demande à MHT APIs. Pour Mobile Money, l'opérateur envoie ensuite son propre push de confirmation sur ce numéro. Le portefeuille n'est crédité qu'après confirmation positive du partenaire.</div></div><button disabled={busy} onClick={confirmDeposit} className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-40">Confirmer la recharge</button><button onClick={()=>setDepositStep('details')} className="w-full py-2 text-sm font-bold text-slate-500">Modifier</button></>}
    {depositStep==='processing'&&<div className="rounded-3xl bg-blue-50 p-6 text-center"><div className="mx-auto h-9 w-9 rounded-full border-4 border-blue-200 border-t-blue-800 animate-spin"/><h2 className="mt-4 font-black text-blue-950">Transmission sécurisée</h2><p className="mt-2 text-sm text-blue-800">Market-Cash → MHT APIs → partenaire. Aucun solde n'est modifié avant confirmation.</p></div>}
    {depositStep==='done'&&depositResult&&<div className="rounded-3xl bg-emerald-50 p-6"><p className="text-3xl">✓</p><h2 className="mt-2 text-lg font-black text-emerald-900">Demande de recharge créée</h2>{depositResult.status==='pending_user_confirmation'||depositResult.pushRequested?<p className="mt-2 text-sm text-emerald-800">Regardez maintenant votre téléphone : votre opérateur Mobile Money doit afficher une demande de confirmation. Entrez votre code secret uniquement dans l'interface officielle de l'opérateur.</p>:depositResult.status==='awaiting_mht_configuration'?<p className="mt-2 text-sm text-amber-800">Le parcours Market-Cash est prêt, mais MHT APIs n'est pas encore configuré sur le backend de production. Aucun argent n'a été débité.</p>:<p className="mt-2 text-sm text-emerald-800">La demande est en cours chez le partenaire. Le portefeuille sera crédité uniquement après succès confirmé.</p>}<p className="mt-4 text-xs font-mono text-emerald-700">Réf. {depositResult.requestId}</p><button onClick={()=>{setDepositStep('source');setDepositRail(null);setDepositResult(null)}} className="mt-5 rounded-xl bg-emerald-700 px-5 py-3 font-black text-white">Nouvelle recharge</button></div>}
  </div>}

  {action==='card-topup'&&<div className="mt-6 space-y-4"><p className="text-xs text-slate-500">Débit du portefeuille principal → crédit de la carte interne Market-Cash. La Visa virtuelle reste séparée.</p>{cards.length===0?<div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Aucune carte interne Market-Cash active disponible.</div>:<><label className="text-xs font-black uppercase text-slate-500">Choisir la carte</label><div className="space-y-2">{cards.map(c=><button key={c.cardId} onClick={()=>setSelectedCard(c.cardId)} className={`w-full rounded-2xl border p-4 text-left ${selectedCard===c.cardId?'border-blue-700 bg-blue-50':'border-slate-200'}`}><b>{c.cardHolder||'Carte Market-Cash'}</b><span className="block text-xs font-mono text-slate-500">{c.cardIdentifier} • {c.maskedNumber}</span><span className="block mt-1 text-xs text-slate-500">Solde carte : {fmt(Number(c.balances?.[currency]||0),currency)}</span></button>)}</div><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={`Montant en ${currency}`} className="w-full rounded-2xl border p-4"/><input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} inputMode="numeric" type="password" placeholder="Code secret Market-Cash" className="w-full rounded-2xl border p-4 text-center"/><button disabled={!selectedCard||!validOutgoing||!pin||busy} onClick={executeCardTopup} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">{busy?'Traitement…':'Confirmer la recharge'}</button></>}</div>}

  {action==='receive'&&<div className="mt-6 text-center">{identity?<><div className="inline-block rounded-3xl border p-4"><QRCodeSVG value={`MARKET-CASH:${identity}`} size={180}/></div><p className="mt-4 font-mono text-lg font-black text-blue-950">{identity}</p><p className="mt-1 text-sm text-slate-500">Partagez cet ID pour recevoir un transfert Market-Cash.</p></>:<p className="text-sm text-slate-500">Création de votre identifiant Market-Cash…</p>}</div>}

  {action==='transactions'&&<div className="mt-6 space-y-2">{history.length===0?<div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">Aucune opération enregistrée.</div>:history.map((t:any)=><div key={t.id||t.reference} className="rounded-2xl border p-4"><div className="flex justify-between gap-3"><div><b className="text-slate-900">{t.type==='local_transfer'?'Transfert Market-Cash':t.type==='wallet_to_card'?'Recharge carte':t.type==='wallet_deposit'?'Recharge portefeuille':t.type||'Opération'}</b><p className="text-xs text-slate-500">{t.reference}</p></div><b className="text-blue-950">{fmt(Number(t.amount||0),t.currency||currency)}</b></div><p className="mt-2 text-[11px] text-slate-400">{t.createdAt?new Date(t.createdAt).toLocaleString('fr-FR'):''}</p></div>)}</div>}

  {(action==='withdraw'||action==='pay'||action==='exchange')&&<div className="mt-6 rounded-2xl bg-slate-50 p-5"><h2 className="font-black text-slate-900">Action non disponible depuis le portefeuille principal</h2><p className="mt-2 text-sm text-slate-500">Le portefeuille principal sert à recevoir des recharges, envoyer vers un autre portefeuille Market-Cash et alimenter les cartes internes.</p></div>}
  </section></div>
}
