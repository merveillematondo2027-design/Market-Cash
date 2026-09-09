import React,{useEffect,useMemo,useState}from'react';
import{ArrowLeft,ChevronRight,CreditCard,RefreshCw,ShieldCheck,Sparkles,WalletCards}from'lucide-react';
import{Link,useNavigate,useSearchParams}from'react-router-dom';
import CardProductFace,{CardProductVariant}from'../../components/CardProductFace';
import{cardSecurityService,VisaCardSummary}from'../../services/cardSecurityService';
import{localCardPairService,LocalPairCardSummary}from'../../services/localCardPairService';
import{cardCache,cardCacheKeys}from'../../services/cardCache';
import{useAuthStore}from'../../store/authStore';
import CardDetail from'./CardDetail';
import ClientCards from'./Cards';
import LocalCardTopup from'./LocalCardTopup';

const friendlyLocalError=(error:any)=>String(error?.message||'Impossible de préparer vos cartes locales pour le moment.');
type Section='local'|'standard'|'gold';

export default function CardsHub(){
  const{user}=useAuthStore();
  const navigate=useNavigate();
  const[searchParams]=useSearchParams();
  const uid=user?.uid||'';
  const visaMode=searchParams.get('visa')==='buy';
  const selectedKind=searchParams.get('card')as CardProductVariant|null;
  const selectedCardId=searchParams.get('cardId');
  const selectedAction=searchParams.get('action');
  const section=(searchParams.get('section')||'')as Section;
  const topupChooser=selectedAction==='topup'&&!selectedKind;
  const initialLocal=uid?cardCache.get<LocalPairCardSummary[]>(cardCacheKeys.local(uid)):null;
  const initialVisa=uid?cardCache.get<VisaCardSummary[]>(cardCacheKeys.visa(uid)):null;
  const[localCards,setLocalCards]=useState<LocalPairCardSummary[]>(initialLocal||[]);
  const[visaCards,setVisaCards]=useState<VisaCardSummary[]>(initialVisa||[]);
  const[loadingLocal,setLoadingLocal]=useState(!initialLocal);
  const[loadingVisa,setLoadingVisa]=useState(!initialVisa);
  const[localError,setLocalError]=useState('');
  const[localRetry,setLocalRetry]=useState(0);

  useEffect(()=>{
    if(!uid||visaMode||selectedKind)return;
    const cached=cardCache.get<LocalPairCardSummary[]>(cardCacheKeys.local(uid));
    if(cached){setLocalCards(cached);setLoadingLocal(false)}
    let active=true;
    setLocalError('');
    if(!cached)setLoadingLocal(true);
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
    if(cached){setVisaCards(cached);setLoadingVisa(false)}
    let active=true;
    if(!cached)setLoadingVisa(true);
    cardSecurityService.getMyVisaCards().then(cards=>{
      if(active){setVisaCards(cards);cardCache.set(cardCacheKeys.visa(uid),cards)}
    }).catch(error=>console.warn('[VISA_SUMMARIES_ERROR]',error)).finally(()=>active&&setLoadingVisa(false));
    return()=>{active=false};
  },[uid,visaMode,selectedKind]);

  const standardCards=useMemo(()=>visaCards.filter(card=>card.tier==='standard').slice(0,2),[visaCards]);
  const goldCards=useMemo(()=>visaCards.filter(card=>card.tier==='gold').slice(0,1),[visaCards]);
  const openCard=(kind:CardProductVariant,id?:string)=>navigate(`/client/cards?card=${kind}${id?`&cardId=${encodeURIComponent(id)}`:''}`);

  if(visaMode)return <div className="pb-28"><div className="mx-auto max-w-4xl px-3.5 pt-4 sm:px-6"><Link to="/client/cards" className="inline-flex items-center gap-2 text-sm font-black text-slate-500"><ArrowLeft size={17}/>Mes cartes</Link></div><ClientCards/></div>;
  if(selectedKind==='local'&&selectedAction==='topup')return <LocalCardTopup/>;
  if(selectedKind&&['local','standard','gold'].includes(selectedKind))return <CardDetail kind={selectedKind} cardId={selectedCardId}/>;
  if(topupChooser)return <div className="mx-auto max-w-xl p-4 pb-28 md:p-8"><Link to="/client/home" className="inline-flex items-center gap-2 text-sm font-black text-slate-500"><ArrowLeft size={17}/>Accueil</Link><section className="mt-5 rounded-[2rem] border bg-white p-5 shadow-sm"><h1 className="text-2xl font-black">Quelle carte voulez-vous alimenter ?</h1><div className="mt-6 space-y-3">{localCards.map(card=><Link key={card.cardId} to={`/client/cards?card=local&cardId=${encodeURIComponent(card.cardId)}&action=topup`} className="flex items-center justify-between rounded-2xl border-2 border-blue-200 bg-blue-50 p-4"><div><p className="font-black text-blue-950">Market-Cash Locale · {card.currency}</p><p className="mt-1 font-mono text-xs text-blue-700">{card.maskedNumber}</p></div><ChevronRight/></Link>)}</div></section></div>;

  if(section==='local')return <LocalSection cards={localCards} loading={loadingLocal} error={localError} retry={()=>setLocalRetry(v=>v+1)} openCard={openCard} userName={user?.displayName}/>;
  if(section==='standard')return <StandardSection cards={standardCards} loading={loadingVisa} openCard={openCard} userName={user?.displayName}/>;
  if(section==='gold')return <GoldSection cards={goldCards} loading={loadingVisa} openCard={openCard} userName={user?.displayName} kycApproved={user?.kycStatus==='approved'}/>;

  return <div className="mx-auto max-w-4xl px-4 pb-28 pt-5 sm:px-6">
    <header><p className="text-xs font-black uppercase tracking-[.16em] text-slate-400">Moyens de paiement</p><h1 className="mt-1 text-3xl font-black text-slate-950">Cartes</h1><p className="mt-2 text-sm text-slate-500">Choisissez une rubrique. Les cartes et leurs actions s’ouvrent ensuite dans leur propre espace.</p></header>
    <div className="mt-7 grid gap-4 md:grid-cols-3">
      <CategoryTile to="/client/cards?section=local" icon={<WalletCards size={27}/>} eyebrow="Réseau Market-Cash" title="Market-Cash Locale" description="Cartes USD et CDF pour payer, recharger et retirer chez les agents Market-Cash." meta={loadingLocal?'Préparation…':`${localCards.length} carte${localCards.length>1?'s':''} disponible${localCards.length>1?'s':''}`} tone="blue"/>
      <CategoryTile to="/client/cards?section=standard" icon={<CreditCard size={27}/>} eyebrow="Visa" title="Market-Cash Visa Standard" description="Vos cartes Visa Standard, jusqu’à deux cartes par client selon validation." meta={loadingVisa?'Chargement…':`${standardCards.length}/2 active${standardCards.length>1?'s':''}`} tone="slate"/>
      <CategoryTile to="/client/cards?section=gold" icon={<Sparkles size={27}/>} eyebrow="Visa Premium" title="Market-Cash Visa Gold" description="Une carte premium émise après vérification KYC et disponibilité du partenaire." meta={loadingVisa?'Chargement…':goldCards.length?'Carte active':'Non émise'} tone="gold"/>
    </div>
  </div>;
}

