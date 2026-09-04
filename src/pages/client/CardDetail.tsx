import React,{useEffect,useMemo,useState}from'react';
import{ArrowLeft,Banknote,Eye,EyeOff,History,RefreshCw,ShieldCheck,Store,WalletCards}from'lucide-react';
import{Link}from'react-router-dom';
import toast from'react-hot-toast';
import CardProductFace,{CardProductVariant}from'../../components/CardProductFace';
import SecurityConfirmModal from'../../components/SecurityConfirmModal';
import{agentWalletService,InternalCardSummary,LocalCardSecureData}from'../../services/agentWalletService';
import{cardSecurityService,VisaCardSummary,VisaSecureData}from'../../services/cardSecurityService';
import{useAuthStore}from'../../store/authStore';
import{WalletCurrency}from'../../types/wallet';

interface CardDetailProps{kind:CardProductVariant;cardId?:string|null}
const money=(value:number,currency:WalletCurrency)=>currency==='CDF'?`${Number(value||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(value||0).toFixed(2)} USD`;
const transactionLabel=(type:string)=>{const n=String(type||'').toLowerCase();if(n.includes('wallet_to_local_card')||n.includes('cardtopup'))return'Recharge';if(n.includes('merchant'))return'Paiement marchand';if(n.includes('cash_out')||n.includes('cashout')||n.includes('withdraw'))return'Retrait Agent';if(n.includes('refund'))return'Remboursement';return'Opération carte'};
const isDebit=(type:string)=>{const n=String(type||'').toLowerCase();return n.includes('merchant')||n.includes('cash_out')||n.includes('cashout')||n.includes('withdraw')};
const belongsToCard=(transaction:any,cardId?:string|null)=>{if(!cardId)return false;const direct=[transaction?.cardId,transaction?.sourceCardId,transaction?.destinationCardId].filter(Boolean).map(String);if(direct.includes(cardId))return true;return[transaction?.cardWalletId,transaction?.sourceCardWalletId,transaction?.destinationCardWalletId].filter(Boolean).map(String).some(v=>v.includes(cardId))};
type SecurityAction='balance'|'details'|'history'|null;

