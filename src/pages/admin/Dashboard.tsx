import{useEffect,useState}from'react';
import{useNavigate}from'react-router-dom';
import{collection,getDocs}from'firebase/firestore';
import{db}from'../../firebase/config';
import{cardService}from'../../services/cardService';
import{Boxes,CreditCard,HandCoins,RefreshCw,ShieldCheck,Store,Truck,Users,WalletCards}from'lucide-react';

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

  const kpis=[
    {label:'Utilisateurs',value:stats.totalUsers,icon:Users,to:'/admin/users'},
    {label:'KYC',value:stats.pendingKyc,icon:ShieldCheck,to:'/admin/account-requests'},
    {label:'Agents',value:stats.agents,icon:HandCoins,to:'/admin/agents'},
    {label:'Cartes en attente',value:stats.pendingCardRequests,icon:CreditCard,to:'/admin/requests'},
  ];

  const actions=[
    {label:'Clients & wallets',icon:WalletCards,to:'/admin/users',badge:stats.clients},
    {label:'KYC & comptes',icon:ShieldCheck,to:'/admin/account-requests',badge:stats.pendingKyc+stats.pendingUpgrades},
    {label:'Agents & float',icon:HandCoins,to:'/admin/agents',badge:stats.agents},
    {label:'Marchands',icon:Store,to:'/admin/account-requests',badge:stats.merchants},
    {label:'Stock cartes',icon:Boxes,to:'/admin/stock',badge:stats.availableCards},
    {label:'Livraisons',icon:Truck,to:'/admin/deliveries',badge:stats.activeDeliveries},
  ];

  return <div className="space-y-5 pb-20">
    <section className="flex items-center justify-between gap-4 rounded-3xl bg-blue-950 p-5 text-white shadow-lg">
      <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-400">Centre de contrôle</p><h1 className="mt-1 text-2xl font-black">Administration</h1></div>
      <button onClick={load} disabled={refreshing} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 disabled:opacity-50"><RefreshCw size={18} className={refreshing?'animate-spin':''}/></button>
    </section>

    {loading?<div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-500">Chargement…</div>:<>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{kpis.map(item=>{const I=item.icon;return <button key={item.label} onClick={()=>navigate(item.to)} className="rounded-3xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-blue-900"><I size={19}/></div><span className="text-3xl font-black text-slate-950">{item.value}</span></div><p className="mt-4 text-xs font-black text-slate-600">{item.label}</p></button>})}</section>

      {(stats.pendingKyc+stats.pendingUpgrades)>0&&<button onClick={()=>navigate('/admin/account-requests')} className="flex w-full items-center justify-between gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-left"><div><p className="text-sm font-black text-amber-950">Validations en attente</p><p className="mt-1 text-xs text-amber-700">{stats.pendingKyc+stats.pendingUpgrades} dossier(s)</p></div><span className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-black text-blue-950">Traiter</span></button>}

      <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black text-slate-950">Gestion</h2><span className="text-[10px] font-bold text-slate-400">{stats.activePaymentMethods} moyen(x) de paiement actif(s)</span></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{actions.map(item=>{const I=item.icon;return <button key={item.label} onClick={()=>navigate(item.to)} className="rounded-3xl border bg-white p-4 text-left shadow-sm transition hover:border-blue-200"><div className="flex items-center justify-between"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-50 text-blue-950"><I size={20}/></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{item.badge}</span></div><p className="mt-4 text-sm font-black text-slate-950">{item.label}</p></button>})}</div></section>
    </>}
  </div>;
}
