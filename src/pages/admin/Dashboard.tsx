import{useEffect,useState}from'react';
import{useNavigate}from'react-router-dom';
import{collection,getDocs}from'firebase/firestore';
import{db}from'../../firebase/config';
import{cardService}from'../../services/cardService';
import{Boxes,CreditCard,HandCoins,RefreshCw,Settings2,ShieldCheck,Truck,WalletCards}from'lucide-react';

interface AdminStats{totalUsers:number;clients:number;agents:number;merchants:number;pendingKyc:number;pendingUpgrades:number;pendingCardRequests:number;availableCards:number;activeDeliveries:number;activePaymentMethods:number;}

export default function AdminDashboard(){
  const navigate=useNavigate();
  const[loading,setLoading]=useState(true);
  const[refreshing,setRefreshing]=useState(false);
  const[stats,setStats]=useState<AdminStats>({totalUsers:0,clients:0,agents:0,merchants:0,pendingKyc:0,pendingUpgrades:0,pendingCardRequests:0,availableCards:0,activeDeliveries:0,activePaymentMethods:0});

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
      setStats({
        totalUsers:users.length,
        clients:users.filter(u=>u.role==='client').length,
        agents:users.filter(u=>u.role==='agent').length,
        merchants:users.filter(u=>u.role==='marchand').length,
        pendingKyc:kycSnap.docs.filter(d=>(d.data()as any).status==='pending').length,
        pendingUpgrades:upgradeSnap.docs.filter(d=>(d.data()as any).status==='pending').length,
        pendingCardRequests:requestSnap.docs.filter(d=>['pending','in_review'].includes(String((d.data()as any).status))).length,
        availableCards:cardsSnap.docs.filter(d=>String((d.data()as any).saleStatus)==='available').length,
        activeDeliveries:deliverySnap.docs.filter(d=>['pending','assigned','out_for_delivery','in_progress'].includes(String((d.data()as any).status))).length,
        activePaymentMethods:paymentMethods.filter(m=>m.active).length,
      });
    }catch(error){console.error('[ADMIN_DASHBOARD_ERROR]',error)}
    finally{setLoading(false);setRefreshing(false)}
  };

  useEffect(()=>{void load()},[]);

  const modules=[
    {label:'Clients et portefeuilles',description:'Comptes clients, wallets et sécurité.',icon:WalletCards,to:'/admin/users',badge:stats.clients},
    {label:'Validations',description:'KYC et demandes Agent / Marchand.',icon:ShieldCheck,to:'/admin/account-requests',badge:stats.pendingKyc+stats.pendingUpgrades},
    {label:'Agents',description:'Points de vente, float et contrôle des comptes.',icon:HandCoins,to:'/admin/agents',badge:stats.agents},
    {label:'Demandes de cartes',description:'Traitement des commandes et validations.',icon:CreditCard,to:'/admin/requests',badge:stats.pendingCardRequests},
    {label:'Stock cartes',description:'Cartes disponibles et gestion du stock.',icon:Boxes,to:'/admin/stock',badge:stats.availableCards},
    {label:'Livraisons',description:'Suivi des cartes physiques à livrer.',icon:Truck,to:'/admin/deliveries',badge:stats.activeDeliveries},
    {label:'Configuration',description:'Paiements et paramètres administratifs.',icon:Settings2,to:'/admin/settings',badge:stats.activePaymentMethods},
  ];

  const pendingTotal=stats.pendingKyc+stats.pendingUpgrades+stats.pendingCardRequests;

  return <div className="space-y-5 pb-20">
    <section className="flex items-center justify-between gap-4 rounded-3xl bg-blue-950 p-5 text-white shadow-lg">
      <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-400">Centre de contrôle</p><h1 className="mt-1 text-2xl font-black">Administration</h1><p className="mt-1 text-xs text-blue-200">Pilotage général de Market-Cash.</p></div>
      <button onClick={load} disabled={refreshing} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 disabled:opacity-50" aria-label="Actualiser"><RefreshCw size={18} className={refreshing?'animate-spin':''}/></button>
    </section>

    {loading?<div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-500">Chargement…</div>:<>
      <section className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black text-slate-950">Vue rapide</h2><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Statistiques</span></div>
        <div className="grid grid-cols-4 divide-x rounded-2xl bg-slate-50 py-3">
          <Stat value={stats.totalUsers} label="Utilisateurs"/>
          <Stat value={stats.clients} label="Clients"/>
          <Stat value={stats.agents} label="Agents"/>
          <Stat value={stats.merchants} label="Marchands"/>
        </div>
      </section>

      {pendingTotal>0&&<section className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-black text-amber-950">{pendingTotal} élément(s) à traiter</p><p className="mt-1 text-xs text-amber-800">KYC {stats.pendingKyc} · comptes pro {stats.pendingUpgrades} · cartes {stats.pendingCardRequests}</p></div><button onClick={()=>navigate(stats.pendingKyc+stats.pendingUpgrades>0?'/admin/account-requests':'/admin/requests')} className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-black text-blue-950">Ouvrir</button></div>
      </section>}

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black text-slate-950">Gestion</h2><span className="text-[10px] font-bold text-slate-400">Modules uniques</span></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{modules.map(item=>{const I=item.icon;return <button key={item.label} onClick={()=>navigate(item.to)} className="rounded-3xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-950"><I size={20}/></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{item.badge}</span></div><p className="mt-4 text-sm font-black text-slate-950">{item.label}</p><p className="mt-1 hidden text-xs leading-5 text-slate-500 sm:block">{item.description}</p></button>})}</div>
      </section>
    </>}
  </div>;
}

function Stat({value,label}:{value:number;label:string}){return <div className="px-2 text-center"><div className="text-xl font-black text-blue-950">{value}</div><div className="mt-1 truncate text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div></div>}
