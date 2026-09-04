import React,{useEffect,useMemo,useState}from'react';
import{collection,onSnapshot,query,where}from'firebase/firestore';
import{ArrowLeft,ChevronRight,CreditCard,Plus,RefreshCw,ShieldCheck,Sparkles}from'lucide-react';
import{Link,useNavigate,useSearchParams}from'react-router-dom';
import toast from'react-hot-toast';
import CardProductFace,{CardProductVariant}from'../../components/CardProductFace';
import SecurityConfirmModal from'../../components/SecurityConfirmModal';
import{db}from'../../firebase/config';
import{agentWalletService,InternalCardSummary,LocalCardSecureData}from'../../services/agentWalletService';
import{useAuthStore}from'../../store/authStore';
import{UserCard}from'../../types';
import CardDetail from'./CardDetail';
import ClientCards from'./Cards';
import LocalCardTopup from'./LocalCardTopup';

const isVisa=(card:UserCard)=>String(card.network||'').toLowerCase()==='visa';
const isGold=(card:UserCard)=>String((card as any).visaTier||(card as any).productTier||'').toLowerCase()==='gold';
type RevealTarget={kind:CardProductVariant;id:string}|null;

export default function CardsHub(){
  const{user}=useAuthStore();
  const navigate=useNavigate();
  const[searchParams]=useSearchParams();
  const visaMode=searchParams.get('visa')==='buy';
  const selectedKind=searchParams.get('card')as CardProductVariant|null;
  const selectedCardId=searchParams.get('cardId');
  const selectedAction=searchParams.get('action');
  const[localCard,setLocalCard]=useState<InternalCardSummary|null>(null);
  const[localSecure,setLocalSecure]=useState<LocalCardSecureData|null>(null);
  const[visaCards,setVisaCards]=useState<UserCard[]>([]);
  const[loadingLocal,setLoadingLocal]=useState(true);
  const[revealed,setRevealed]=useState<Record<string,boolean>>({});
  const[pendingReveal,setPendingReveal]=useState<RevealTarget>(null);
  const[securityBusy,setSecurityBusy]=useState(false);

  useEffect(()=>{
    if(!user?.uid||visaMode||selectedKind)return;
    let active=true;setLoadingLocal(true);
    (async()=>{
      try{
        await agentWalletService.ensureLocalCard();
        const cards=await agentWalletService.getMyInternalCards();
        if(active)setLocalCard(cards[0]||null);
      }catch(error){
        console.warn('[LOCAL_CARD_AUTO_READY_ERROR]',error);
        if(active)setLocalCard(null);
      }finally{if(active)setLoadingLocal(false)}
    })();
    return()=>{active=false};
  },[user?.uid,visaMode,selectedKind]);

  useEffect(()=>{
    if(!user?.uid||visaMode)return;
    const cardsQuery=query(collection(db,'cards'),where('userId','==',user.uid));
    return onSnapshot(cardsQuery,snapshot=>{
      setVisaCards(snapshot.docs.map(item=>({...item.data(),id:item.id,cardId:item.id}as UserCard)).filter(card=>isVisa(card)&&card.status!=='disabled'));
    },error=>{
      console.warn('[CARDS_HUB_VISA_LIST_ERROR]',error);
      setVisaCards([]);
    });
  },[user?.uid,visaMode]);

  const standardCards=useMemo(()=>visaCards.filter(card=>!isGold(card)).slice(0,4),[visaCards]);
  const goldCard=useMemo(()=>visaCards.find(card=>isGold(card))||null,[visaCards]);
  const askReveal=(kind:CardProductVariant,id:string)=>{
    if(revealed[id]){
      setRevealed(current=>({...current,[id]:false}));
      if(kind==='local')setLocalSecure(null);
      return;
    }
    setPendingReveal({kind,id});
  };
  const confirmReveal=async(pin:string)=>{
    if(!pendingReveal)return;
    setSecurityBusy(true);
    try{
      if(pendingReveal.kind==='local')setLocalSecure(await agentWalletService.revealLocalCardSecureData(pin));
      else await agentWalletService.verifyApplicationSecret(pin);
      setRevealed(current=>({...current,[pendingReveal.id]:true}));
      setPendingReveal(null);
    }catch(error:any){toast.error(error?.message||'Code secret incorrect.')}finally{setSecurityBusy(false)}
  };
  const openCard=(kind:CardProductVariant,id?:string)=>navigate(`/client/cards?card=${kind}${id?`&cardId=${encodeURIComponent(id)}`:''}`);

  if(visaMode)return <div className="pb-28"><div className="mx-auto max-w-4xl px-3.5 pt-4 sm:px-6"><Link to="/client/cards" className="inline-flex items-center gap-2 text-sm font-black text-slate-500"><ArrowLeft size={17}/>Mes cartes</Link></div><ClientCards/></div>;
  if(selectedKind==='local'&&selectedAction==='topup')return <LocalCardTopup/>;
  if(selectedKind&&['local','standard','gold'].includes(selectedKind))return <CardDetail kind={selectedKind} cardId={selectedCardId}/>;

  const localKey=localCard?.cardId||'local';
  return <div className="mx-auto max-w-4xl px-3.5 pb-28 pt-4 sm:px-6">
    <div className="mb-6"><h1 className="text-2xl font-black tracking-tight text-slate-950">Cartes</h1><p className="mt-1 text-sm text-slate-500">Votre carte locale est créée après KYC. Les Visa n’apparaissent ici qu’après émission réelle.</p></div>

    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black uppercase tracking-[.12em] text-blue-950">Market-Cash Locale</h2>{loadingLocal&&<RefreshCw size={15} className="animate-spin text-slate-400"/>}</div>
      {localCard?<div role="button" tabIndex={0} onClick={()=>openCard('local',localCard.cardId)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')openCard('local',localCard.cardId)}} className="cursor-pointer rounded-[1.65rem] outline-none ring-blue-300 focus:ring-4">
        <CardProductFace variant="local" holder={localSecure?.cardHolder||localCard.cardHolder||user?.displayName} number={localSecure?.cardNumber||localCard.maskedNumber} expiryStart={localSecure?.expiryStart||localCard.expiryStart} expiryEnd={localSecure?.expiryEnd||localCard.expiryEnd} cvv={localSecure?.cvv} revealed={!!revealed[localKey]} onToggleReveal={()=>askReveal('local',localKey)} className="transition duration-200 active:scale-[.985]"/>
      </div>:!loadingLocal?<div className="rounded-3xl border border-dashed border-amber-300 bg-amber-50 p-5"><p className="font-black text-amber-900">Carte locale indisponible</p><p className="mt-1 text-sm text-amber-800">Vérifiez que votre KYC est approuvé puis réessayez.</p></div>:null}
      {localCard&&<div className="mt-3 grid grid-cols-2 gap-2"><Link to={`/client/cards?card=local&cardId=${encodeURIComponent(localCard.cardId)}`} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-blue-950"><ShieldCheck size={16}/>Détails</Link><Link to="/client/cards?card=local&action=topup" className="flex items-center justify-center gap-2 rounded-2xl bg-blue-950 px-4 py-3 text-sm font-black text-white"><Plus size={16}/>Recharger</Link></div>}
    </section>

    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black uppercase tracking-[.12em] text-slate-700">Market-Cash Visa Standard</h2>{standardCards.length>0&&standardCards.length<4&&<Link to="/client/cards?visa=buy" className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-700" aria-label="Demander une autre Visa Standard"><Plus size={16}/></Link>}</div>
      {standardCards.length>0?<div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{standardCards.map(card=>{const id=card.cardId||card.id||'';return <div key={id} role="button" tabIndex={0} onClick={()=>openCard('standard',id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')openCard('standard',id)}} className="w-[88%] shrink-0 snap-center cursor-pointer rounded-[1.65rem] outline-none ring-blue-300 focus:ring-4 sm:w-[68%] md:w-[58%]"><CardProductFace variant="standard" holder={card.cardHolder||card.cardHolderName||user?.displayName} number={card.cardNumber} expiryStart={card.expiryStart||card.validFrom} expiryEnd={card.expiryEnd||card.expiry||card.validUntil} cvv={card.cvv} revealed={!!revealed[id]} onToggleReveal={()=>askReveal('standard',id)} className="transition duration-200 active:scale-[.985]"/></div>})}</div>:<ProductEmptyState icon={<CreditCard size={24}/>} title="Aucune Visa Standard active" text="Aucune fausse carte n’est affichée. Une Visa apparaîtra ici seulement après émission et attribution à votre compte." action="Obtenir une Visa Standard" to="/client/cards?visa=buy"/>}
    </section>

    <section>
      <div className="mb-3"><h2 className="text-sm font-black uppercase tracking-[.12em] text-amber-800">Market-Cash Visa Gold</h2></div>
      {goldCard?(()=>{const id=goldCard.cardId||goldCard.id||'';return <div role="button" tabIndex={0} onClick={()=>openCard('gold',id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')openCard('gold',id)}} className="cursor-pointer rounded-[1.65rem] outline-none ring-amber-300 focus:ring-4"><CardProductFace variant="gold" holder={goldCard.cardHolder||goldCard.cardHolderName||user?.displayName} number={goldCard.cardNumber} expiryStart={goldCard.expiryStart||goldCard.validFrom} expiryEnd={goldCard.expiryEnd||goldCard.expiry||goldCard.validUntil} cvv={goldCard.cvv} revealed={!!revealed[id]} onToggleReveal={()=>askReveal('gold',id)} className="transition duration-200 active:scale-[.985]"/></div>})():<ProductEmptyState icon={<Sparkles size={24}/>} title="Visa Gold non émise" text="La Gold dépend d’un partenaire émetteur. Elle ne sera affichée comme carte active qu’après retour réel de l’API partenaire." action="Voir les cartes Visa" to="/client/cards?visa=buy" gold/>}
    </section>

    <SecurityConfirmModal open={!!pendingReveal} busy={securityBusy} onClose={()=>!securityBusy&&setPendingReveal(null)} onConfirm={confirmReveal} title="Afficher les informations de la carte" subtitle="Entrez le code secret de l’application. Il sert à révéler les informations sensibles, pas à confirmer une transaction."/>
  </div>;
}

function ProductEmptyState({icon,title,text,action,to,gold=false}:{icon:React.ReactNode;title:string;text:string;action:string;to:string;gold?:boolean}){
  return <div className={`rounded-[1.75rem] border p-5 ${gold?'border-amber-200 bg-amber-50/70':'border-slate-200 bg-white'} shadow-sm`}><div className={`grid h-12 w-12 place-items-center rounded-2xl ${gold?'bg-amber-100 text-amber-800':'bg-slate-100 text-blue-950'}`}>{icon}</div><h3 className="mt-4 text-lg font-black text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p><Link to={to} className={`mt-4 flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-black ${gold?'bg-amber-400 text-blue-950':'bg-blue-950 text-white'}`}><span>{action}</span><ChevronRight size={17}/></Link></div>;
}
