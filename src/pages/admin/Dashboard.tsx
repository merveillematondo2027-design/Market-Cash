import{useEffect,useState}from'react';
import{useNavigate}from'react-router-dom';
import{collection,getDocs}from'firebase/firestore';
import{db}from'../../firebase/config';
import{cardService}from'../../services/cardService';
import{Activity,ArrowRight,Bell,Boxes,CreditCard,FileClock,HandCoins,RefreshCw,ShieldCheck,Store,Truck,Users,WalletCards}from'lucide-react';

interface AdminStats{totalUsers:number;clients:number;agents:number;merchants:number;pendingKyc:number;pendingUpgrades:number;pendingCardRequests:number;availableCards:number;activeDeliveries:number;activePaymentMethods:number;}

export default function AdminDashboard(){
  const navigate=useNavigate();
  const[loading,setLoading]=useState(true);
  const[refreshing,setRefreshing]=useState(false);
  const[stats,setStats]=useState<AdminStats>({totalUsers:0,clients:0,agents:0,merchants:0,pendingKyc:0,pendingUpgrades:0,pendingCardRequests:0,availableCards:0,activeDeliveries:0,activePaymentMethods:0});
  const[reviewQueue,setReviewQueue]=useState<any[]>([]);

  const load=async()=>{
    setRefreshing(true);
    try{
      const[usersSnap,kycSnap,upgradeSnap,requestSnap,cardsSnap,deliverySnap,paymentMethods]=await Promise.all([
        getDocs(collection(db,'users')),
        getDocs(collection(db,'kyc_requests')),
        getDocs(collection(db,'account_upgrade_requests')),
        getDocs(collection(db,'card_purchase_requests')),
        getDocs(collection(db,'cards')),
        getDocs(collection(db,'physical_card_requests')),
        cardService.getPaymentMethods(),
      ]);
      const users=usersSnap.docs.map(d=>d.data()as any);
      const pendingKyc=kycSnap.docs.map(d=>({id:d.id,type:'kyc',...d.data()}as any)).filter(x=>x.status==='pending');
      const pendingUpgrades=upgradeSnap.docs.map(d=>({id:d.id,type:'upgrade',...d.data()}as any)).filter(x=>x.status==='pending');
      const pendingCardRequests=requestSnap.docs.filter(d=>['pending','in_review'].includes(String((d.data()as any).status))).length;
      const availableCards=cardsSnap.docs.filter(d=>String((d.data()as any).saleStatus)==='available').length;
      const activeDeliveries=deliverySnap.docs.filter(d=>['pending','assigned','out_for_delivery','in_progress'].includes(String((d.data()as any).status))).length;
      setStats({
        totalUsers:users.length,
        clients:users.filter(u=>u.role==='client').length,
        agents:users.filter(u=>u.role==='agent').length,
        merchants:users.filter(u=>u.role==='marchand').length,
        pendingKyc:pendingKyc.length,
        pendingUpgrades:pendingUpgrades.length,
        pendingCardRequests,
        availableCards,
        activeDeliveries,
        activePaymentMethods:paymentMethods.filter(m=>m.active).length,
      });
      setReviewQueue([...pendingKyc,...pendingUpgrades].sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).slice(0,6));
    }catch(error){console.error('[ADMIN_CONTROL_CENTER_ERROR]',error)}
    finally{setLoading(false);setRefreshing(false)}
  };

  useEffect(()=>{void load()},[]);

  const mainStats=[
    {label:'Utilisateurs',value:stats.totalUsers,sub:`${stats.clients} clients`,icon:Users,to:'/admin/users',tone:'bg-blue-50 text-blue-800'},
    {label:'KYC en attente',value:stats.pendingKyc,sub:'Identités à vérifier',icon:ShieldCheck,to:'/admin/account-requests',tone:'bg-amber-50 text-amber-700'},
    {label:'Comptes pro',value:stats.pendingUpgrades,sub:'Agent / Marchand',icon:Store,to:'/admin/account-requests',tone:'bg-violet-50 text-violet-700'},
    {label:'Agents actifs',value:stats.agents,sub:'Points de vente',icon:HandCoins,to:'/admin/agents',tone:'bg-emerald-50 text-emerald-700'},
    {label:'Marchands',value:stats.merchants,sub:'Comptes Business',icon:Store,to:'/admin/account-requests',tone:'bg-cyan-50 text-cyan-700'},
    {label:'Cartes disponibles',value:stats.availableCards,sub:'Stock attribuable',icon:CreditCard,to:'/admin/stock',tone:'bg-slate-100 text-slate-700'},
  ];

  const operationCards=[
    {title:'Clients & Wallets',text:'Superviser les comptes, rôles et profils de portefeuille.',icon:WalletCards,to:'/admin/users',badge:`${stats.clients} clients`},
    {title:'KYC & Comptes professionnels',text:'Approuver les identités puis activer Agent ou Marchand.',icon:ShieldCheck,to:'/admin/account-requests',badge:`${stats.pendingKyc+stats.pendingUpgrades} à traiter`},
    {title:'Réseau Agents & Float',text:'Gérer les Agents point de vente et leur float opérationnel.',icon:HandCoins,to:'/admin/agents',badge:`${stats.agents} agents`},
    {title:'Demandes de cartes',text:'Traiter les commandes de cartes sans mélanger le wallet principal.',icon:FileClock,to:'/admin/requests',badge:`${stats.pendingCardRequests} en attente`},
    {title:'Stock & production',text:'Contrôler les cartes préconfigurées et la bibliothèque PVC.',icon:Boxes,to:'/admin/stock',badge:`${stats.availableCards} disponibles`},
    {title:'Livraisons physiques',text:'Suivre les cartes physiques qui doivent être livrées.',icon:Truck,to:'/admin/deliveries',badge:`${stats.activeDeliveries} actives`},
  ];

  return <div className="space-y-6 pb-10">
    <section className="overflow-hidden rounded-[2rem] bg-blue-950 p-6 text-white shadow-xl md:p-8"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-amber-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-950">Control Center</span><span className="text-xs font-bold text-blue-200">Architecture wallet-first</span></div><h1 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">Administration Market-Cash</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-blue-200">Le portefeuille principal est le cœur du système. L’administration supervise ensuite le KYC, les comptes professionnels, les Agents, les Marchands, les cartes et les livraisons sans mélanger leurs responsabilités.</p></div><div className="flex gap-2"><button onClick={load} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-xs font-black text-white disabled:opacity-50"><RefreshCw size={15} className={refreshing?'animate-spin':''}/>Actualiser</button><button onClick={()=>navigate('/admin/account-requests')} className="rounded-xl bg-amber-400 px-4 py-3 text-xs font-black text-blue-950">Traiter les validations</button></div></div></section>

    {loading?<div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Chargement du centre de contrôle…</div>:<>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{mainStats.map(item=>{const I=item.icon;return <button key={item.label} onClick={()=>navigate(item.to)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className={`grid h-10 w-10 place-items-center rounded-xl ${item.tone}`}><I size={19}/></div><div className="mt-4 text-2xl font-black text-slate-950">{item.value}</div><div className="mt-1 text-xs font-black text-slate-800">{item.label}</div><div className="mt-1 text-[10px] text-slate-400">{item.sub}</div></button>})}</section>

      {(stats.pendingKyc+stats.pendingUpgrades)>0&&<section className="rounded-3xl border border-amber-200 bg-amber-50 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="font-black text-amber-950">Validations prioritaires</h2><p className="mt-1 text-sm text-amber-800">{stats.pendingKyc} KYC et {stats.pendingUpgrades} demande(s) de compte professionnel attendent une décision administrative.</p></div><button onClick={()=>navigate('/admin/account-requests')} className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-white">Ouvrir la file de validation</button></div></section>}

      <section><div className="mb-3 flex items-end justify-between"><div><h2 className="text-xl font-black text-slate-950">Opérations Market-Cash</h2><p className="text-xs text-slate-500">Accès direct aux modules réellement utilisés par la nouvelle architecture.</p></div><div className="hidden items-center gap-2 text-xs font-bold text-slate-400 sm:flex"><Activity size={14}/>{stats.activePaymentMethods} moyen(x) de paiement externe actif(s)</div></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{operationCards.map(item=>{const I=item.icon;return <button key={item.title} onClick={()=>navigate(item.to)} className="group rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md"><div className="flex items-start justify-between gap-4"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-900"><I size={21}/></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{item.badge}</span></div><h3 className="mt-4 font-black text-slate-950">{item.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{item.text}</p><div className="mt-4 inline-flex items-center gap-1 text-xs font-black text-blue-800">Ouvrir <ArrowRight size={14}/></div></button>})}</div></section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]"><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-black text-slate-950">File de validation récente</h2><p className="text-xs text-slate-500">KYC et demandes Agent / Marchand.</p></div><button onClick={()=>navigate('/admin/account-requests')} className="text-xs font-black text-blue-800">Voir tout</button></div><div className="mt-4 space-y-2">{reviewQueue.length===0?<div className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">Aucune validation en attente.</div>:reviewQueue.map(item=><button key={`${item.type}:${item.id}`} onClick={()=>navigate('/admin/account-requests')} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left"><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{item.fullName||item.tradeName||item.pointName||item.legalName||'Demande Market-Cash'}</div><div className="mt-1 text-[11px] text-slate-500">{item.type==='kyc'?'Vérification KYC':item.requestedType==='marchand'?'Compte Marchand':'Compte Agent'}</div></div><span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-800">En attente</span></button>)}</div></div><div className="rounded-3xl bg-slate-950 p-5 text-white shadow-sm"><Bell className="text-amber-400"/><h2 className="mt-4 font-black">Principe de contrôle</h2><p className="mt-2 text-sm leading-6 text-slate-300">Un changement de type de compte doit toujours passer par l’administration. Après approbation, le rôle Firestore change et l’utilisateur est automatiquement dirigé vers son interface Agent ou Marchand à la prochaine synchronisation.</p><button onClick={()=>navigate('/admin/logs')} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-black">Consulter les journaux <ArrowRight size={14}/></button></div></section>
    </>}
  </div>;
}
