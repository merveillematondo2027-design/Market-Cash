import{useEffect,useState}from'react';
import{collection,onSnapshot}from'firebase/firestore';
import{db}from'../../firebase/config';
import{useAuthStore}from'../../store/authStore';
import{Link}from'react-router-dom';
import{ArrowRight,Building2,CreditCard,FileText,HandCoins,ShieldCheck,Store,Truck,Users,WalletCards}from'lucide-react';
import{CardPurchaseRequest,PhysicalCardRequest,UserCard}from'../../types';

export default function AgencyDashboard(){
  const{user}=useAuthStore();
  const[stats,setStats]=useState({users:0,clients:0,pendingKyc:0,pendingRequests:0,availableCards:0,activeDeliveries:0});
  const[recentRequests,setRecentRequests]=useState<CardPurchaseRequest[]>([]);
  const[recentDeliveries,setRecentDeliveries]=useState<PhysicalCardRequest[]>([]);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{
    const unsubs=[
      onSnapshot(collection(db,'users'),snap=>{const all=snap.docs.map(d=>d.data()as any);setStats(prev=>({...prev,users:all.length,clients:all.filter(x=>x.role==='client').length}))},e=>console.warn('[AGENCY_USERS_ERROR]',e)),
      onSnapshot(collection(db,'kyc_requests'),snap=>setStats(prev=>({...prev,pendingKyc:snap.docs.filter(d=>(d.data()as any).status==='pending').length})),e=>console.warn('[AGENCY_KYC_ERROR]',e)),
      onSnapshot(collection(db,'card_purchase_requests'),snap=>{const all=snap.docs.map(d=>({id:d.id,...d.data()}as CardPurchaseRequest));setStats(prev=>({...prev,pendingRequests:all.filter(r=>r.status==='pending'||String(r.status)==='in_review').length}));setRecentRequests(all.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,4));setLoading(false)},e=>{console.warn('[AGENCY_REQUESTS_ERROR]',e);setLoading(false)}),
      onSnapshot(collection(db,'cards'),snap=>{const all=snap.docs.map(d=>d.data()as UserCard);setStats(prev=>({...prev,availableCards:all.filter(c=>c.saleStatus==='available').length}))},e=>console.warn('[AGENCY_CARDS_ERROR]',e)),
      onSnapshot(collection(db,'physical_card_requests'),snap=>{const all=snap.docs.map(d=>({id:d.id,...d.data()}as PhysicalCardRequest));setStats(prev=>({...prev,activeDeliveries:all.filter(d=>['pending','assigned','out_for_delivery','in_progress'].includes(String(d.status))).length}));setRecentDeliveries(all.sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,4))},e=>console.warn('[AGENCY_DELIVERIES_ERROR]',e)),
    ];
    return()=>unsubs.forEach(fn=>fn());
  },[]);

  const metrics=[
    {label:'Clients visibles',value:stats.clients,icon:Users,tone:'bg-blue-50 text-blue-800'},
    {label:'KYC en attente',value:stats.pendingKyc,icon:ShieldCheck,tone:'bg-amber-50 text-amber-700'},
    {label:'Demandes cartes',value:stats.pendingRequests,icon:FileText,tone:'bg-violet-50 text-violet-700'},
    {label:'Cartes disponibles',value:stats.availableCards,icon:CreditCard,tone:'bg-emerald-50 text-emerald-700'},
    {label:'Livraisons actives',value:stats.activeDeliveries,icon:Truck,tone:'bg-cyan-50 text-cyan-700'},
  ];

  return <div className="space-y-6 pb-10">
    <section className="rounded-[2rem] bg-blue-950 p-6 text-white shadow-xl md:p-8"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-amber-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-950">Centre d’agence</span><span className="text-xs font-bold text-blue-200">{user?.agencyName||'Réseau Market-Cash'}</span></div><h1 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">Bonjour, {user?.displayName||'Chef d’Agence'}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-200">L’agence sert le réseau local : accueil client, suivi des demandes, cartes physiques et livraisons. Les mouvements monétaires sensibles restent exécutés par les wallets et Cloud Functions Market-Cash.</p></div><Link to="/agency/requests" className="rounded-xl bg-amber-400 px-4 py-3 text-center text-xs font-black text-blue-950">Voir les opérations en attente</Link></div></section>

    {loading?<div className="rounded-3xl border border-slate-200 bg-white p-7 text-sm text-slate-500">Chargement de l’agence…</div>:<>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">{metrics.map(item=>{const I=item.icon;return <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`grid h-10 w-10 place-items-center rounded-xl ${item.tone}`}><I size={19}/></div><div className="mt-4 text-2xl font-black text-slate-950">{item.value}</div><div className="mt-1 text-xs font-black text-slate-700">{item.label}</div></div>})}</section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><InfoCard icon={WalletCards} title="Wallet client" text="Le portefeuille principal reçoit les dépôts, transferts et paiements. Il ne doit pas être confondu avec une carte."/><InfoCard icon={HandCoins} title="Réseau Agent" text="Les dépôts et retraits cash passent par les Agents agréés et leur float, pas directement par l’agence."/><InfoCard icon={Store} title="Marchands" text="Les comptes Marchand reçoivent les paiements clients après validation administrative de leur statut."/><InfoCard icon={CreditCard} title="Cartes" text="Les cartes sont des moyens de paiement séparés, alimentés depuis le wallet lorsque la politique le permet."/></section>

      <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-black text-slate-950">Demandes récentes</h2><p className="text-xs text-slate-500">Commandes de cartes à traiter par l’agence.</p></div><Link to="/agency/requests" className="text-xs font-black text-blue-800">Voir tout</Link></div><div className="mt-4 space-y-2">{recentRequests.length===0?<Empty text="Aucune demande récente."/>:recentRequests.map(req=><Link key={req.id} to="/agency/requests" className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{req.userName||req.userEmail||'Client Market-Cash'}</div><div className="mt-1 text-[11px] text-slate-500">{req.cardName||'Carte Market-Cash'} · {req.amount||req.price||0} {req.currency||'USD'}</div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${req.status==='approved'?'bg-emerald-100 text-emerald-800':req.status==='rejected'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-800'}`}>{req.status==='approved'?'Validée':req.status==='rejected'?'Rejetée':'En attente'}</span></Link>)}</div></div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-black text-slate-950">Livraisons récentes</h2><p className="text-xs text-slate-500">Suivi physique des cartes commandées.</p></div><Link to="/agency/deliveries" className="text-xs font-black text-blue-800">Voir tout</Link></div><div className="mt-4 space-y-2">{recentDeliveries.length===0?<Empty text="Aucune livraison récente."/>:recentDeliveries.map(del=><Link key={del.id} to="/agency/deliveries" className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{del.clientName||del.clientEmail||'Destinataire'}</div><div className="mt-1 truncate text-[11px] text-slate-500">{del.deliveryAddress||'Adresse non renseignée'}</div></div><span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-800">{del.status||'En cours'}</span></Link>)}</div></div></section>

      <section className="rounded-3xl bg-slate-950 p-5 text-white"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-amber-400"><Building2 size={21}/></div><div><h2 className="font-black">Nouvelle logique Chef d’Agence</h2><p className="mt-2 text-sm leading-6 text-slate-300">L’interface d’agence devient un centre opérationnel local. Elle ne remplace ni l’Administrateur Général ni le terminal Agent : chaque rôle garde ses permissions et son parcours propre.</p><div className="mt-4 flex flex-wrap gap-2"><Link to="/agency/cards" className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-black">Gérer les cartes <ArrowRight size={13}/></Link><Link to="/agency/deliveries" className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-black">Suivre les livraisons <ArrowRight size={13}/></Link></div></div></div></section>
    </>}
  </div>;
}

function InfoCard({icon:Icon,title,text}:{icon:any;title:string;text:string}){return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-900"><Icon size={21}/></div><h3 className="mt-4 font-black text-slate-950">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>}
function Empty({text}:{text:string}){return <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">{text}</div>}