function CategoryTile({to,icon,eyebrow,title,description,meta,tone}:{to:string;icon:React.ReactNode;eyebrow:string;title:string;description:string;meta:string;tone:'blue'|'slate'|'gold'}){
  const cls=tone==='gold'?'border-amber-200 bg-amber-50/80 text-amber-900':tone==='blue'?'border-blue-200 bg-blue-50/80 text-blue-950':'border-slate-200 bg-white text-slate-900';
  return <Link to={to} className={`group flex min-h-[220px] flex-col rounded-[2rem] border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${cls}`}><div className="flex items-start justify-between"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/80 shadow-sm">{icon}</div><ChevronRight className="opacity-50 transition group-hover:translate-x-1"/></div><p className="mt-5 text-[10px] font-black uppercase tracking-[.16em] opacity-60">{eyebrow}</p><h2 className="mt-1 text-xl font-black">{title}</h2><p className="mt-2 flex-1 text-xs leading-5 opacity-70">{description}</p><p className="mt-4 text-xs font-black">{meta}</p></Link>;
}

function LocalSection({cards,loading,error,retry,openCard,userName}:{cards:LocalPairCardSummary[];loading:boolean;error:string;retry:()=>void;openCard:(kind:CardProductVariant,id?:string)=>void;userName?:string}){
  return <SectionShell title="Market-Cash Locale" subtitle="Vos cartes locales USD et CDF avec leurs opérations dédiées."><div className="space-y-5">{loading&&!cards.length?<LoadingCard/>:cards.map(card=><article key={card.cardId} className="rounded-[2rem] border bg-white p-4 shadow-sm"><div onClick={()=>openCard('local',card.cardId)} className="cursor-pointer"><CardProductFace variant="local" holder={card.cardHolder||userName} number={card.maskedNumber} expiryStart={card.expiryStart} expiryEnd={card.expiryEnd} qrData={card.qrData}/></div><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={()=>openCard('local',card.cardId)} className="rounded-2xl bg-blue-950 px-4 py-3 text-sm font-black text-white">Ouvrir la carte</button><Link to={`/client/cards?card=local&cardId=${encodeURIComponent(card.cardId)}&action=topup`} className="rounded-2xl bg-blue-50 px-4 py-3 text-center text-sm font-black text-blue-800">Recharger</Link></div><div className="mt-3 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"><span className="text-xs font-black">Carte {card.currency}</span><span className={`text-[10px] font-black uppercase ${card.status==='blocked'?'text-red-600':'text-emerald-600'}`}>{card.status==='blocked'?'Bloquée':'Active'}</span></div></article>)}{!loading&&!cards.length&&<div className="rounded-3xl border border-dashed bg-blue-50 p-5"><p className="font-black">Préparation des cartes locales</p><p className="mt-1 text-sm text-slate-600">{error||'Vos cartes seront créées automatiquement.'}</p><button onClick={retry} className="mt-3 rounded-xl bg-blue-950 px-4 py-2 text-xs font-black text-white">Réessayer</button></div>}</div></SectionShell>;
}

