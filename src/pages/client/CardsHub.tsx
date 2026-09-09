import React,{useEffect,useMemo,useState}from'react';
import{ArrowLeft,ChevronRight,CreditCard,RefreshCw,Sparkles}from'lucide-react';
import{Link,useNavigate,useSearchParams}from'react-router-dom';
import toast from'react-hot-toast';
import CardProductFace,{CardProductVariant}from'../../components/CardProductFace';
import SecurityConfirmModal from'../../components/SecurityConfirmModal';
import{cardSecurityService,VisaCardSummary,VisaSecureData}from'../../services/cardSecurityService';
import{localCardPairService,LocalPairCardSummary,LocalPairSecureData}from'../../services/localCardPairService';
import{cardCache,cardCacheKeys}from'../../services/cardCache';
import{useAuthStore}from'../../store/authStore';
import CardDetail from'./CardDetail';
import ClientCards from'./Cards';
import LocalCardTopup from'./LocalCardTopup';

type RevealTarget={kind:CardProductVariant;id:string}|null;
const friendlyLocalError=(error:any)=>String(error?.message||'Impossible de préparer vos cartes locales pour le moment.');

export default function CardsHub(){
  const{user}=useAuthStore();
  const navigate=useNavigate();
  const[searchParams]=useSearchParams();
  const uid=user?.uid||'';
  const visaMode=searchParams.get('visa')==='buy';
  const selectedKind=searchParams.get('card')as CardProductVariant|null;
  const selectedCardId=searchParams.get('cardId');
  const selectedAction=searchParams.get('action');
  const topupChooser=selectedAction==='topup'&&!selectedKind;
  const initialLocal=uid?cardCache.get<LocalPairCardSummary[]>(cardCacheKeys.local(uid)):null;
  const initialVisa=uid?cardCache.get<VisaCardSummary[]>(cardCacheKeys.visa(uid)):null;
  const[localCards,setLocalCards]=useState<LocalPairCardSummary[]>(initialLocal||[]);
  const[localSecure,setLocalSecure]=useState<Record<string,LocalPairSecureData>>({});
  const[visaCards,setVisaCards]=useState<VisaCardSummary[]>(initialVisa||[]);
  const[visaSecure,setVisaSecure]=useState<Record<string,VisaSecureData>>({});
  const[loadingLocal,setLoadingLocal]=useState(!initialLocal);
  const[loadingVisa,setLoadingVisa]=useState(!initialVisa);
  const[localError,setLocalError]=useState('');
  const[localRetry,setLocalRetry]=useState(0);
  const[revealed,setRevealed]=useState<Record<string,boolean>>({});
  const[pendingReveal,setPendingReveal]=useState<RevealTarget>(null);
  const[securityBusy,setSecurityBusy]=useState(false);

  useEffect(()=>{
    if(!uid||visaMode||selectedKind)return;
    const cached=cardCache.get<LocalPairCardSummary[]>(cardCacheKeys.local(uid));
    if(cached){setLocalCards(cached);setLoadingLocal(false);setLocalError('');return}
    let active=true;
    setLoadingLocal(true);
    setLocalError('');
    localCardPairService.ensure().then(cards=>{
      if(active){setLocalCards(cards);cardCache.set(cardCacheKeys.local(uid),cards)}
    }).catch(error=>{
      console.warn('[LOCAL_CARD_PAIR_LOAD_ERROR]',error);
      if(active)setLocalError(friendlyLocalError(error));
    }).finally(()=>active&&setLoadingLocal(false));
    return()=>{active=false};
  },[uid,visaMode,selectedKind,localRetry]);

  useEffect(()=>{
    if(!uid||visaMode||selectedKind)return;
    const cached=cardCache.get<VisaCardSummary[]>(cardCacheKeys.visa(uid));
    if(cached){setVisaCards(cached);setLoadingVisa(false);return}
    let active=true;
    setLoadingVisa(true);
    cardSecurityService.getMyVisaCards().then(cards=>{
      if(active){setVisaCards(cards);cardCache.set(cardCacheKeys.visa(uid),cards)}
    }).catch(error=>console.warn('[VISA_SUMMARIES_ERROR]',error)).finally(()=>active&&setLoadingVisa(false));
    return()=>{active=false};
  },[uid,visaMode,selectedKind]);

  const standardCards=useMemo(()=>visaCards.filter(card=>card.tier==='standard').slice(0,2),[visaCards]);
  const goldCard=useMemo(()=>visaCards.find(card=>card.tier==='gold')||null,[visaCards]);
  const askReveal=(kind:CardProductVariant,id:string)=>{
    if(revealed[id]){
      setRevealed(current=>({...current,[id]:false}));
      if(kind==='local')setLocalSecure(current=>{const next={...current};delete next[id];return next});
      else setVisaSecure(current=>{const next={...current};delete next[id];return next});
      return;
    }
    setPendingReveal({kind,id});
  };
  const confirmReveal=async(pin:string)=>{
    if(!pendingReveal)return;
    setSecurityBusy(true);
    try{
      if(pendingReveal.kind==='local'){
        const secure=await localCardPairService.reveal(pendingReveal.id,pin);
        setLocalSecure(current=>({...current,[pendingReveal.id]:secure}));
      }else{
        const secure=await cardSecurityService.revealVisaCard(pendingReveal.id,pin);
        setVisaSecure(current=>({...current,[pendingReveal.id]:secure}));
      }
      setRevealed(current=>({...current,[pendingReveal.id]:true}));
      setPendingReveal(null);
    }catch(error:any){toast.error(error?.message||'Code secret incorrect.')}finally{setSecurityBusy(false)}
  };
  const openCard=(kind:CardProductVariant,id?:string)=>navigate(`/client/cards?card=${kind}${id?`&cardId=${encodeURIComponent(id)}`:''}`);

  if(visaMode)return <div className="pb-28"><div className="mx-auto max-w-4xl px-3.5 pt-4 sm:px-6"><Link to="/client/cards" className="inline-flex items-center gap-2 text-sm font-black text-slate-500"><ArrowLeft size={17}/>Mes cartes</Link></div><ClientCards/></div>;
  if(selectedKind==='local'&&selectedAction==='topup')return <LocalCardTopup/>;
  if(selectedKind&&['local','standard','gold'].includes(selectedKind))return <CardDetail kind={selectedKind} cardId={selectedCardId}/>;
  if(topupChooser)return <div className="mx-auto max-w-xl p-4 pb-28 md:p-8"><Link to="/client/home" className="inline-flex items-center gap-2 text-sm font-black text-slate-500"><ArrowLeft size={17}/>Accueil</Link><section className="mt-5 rounded-[2rem] border bg-white p-5 shadow-sm"><h1 className="text-2xl font-black">Quelle carte voulez-vous alimenter ?</h1><div className="mt-6 space-y-3">{localCards.map(card=><Link key={card.cardId} to={`/client/cards?card=local&cardId=${encodeURIComponent(card.cardId)}&action=topup`} className="flex items-center justify-between rounded-2xl border-2 border-blue-200 bg-blue-50 p-4"><div><p className="font-black text-blue-950">Market-Cash Locale · {card.currency}</p><p className="mt-1 font-mono text-xs text-blue-700">{card.maskedNumber}</p></div><ChevronRight/></Link>)}</div></section></div>;

  return <div className="mx-auto max-w-4xl px-3.5 pb-28 pt-4 sm:px-6"><h1 className="mb-6 text-2xl font-black">Cartes</h1>
    <section className="mb-8"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-black uppercase tracking-[.12em] text-blue-950">Market-Cash Locale</h2><p className="mt-1 text-xs text-slate-500">1 carte USD + 1 carte CDF · sans KYC</p></div>{loadingLocal&&<RefreshCw size={15} className="animate-spin text-slate-400"/>}</div>
      {localCards.length?<div className="grid gap-5 md:grid-cols-2">{localCards.map(card=>{const secure=localSecure[card.cardId];return <div key={card.cardId}><div role="button" tabIndex={0} onClick={()=>openCard('local',card.cardId)} className="cursor-pointer rounded-[1.65rem]"><CardProductFace variant="local" holder={secure?.cardHolder||card.cardHolder||user?.displayName} number={secure?.cardNumber||card.maskedNumber} expiryStart={secure?.expiryStart||card.expiryStart} expiryEnd={secure?.expiryEnd||card.expiryEnd} cvv={secure?.cvv} qrData={card.qrData} revealed={!!revealed[card.cardId]} onToggleReveal={()=>askReveal('local',card.cardId)}/></div><div className="mt-2 flex items-center justify-between rounded-2xl bg-slate-100 px-4 py-2"><span className="text-xs font-black text-blue-950">Carte {card.currency}</span><Link to={`/client/cards?card=local&cardId=${encodeURIComponent(card.cardId)}&action=topup`} className="text-xs font-black text-blue-700">Recharger</Link></div></div>})}</div>:!loadingLocal?<div className="rounded-3xl border border-dashed bg-blue-50 p-5"><p className="font-black">Préparation des cartes locales</p><p className="mt-1 text-sm">{localError||'Vos cartes USD et CDF seront créées automatiquement.'}</p><button onClick={()=>setLocalRetry(v=>v+1)} className="mt-3 rounded-xl bg-blue-950 px-4 py-2 text-xs font-black text-white">Réessayer</button></div>:null}
    </section>

    <section className="mb-8"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-black uppercase tracking-[.12em] text-slate-700">Market-Cash Visa Standard</h2><p className="mt-1 text-xs text-slate-500">Jusqu’à 2 cartes · pièce d’identité demandée au formulaire</p></div>{loadingVisa&&<RefreshCw size={15} className="animate-spin text-slate-400"/>}</div>{standardCards.length?<><div className="flex gap-3 overflow-x-auto">{standardCards.map(card=><div key={card.cardId} onClick={()=>openCard('standard',card.cardId)} className="w-[88%] shrink-0 cursor-pointer"><CardProductFace variant="standard" holder={card.cardHolder||user?.displayName} number={card.maskedNumber}/></div>)}</div>{standardCards.length<2&&<Link to="/client/cards?visa=buy&tier=standard" className="mt-3 flex items-center justify-between rounded-2xl bg-blue-950 px-4 py-3 text-sm font-black text-white"><span>Obtenir une autre Visa Standard</span><ChevronRight size={17}/></Link>}</>:!loadingVisa?<ProductEmptyState icon={<CreditCard size={24}/>} title="Aucune Visa Standard active" text="Vous pouvez en posséder jusqu'à deux." action="Obtenir une Visa Standard" to="/client/cards?visa=buy&tier=standard"/>:null}</section>

    <section><h2 className="mb-3 text-sm font-black uppercase tracking-[.12em] text-amber-800">Market-Cash Visa Gold</h2>{goldCard?<div onClick={()=>openCard('gold',goldCard.cardId)} className="cursor-pointer"><CardProductFace variant="gold" holder={goldCard.cardHolder||user?.displayName} number={goldCard.maskedNumber}/></div>:!loadingVisa?<ProductEmptyState icon={<Sparkles size={24}/>} title="Visa Gold non émise" text="1 carte maximum. Vérification KYC requise avant émission." action={user?.kycStatus==='approved'?'Obtenir la Visa Gold':'Faire le KYC pour Visa Gold'} to={user?.kycStatus==='approved'?'/client/cards?visa=buy&tier=gold':'/client/kyc?next=visa-gold'} gold/>:null}</section>
    <SecurityConfirmModal open={!!pendingReveal} busy={securityBusy} onClose={()=>!securityBusy&&setPendingReveal(null)} onConfirm={confirmReveal} title="Afficher les informations de la carte" subtitle="Entrez le code secret de l’application."/>
  </div>;
}

function ProductEmptyState({icon,title,text,action,to,gold=false}:{icon:React.ReactNode;title:string;text:string;action:string;to:string;gold?:boolean}){
  return <div className={`rounded-[1.75rem] border p-5 ${gold?'border-amber-200 bg-amber-50/70':'bg-white'} shadow-sm`}><div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-blue-950">{icon}</div><h3 className="mt-4 text-lg font-black">{title}</h3><p className="mt-2 text-sm text-slate-500">{text}</p><Link to={to} className={`mt-4 flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-black ${gold?'bg-amber-400 text-blue-950':'bg-blue-950 text-white'}`}><span>{action}</span><ChevronRight size={17}/></Link></div>;
}