export default function CardDetail({kind,cardId}:CardDetailProps){
  const{user}=useAuthStore();
  const[currency,setCurrency]=useState<WalletCurrency>('USD');
  const[showBalance,setShowBalance]=useState(false);
  const[showHistory,setShowHistory]=useState(false);
  const[detailsRevealed,setDetailsRevealed]=useState(false);
  const[standardSide,setStandardSide]=useState<'front'|'back'>('front');
  const[localCard,setLocalCard]=useState<InternalCardSummary|null>(null);
  const[localSecure,setLocalSecure]=useState<LocalCardSecureData|null>(null);
  const[visaCard,setVisaCard]=useState<VisaCardSummary|null>(null);
  const[visaSecure,setVisaSecure]=useState<VisaSecureData|null>(null);
  const[transactions,setTransactions]=useState<any[]>([]);
  const[loading,setLoading]=useState(true);
  const[securityAction,setSecurityAction]=useState<SecurityAction>(null);
  const[securityBusy,setSecurityBusy]=useState(false);

  useEffect(()=>{let active=true;(async()=>{if(!user?.uid)return;setLoading(true);try{
    if(kind==='local'){await agentWalletService.ensureLocalCard();const cards=await agentWalletService.getMyInternalCards();if(active)setLocalCard(cards.find(card=>!cardId||card.cardId===cardId)||cards[0]||null)}
    else if(cardId){const cards=await cardSecurityService.getMyVisaCards();const candidate=cards.find(card=>card.cardId===cardId&&card.tier===(kind==='gold'?'gold':'standard'))||null;if(active)setVisaCard(candidate)}
    const history=await agentWalletService.getMyWalletHistory().catch(()=>[]as any[]);if(active)setTransactions(Array.isArray(history)?history:[]);
  }catch(error){console.warn('[CARD_DETAIL_LOAD_ERROR]',error)}finally{if(active)setLoading(false)}})();return()=>{active=false}},[user?.uid,kind,cardId]);

  const activeCardId=kind==='local'?localCard?.cardId:visaCard?.cardId||cardId||null;
  const cardHistory=useMemo(()=>transactions.filter(tx=>belongsToCard(tx,activeCardId)).slice(0,30),[transactions,activeCardId]);
  const localBalance=Number(localCard?.balances?.[currency]||0);
  const visaBalance=visaSecure?.balances?.[currency];
  const holder=kind==='local'?localSecure?.cardHolder||localCard?.cardHolder||user?.displayName:visaSecure?.cardHolder||visaCard?.cardHolder||user?.displayName;
  const number=kind==='local'?localSecure?.cardNumber||localCard?.maskedNumber:visaSecure?.cardNumber||visaCard?.maskedNumber;
  const expiryStart=kind==='local'?localSecure?.expiryStart||localCard?.expiryStart:visaSecure?.expiryStart;
  const expiryEnd=kind==='local'?localSecure?.expiryEnd||localCard?.expiryEnd:visaSecure?.expiryEnd;
  const cvv=kind==='local'?localSecure?.cvv:visaSecure?.cvv;
  const cardExists=kind==='local'?!!localCard:!!visaCard;

  const requestBalance=()=>{if(showBalance){setShowBalance(false);return}setSecurityAction('balance')};
  const requestHistory=()=>{if(showHistory){setShowHistory(false);return}setSecurityAction('history')};
  const requestDetails=()=>{if(detailsRevealed){setDetailsRevealed(false);setLocalSecure(null);setVisaSecure(null);return}setSecurityAction('details')};
  const confirmSecurity=async(pin:string)=>{if(!securityAction)return;setSecurityBusy(true);try{
    if(securityAction==='details'||securityAction==='balance'){
      if(kind==='local'){const secure=await agentWalletService.revealLocalCardSecureData(pin);setLocalSecure(secure)}
      else if(cardId){const secure=await cardSecurityService.revealVisaCard(cardId,pin);setVisaSecure(secure)}
      else throw new Error('Carte Visa indisponible.');
    }else await agentWalletService.verifyApplicationSecret(pin);
    if(securityAction==='details')setDetailsRevealed(true);if(securityAction==='balance')setShowBalance(true);if(securityAction==='history')setShowHistory(true);setSecurityAction(null);
  }catch(error:any){toast.error(error?.message||'Code secret incorrect.')}finally{setSecurityBusy(false)}};

  return <div className="mx-auto max-w-4xl px-3.5 pb-28 pt-4 sm:px-6">
    <Link to="/client/cards" className="inline-flex items-center gap-2 text-sm font-black text-slate-500"><ArrowLeft size={17}/>Mes cartes</Link>
    <div className="mx-auto mt-5 max-w-xl">{loading?<div className="grid aspect-[1.586/1] place-items-center rounded-[1.65rem] bg-slate-100 text-slate-400"><RefreshCw className="animate-spin" size={24}/></div>:cardExists?<CardProductFace variant={kind} holder={holder} number={number} expiryStart={expiryStart} expiryEnd={expiryEnd} cvv={cvv} revealed={detailsRevealed} side={standardSide} onToggleReveal={requestDetails} onFlip={kind==='standard'?()=>setStandardSide(side=>side==='front'?'back':'front'):undefined}/>:<div className="rounded-3xl border border-dashed bg-white p-8 text-center"><p className="font-black text-slate-900">Carte indisponible</p><p className="mt-2 text-sm text-slate-500">Cette carte n'est pas encore attribuée à votre compte.</p></div>}</div>

    {cardExists&&<><section className="mx-auto mt-5 max-w-xl rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Solde de la carte</p><p className="mt-2 text-2xl font-black text-blue-950">{!showBalance?'••••••':kind==='local'?money(localBalance,currency):visaBalance===undefined?'Indisponible':money(visaBalance,currency)}</p>{showBalance&&kind!=='local'&&visaBalance===undefined&&<p className="mt-1 text-[10px] text-slate-400">Le partenaire émetteur n'a pas fourni de solde {currency}.</p>}</div><button type="button" onClick={requestBalance} className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-blue-950" aria-label={showBalance?'Masquer le solde':'Afficher le solde'}>{showBalance?<EyeOff size={21}/>:<Eye size={21}/>}</button></div>
      <div className="mt-4 inline-flex rounded-2xl bg-slate-100 p-1">{(['USD','CDF']as WalletCurrency[]).map(item=><button key={item} type="button" onClick={()=>{setCurrency(item);setShowBalance(false)}} className={`rounded-xl px-5 py-2 text-xs font-black ${currency===item?'bg-white text-blue-950 shadow-sm':'text-slate-500'}`}>{item}</button>)}</div>
    </section>

    {kind==='local'&&<section className="mx-auto mt-5 grid max-w-xl grid-cols-3 gap-2.5"><Link to={`/client/cards?card=local&action=topup&currency=${currency}`} className="rounded-2xl border bg-white px-2 py-4 text-center shadow-sm"><WalletCards className="mx-auto text-blue-700" size={22}/><span className="mt-2 block text-[11px] font-black">Recharger</span></Link><Link to={`/client/wallet/pay?currency=${currency}`} className="rounded-2xl border bg-white px-2 py-4 text-center shadow-sm"><Store className="mx-auto text-blue-700" size={22}/><span className="mt-2 block text-[11px] font-black">Payer</span></Link><Link to={`/client/wallet/withdraw?currency=${currency}`} className="rounded-2xl border bg-white px-2 py-4 text-center shadow-sm"><Banknote className="mx-auto text-blue-700" size={22}/><span className="mt-2 block text-[11px] font-black">Retrait</span></Link></section>}
    {kind==='standard'&&<section className="mx-auto mt-5 max-w-xl"><Link to="/client/cards?visa=buy" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white"><ShieldCheck size={18}/>Gérer mes Visa Standard</Link></section>}
    {kind==='gold'&&<section className="mx-auto mt-5 max-w-xl"><div className="flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-black text-amber-900"><ShieldCheck size={18}/>Émission partenaire sécurisée</div></section>}

    <section className="mx-auto mt-8 max-w-xl"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-950">Historique</h2><span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cette carte seulement</span></div><button onClick={requestHistory} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-blue-950">{showHistory?<EyeOff size={17}/>:<History size={17}/>}</button></div>{!showHistory?<button onClick={requestHistory} className="w-full rounded-3xl border bg-white p-6 text-center text-sm font-black text-blue-950">Afficher l'historique de cette carte</button>:<div className="overflow-hidden rounded-3xl border bg-white shadow-sm">{cardHistory.length===0?<div className="p-8 text-center text-sm font-semibold text-slate-400">Aucune opération sur cette carte.</div>:cardHistory.map((transaction,index)=>{const debit=isDebit(transaction?.type);const txCurrency=(String(transaction?.currency||currency).toUpperCase()==='CDF'?'CDF':'USD')as WalletCurrency;const amount=Number(transaction?.amount||0);return <div key={transaction?.id||transaction?.reference||index} className="flex items-center justify-between gap-4 border-b p-4 last:border-b-0"><div className="min-w-0"><p className="truncate text-sm font-black text-slate-800">{transactionLabel(transaction?.type)}</p><p className="mt-1 text-[10px] text-slate-400">{transaction?.createdAt?new Date(Number(transaction.createdAt)).toLocaleString('fr-FR'):'Market-Cash'}</p></div><p className={`shrink-0 text-sm font-black ${debit?'text-slate-800':'text-emerald-700'}`}>{debit?'-':'+'}{money(amount,txCurrency)}</p></div>})}</div>}</section></>}

    <SecurityConfirmModal open={!!securityAction} busy={securityBusy} onClose={()=>!securityBusy&&setSecurityAction(null)} onConfirm={confirmSecurity} title={securityAction==='balance'?'Afficher le solde':securityAction==='history'?"Afficher l'historique":'Afficher les informations de la carte'} subtitle="Entrez le code secret de l’application. Les transactions financières sont confirmées séparément avec le CVV de la carte."/>
  </div>;
}