function StandardSection({cards,loading,openCard,userName}:{cards:VisaCardSummary[];loading:boolean;openCard:(kind:CardProductVariant,id?:string)=>void;userName?:string}){
  return <SectionShell title="Market-Cash Visa Standard" subtitle="Jusqu’à deux cartes Visa Standard. Chaque carte dispose de son propre détail et historique."><div className="space-y-5">{loading&&!cards.length?<LoadingCard/>:cards.map(card=><article key={card.cardId} className="rounded-[2rem] border bg-white p-4 shadow-sm"><div onClick={()=>openCard('standard',card.cardId)} className="cursor-pointer"><CardProductFace variant="standard" holder={card.cardHolder||userName} number={card.maskedNumber}/></div><button onClick={()=>openCard('standard',card.cardId)} className="mt-4 w-full rounded-2xl bg-blue-950 px-4 py-3 text-sm font-black text-white">Ouvrir la carte</button></article>)}{!loading&&cards.length<2&&<Link to="/client/cards?visa=buy&tier=standard" className="flex items-center justify-between rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white"><span>Obtenir une Visa Standard</span><ChevronRight size={18}/></Link>}</div></SectionShell>;
}

function GoldSection({cards,loading,openCard,userName,kycApproved}:{cards:VisaCardSummary[];loading:boolean;openCard:(kind:CardProductVariant,id?:string)=>void;userName?:string;kycApproved:boolean}){
  return <SectionShell title="Market-Cash Visa Gold" subtitle="Une carte premium maximum, avec KYC requis avant émission."><div className="space-y-5">{loading&&!cards.length?<LoadingCard/>:cards.map(card=><article key={card.cardId} className="rounded-[2rem] border border-amber-200 bg-white p-4 shadow-sm"><div onClick={()=>openCard('gold',card.cardId)} className="cursor-pointer"><CardProductFace variant="gold" holder={card.cardHolder||userName} number={card.maskedNumber}/></div><button onClick={()=>openCard('gold',card.cardId)} className="mt-4 w-full rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-blue-950">Ouvrir la carte Gold</button></article>)}{!loading&&!cards.length&&<Link to={kycApproved?'/client/cards?visa=buy&tier=gold':'/client/kyc?next=visa-gold'} className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-black text-amber-900"><span>{kycApproved?'Demander la Visa Gold':'Faire le KYC pour Visa Gold'}</span><ShieldCheck size={18}/></Link>}</div></SectionShell>;
}

function SectionShell({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}){return <div className="mx-auto max-w-3xl px-4 pb-28 pt-5 sm:px-6"><Link to="/client/cards" className="inline-flex items-center gap-2 text-sm font-black text-slate-500"><ArrowLeft size={17}/>Toutes les cartes</Link><header className="mt-5"><h1 className="text-3xl font-black text-slate-950">{title}</h1><p className="mt-2 text-sm text-slate-500">{subtitle}</p></header><div className="mt-6">{children}</div></div>}
function LoadingCard(){return <div className="grid min-h-[220px] place-items-center rounded-[2rem] border bg-white text-slate-400"><RefreshCw className="animate-spin"/></div>}
