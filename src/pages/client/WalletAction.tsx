import React,{useEffect,useMemo,useState}from'react';
import{ArrowDownLeft,ArrowLeft,Building2,ChevronRight,CreditCard,Eye,EyeOff,History,QrCode,Send,Smartphone,WalletCards}from'lucide-react';
import{Link,useSearchParams}from'react-router-dom';
import{QRCodeSVG}from'qrcode.react';
import toast from'react-hot-toast';
import SecurityConfirmModal from'../../components/SecurityConfirmModal';
import{useSensitiveReveal}from'../../hooks/useSensitiveReveal';
import{agentWalletService,MarketCashRecipient,WalletDepositRequest,WalletServerSnapshot}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

type Action='send'|'receive'|'transactions'|'top-up'|'card-topup'|'withdraw'|'pay'|'exchange';
type SendStep='channels'|'form'|'review'|'cvv'|'done';
type DepositRail='mobile_money'|'bank'|null;
type DepositStep='source'|'details'|'review'|'processing'|'done';
const meta={send:{title:'Envoyer',icon:Send},receive:{title:'Recevoir',icon:ArrowDownLeft},transactions:{title:'Historique',icon:History},'top-up':{title:'Recharger le portefeuille',icon:ArrowDownLeft},'card-topup':{title:'Recharger ma carte locale',icon:CreditCard},withdraw:{title:'Retrait',icon:ArrowDownLeft},pay:{title:'Paiement',icon:WalletCards},exchange:{title:'Conversion',icon:ArrowDownLeft}};
const mobileProviders=['M-Pesa','Airtel Money','Orange Money','Afrimoney'];
const bankOptions=['Banque partenaire','Virement bancaire'];
const fmt=(v:number,c:WalletCurrency)=>c==='CDF'?`${Number(v||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(v||0).toFixed(2)} USD`;
const makeKey=(prefix:string)=>`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;

export default function WalletAction({action}:{action:Action}){
  const[params]=useSearchParams();
  const currency=(params.get('currency')==='CDF'?'CDF':'USD')as WalletCurrency;
  const[server,setServer]=useState<WalletServerSnapshot|null>(null);
  const[identity,setIdentity]=useState('');
  const[amount,setAmount]=useState('');
  const[destination,setDestination]=useState('');
  const[recipient,setRecipient]=useState<MarketCashRecipient|null>(null);
  const[cvv,setCvv]=useState('');
  const[step,setStep]=useState<SendStep>('channels');
  const[busy,setBusy]=useState(false);
  const[history,setHistory]=useState<any[]>([]);
  const[depositRail,setDepositRail]=useState<DepositRail>(null);
  const[depositStep,setDepositStep]=useState<DepositStep>('source');
  const[network,setNetwork]=useState('');
  const[phone,setPhone]=useState('');
  const[bank,setBank]=useState('');
  const[depositResult,setDepositResult]=useState<WalletDepositRequest|null>(null);
  const secure=useSensitiveReveal(90000);
  const Icon=meta[action].icon;

  const refreshWallet=async()=>setServer(await agentWalletService.getMyWallets());
  useEffect(()=>{refreshWallet().catch(()=>{});agentWalletService.getMyMarketCashIdentity().then(x=>setIdentity(x.marketCashId)).catch(()=>{});if(action==='transactions')agentWalletService.getMyWalletHistory().then(setHistory).catch(()=>setHistory([]))},[action]);

  const balance=Number(server?.wallets?.[currency]?.availableBalance||0);
  const numericAmount=useMemo(()=>Number(String(amount).replace(',','.')),[amount]);
  const validOutgoing=Number.isFinite(numericAmount)&&numericAmount>0&&numericAmount<=balance;
  const validDeposit=Number.isFinite(numericAmount)&&numericAmount>0;
  const normalizedPhone=phone.replace(/[^+\d]/g,'');
  const mobileReady=depositRail==='mobile_money'&&!!network&&/^\+?\d{9,15}$/.test(normalizedPhone)&&validDeposit;
  const bankReady=depositRail==='bank'&&bank.length>=2&&validDeposit;

  const lookupRecipient=async()=>{if(!destination.trim()||!validOutgoing)return;setBusy(true);try{const found=await agentWalletService.lookupMarketCashRecipient(destination.trim());setRecipient(found);setStep('review')}catch(e:any){toast.error(e?.message||'Bénéficiaire Market-Cash introuvable.')}finally{setBusy(false)}};
  const executeTransfer=async()=>{if(!recipient||cvv.length!==3||!validOutgoing)return;setBusy(true);try{const res=await agentWalletService.transferMarketCash({marketCashId:recipient.marketCashId,currency,amount:numericAmount,cvv,idempotencyKey:makeKey('transfer')});toast.success(`Transfert réussi • ${res.reference}`);setCvv('');setStep('done');await refreshWallet()}catch(e:any){toast.error(e?.message||'Transfert refusé. Vérifiez votre CVV.')}finally{setBusy(false)}};
  const startDeposit=(rail:Exclude<DepositRail,null>)=>{setDepositRail(rail);setDepositStep('details');setNetwork('');setPhone('');setBank('');setAmount('');setDepositResult(null)};
  const confirmDeposit=async()=>{if(!(mobileReady||bankReady)||!depositRail)return;setBusy(true);setDepositStep('processing');try{const result=await agentWalletService.createWalletDeposit({rail:depositRail,currency,amount:numericAmount,network:depositRail==='mobile_money'?network:undefined,phone:depositRail==='mobile_money'?normalizedPhone:undefined,bank:depositRail==='bank'?bank:undefined,idempotencyKey:makeKey('deposit')});setDepositResult(result);setDepositStep('done');if(result.status==='pending_user_confirmation'||result.pushRequested)toast.success('Demande envoyée. Confirmez maintenant sur votre téléphone.');else if(result.status==='awaiting_mht_configuration')toast('Parcours prêt. La connexion MHT APIs doit encore être activée pour déclencher le push opérateur.',{icon:'🛡️',duration:7000});else toast.success('Demande de recharge créée.')}catch(e:any){setDepositStep('review');toast.error(e?.message||'Impossible de lancer la recharge. Aucun montant n’a été débité.')}finally{setBusy(false)}};

  return <div className="mx-auto max-w-xl p-4 pb-28 md:p-8">
    <Link to="/client/home" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft size={16}/>Retour à l'accueil</Link>
    <section className="mt-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex items-start justify-between"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-900"><Icon size={24}/></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{currency}</span></div>
      <h1 className="mt-4 text-2xl font-black text-slate-950">{meta[action].title}</h1>
      <div className="mt-2 flex items-center gap-2 text-sm text-slate-500"><span>Solde portefeuille :</span><b>{secure.revealed?fmt(balance,currency):'••••••'}</b><button onClick={secure.request} className="grid h-8 w-8 place-items-center rounded-xl bg-slate-100 text-blue-950" aria-label="Afficher ou masquer le solde">{secure.revealed?<EyeOff size={16}/>:<Eye size={16}/>}</button></div>

      {action==='send'&&<div className="mt-6 space-y-4">
        {step==='channels'&&<><p className="text-sm font-black text-slate-700">Choisir la destination</p><button onClick={()=>setStep('form')} className="flex w-full items-center justify-between rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 text-left"><span><WalletCards className="mr-3 inline text-blue-800"/><b>Vers un Wallet Market-Cash</b><small className="ml-9 mt-1 block text-slate-500">Utilisez l'identifiant MCW du bénéficiaire.</small></span><ChevronRight/></button></>}
        {step==='form'&&<><label className="text-xs font-black uppercase text-slate-500">ID Wallet bénéficiaire</label><input value={destination} onChange={e=>setDestination(e.target.value.toUpperCase())} placeholder="Ex. MCW-123456M" className="w-full rounded-2xl border p-4 font-mono"/><label className="text-xs font-black uppercase text-slate-500">Montant</label><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={`Montant en ${currency}`} className="w-full rounded-2xl border p-4"/>{numericAmount>balance&&<p className="text-xs font-bold text-red-600">Solde insuffisant.</p>}<button disabled={!destination.trim()||!validOutgoing||busy} onClick={lookupRecipient} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">{busy?'Vérification…':'Continuer'}</button></>}
        {step==='review'&&recipient&&<><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Bénéficiaire</p><p className="mt-1 text-lg font-black text-slate-900">{recipient.displayName}</p><p className="font-mono text-sm text-slate-500">{recipient.marketCashId}</p><div className="mt-4 flex justify-between border-t pt-3"><span>Montant</span><b>{fmt(numericAmount,currency)}</b></div></div><button onClick={()=>setStep('cvv')} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white">Envoyer</button><button onClick={()=>setStep('form')} className="w-full py-2 text-sm font-bold text-slate-500">Modifier</button></>}
        {step==='cvv'&&<><div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><b>Confirmation financière :</b> saisissez votre CVV Market-Cash à 3 chiffres. Votre code secret de l'application n'est jamais utilisé pour valider une transaction.</div><input value={cvv} onChange={e=>setCvv(e.target.value.replace(/\D/g,'').slice(0,3))} inputMode="numeric" type="password" autoComplete="off" placeholder="•••" className="w-full rounded-2xl border-2 p-4 text-center text-2xl font-black tracking-[.45em]"/><button disabled={cvv.length!==3||busy} onClick={executeTransfer} className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-40">{busy?'Traitement…':'Confirmer le transfert'}</button></>}
        {step==='done'&&<div className="rounded-3xl bg-emerald-50 p-6 text-center"><p className="text-3xl">✓</p><h2 className="mt-2 text-lg font-black text-emerald-900">Transfert terminé</h2><p className="mt-1 text-sm text-emerald-700">Le Wallet du bénéficiaire a été crédité.</p></div>}
      </div>}

      {action==='receive'&&<div className="mt-6">{secure.revealed?<div className="rounded-3xl bg-slate-50 p-5 text-center"><div className="mx-auto inline-block rounded-3xl bg-white p-4 shadow-sm">{identity?<QRCodeSVG value={`MARKET-CASH-WALLET:${identity}`} size={190}/>:<div className="grid h-[190px] w-[190px] place-items-center text-slate-400">Chargement…</div>}</div><p className="mt-4 text-xs font-black uppercase text-slate-400">Votre ID Wallet</p><p className="mt-1 font-mono text-xl font-black text-blue-950">{identity||'—'}</p><p className="mt-2 text-xs text-slate-500">Partagez cet ID pour recevoir un transfert Market-Cash.</p></div>:<button onClick={secure.request} className="w-full rounded-3xl border border-blue-200 bg-blue-50 p-6 text-center text-blue-950"><QrCode className="mx-auto"/><b className="mt-3 block">Afficher mon ID et mon QR</b><span className="mt-1 block text-xs text-blue-700">Code secret de l'application requis.</span></button>}</div>}

      {action==='transactions'&&<div className="mt-6">{!secure.revealed?<button onClick={secure.request} className="w-full rounded-3xl border bg-slate-50 p-6 text-center"><History className="mx-auto text-blue-800"/><b className="mt-3 block">Afficher mon historique</b><span className="mt-1 block text-xs text-slate-500">Protégé par le code secret de l'application.</span></button>:<div className="space-y-3">{history.length===0?<div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">Aucune transaction.</div>:history.map((t:any)=><div key={t.id||t.reference} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><b className="text-sm">{String(t.type||'Transaction').replaceAll('_',' ')}</b><p className="mt-1 font-mono text-[10px] text-slate-400">{t.reference||t.id}</p></div><b>{fmt(Number(t.amount||0),t.currency==='CDF'?'CDF':'USD')}</b></div><p className="mt-2 text-[10px] text-slate-400">{t.createdAt?new Date(t.createdAt).toLocaleString('fr-FR'):'—'}</p></div>)}</div>}</div>}

      {action==='top-up'&&<div className="mt-6 space-y-4">
        {depositStep==='source'&&<><p className="text-sm font-black text-slate-700">D'où vient l'argent ?</p><p className="text-xs text-slate-500">La recharge crédite uniquement le portefeuille principal après confirmation du partenaire.</p><button onClick={()=>startDeposit('mobile_money')} className="flex w-full items-center justify-between rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 text-left"><span><Smartphone className="mr-3 inline text-blue-700"/><b>Mobile Money</b><small className="ml-9 mt-1 block text-slate-500">M-Pesa, Airtel Money, Orange Money, Afrimoney.</small></span><ChevronRight/></button><button onClick={()=>startDeposit('bank')} className="flex w-full items-center justify-between rounded-2xl border p-4 text-left"><span><Building2 className="mr-3 inline text-violet-700"/><b>Banque</b><small className="ml-9 mt-1 block text-slate-500">Partenaire bancaire via MHT APIs.</small></span><ChevronRight/></button></>}
        {depositStep==='details'&&depositRail==='mobile_money'&&<><label className="text-xs font-black uppercase text-slate-500">Réseau Mobile Money</label><div className="grid grid-cols-2 gap-2">{mobileProviders.map(p=><button key={p} onClick={()=>setNetwork(p)} className={`rounded-2xl border p-3 text-sm font-black ${network===p?'border-blue-700 bg-blue-50 text-blue-900':'text-slate-700'}`}>{p}</button>)}</div><label className="text-xs font-black uppercase text-slate-500">Numéro source</label><input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" placeholder="Ex. +243 82 000 0000" className="w-full rounded-2xl border p-4"/><label className="text-xs font-black uppercase text-slate-500">Montant</label><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={`Montant en ${currency}`} className="w-full rounded-2xl border p-4"/><button disabled={!mobileReady} onClick={()=>setDepositStep('review')} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">Continuer</button></>}
        {depositStep==='details'&&depositRail==='bank'&&<><label className="text-xs font-black uppercase text-slate-500">Mode bancaire</label><div className="space-y-2">{bankOptions.map(p=><button key={p} onClick={()=>setBank(p)} className={`w-full rounded-2xl border p-4 text-left font-black ${bank===p?'border-violet-700 bg-violet-50':'border-slate-200'}`}>{p}</button>)}</div><label className="text-xs font-black uppercase text-slate-500">Montant</label><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={`Montant en ${currency}`} className="w-full rounded-2xl border p-4"/><button disabled={!bankReady} onClick={()=>setDepositStep('review')} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">Continuer</button></>}
        {depositStep==='review'&&depositRail&&<><div className="space-y-3 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Récapitulatif</p><div className="flex justify-between"><span>Source</span><b>{depositRail==='mobile_money'?network:bank}</b></div>{depositRail==='mobile_money'&&<div className="flex justify-between gap-4"><span>Numéro</span><b>{normalizedPhone}</b></div>}<div className="flex justify-between"><span>Montant</span><b>{fmt(numericAmount,currency)}</b></div></div><button disabled={busy} onClick={confirmDeposit} className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-40">Confirmer la demande</button><button onClick={()=>setDepositStep('details')} className="w-full py-2 text-sm font-bold text-slate-500">Modifier</button></>}
        {depositStep==='processing'&&<div className="rounded-3xl bg-blue-50 p-6 text-center"><div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-blue-200 border-t-blue-800"/><h2 className="mt-4 font-black text-blue-950">Transmission sécurisée</h2><p className="mt-2 text-sm text-blue-800">Market-Cash → MHT APIs → partenaire.</p></div>}
        {depositStep==='done'&&depositResult&&<div className="rounded-3xl bg-emerald-50 p-6"><p className="text-3xl">✓</p><h2 className="mt-2 text-lg font-black text-emerald-900">Demande créée</h2><p className="mt-2 text-sm text-emerald-800">Le portefeuille sera crédité uniquement après succès confirmé par le partenaire.</p><p className="mt-4 font-mono text-xs text-emerald-700">Réf. {depositResult.requestId}</p><button onClick={()=>{setDepositStep('source');setDepositRail(null);setDepositResult(null)}} className="mt-5 rounded-xl bg-emerald-700 px-5 py-3 font-black text-white">Nouvelle recharge</button></div>}
      </div>}

      {action==='card-topup'&&<div className="mt-6 rounded-3xl bg-blue-50 p-5"><p className="text-sm text-blue-900">La carte locale est unique. Vous serez envoyé directement vers sa recharge, sans écran de choix.</p><Link to={`/client/cards?card=local&action=topup&currency=${currency}`} className="mt-4 block rounded-2xl bg-blue-950 py-4 text-center font-black text-white">Recharger ma carte locale</Link></div>}
      {action==='withdraw'&&<div className="mt-6 rounded-3xl bg-slate-50 p-5"><p className="text-sm text-slate-600">Les retraits sont débités de la carte locale auprès d'un Agent Market-Cash et confirmés avec le CVV de la carte locale.</p><Link to={`/client/wallet/withdraw?currency=${currency}`} className="mt-4 block rounded-2xl bg-blue-950 py-4 text-center font-black text-white">Continuer vers le retrait</Link></div>}
      {action==='pay'&&<div className="mt-6 rounded-3xl bg-slate-50 p-5"><p className="text-sm text-slate-600">Le paiement marchand utilise la carte locale et son CVV à 3 chiffres.</p><Link to={`/client/wallet/pay?currency=${currency}`} className="mt-4 block rounded-2xl bg-blue-950 py-4 text-center font-black text-white">Payer un marchand</Link></div>}
      {action==='exchange'&&<div className="mt-6 rounded-3xl bg-slate-50 p-6 text-center text-sm text-slate-500">La conversion USD/CDF sera activée avec le moteur de change Market-Cash. Aucun débit n'est exécuté sur cet écran.</div>}
    </section>
    <SecurityConfirmModal open={secure.open} busy={secure.busy} onClose={secure.close} onConfirm={secure.confirm} title="Accès protégé" subtitle="Entrez le code secret de l'application pour afficher les informations sensibles. Ce code ne confirme aucune transaction."/>
  </div>;
}
