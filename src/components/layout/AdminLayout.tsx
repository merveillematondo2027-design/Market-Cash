import{useState}from'react';
import{Outlet,Link,useLocation}from'react-router-dom';
import{Bell,Boxes,Building2,FileClock,HandCoins,LayoutDashboard,Library,Menu,ScrollText,Settings,Shield,ShieldCheck,Truck,User,Users,WalletCards,X}from'lucide-react';
import{cn}from'../../lib/utils';
import{useAuthStore}from'../../store/authStore';

export default function AdminLayout(){
  const location=useLocation();
  const{user}=useAuthStore();
  const[showMenu,setShowMenu]=useState(false);
  const isOperations=user?.role==='agent_administratif';

  const generalItems=[
    {name:'Vue d’ensemble',path:'/admin/dashboard',icon:LayoutDashboard,group:'Pilotage'},
    {name:'Clients & Wallets',path:'/admin/users',icon:WalletCards,group:'Pilotage'},
    {name:'KYC & Comptes',path:'/admin/account-requests',icon:ShieldCheck,group:'Pilotage'},
    {name:'Agents & Float',path:'/admin/agents',icon:HandCoins,group:'Réseau'},
    {name:'Demandes',path:'/admin/requests',icon:FileClock,group:'Opérations'},
    {name:'Stock cartes',path:'/admin/stock',icon:Boxes,group:'Opérations'},
    {name:'Livraisons',path:'/admin/deliveries',icon:Truck,group:'Opérations'},
    {name:'Bibliothèque cartes',path:'/admin/library',icon:Library,group:'Opérations'},
    {name:'Notifications',path:'/admin/notifications',icon:Bell,group:'Système'},
    {name:'Journaux',path:'/admin/logs',icon:ScrollText,group:'Système'},
    {name:'Paramètres',path:'/admin/settings',icon:Settings,group:'Système'},
    {name:'Profil',path:'/admin/profile',icon:User,group:'Système'},
  ];

  const operationsItems=[
    {name:'KYC & Comptes',path:'/admin/account-requests',icon:ShieldCheck,group:'Opérations'},
    {name:'Clients & Wallets',path:'/admin/users',icon:WalletCards,group:'Opérations'},
    {name:'Notifications',path:'/admin/notifications',icon:Bell,group:'Système'},
    {name:'Profil',path:'/admin/profile',icon:User,group:'Système'},
  ];

  const navItems=isOperations?operationsItems:generalItems;
  const primary=navItems.slice(0,4);
  const active=(path:string)=>location.pathname.startsWith(path);
  const sessionLabel=isOperations?'Agent administratif':'Administration générale';
  const groups=[...new Set(navItems.map(item=>item.group))];

  const navigation=<>{groups.map(group=><div key={group} className="mb-4"><div className="px-3 pb-1 text-[10px] font-black uppercase tracking-[.16em] text-slate-400">{group}</div><div className="space-y-1">{navItems.filter(item=>item.group===group).map(item=>{const I=item.icon;return <Link key={item.path} to={item.path} onClick={()=>setShowMenu(false)} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition',active(item.path)?'bg-blue-950 text-white shadow-sm':'text-slate-600 hover:bg-slate-100 hover:text-slate-950')}><I size={18}/><span>{item.name}</span></Link>})}</div></div>)}</>;

  return <div className="min-h-screen bg-slate-50 text-slate-800 antialiased md:flex">
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:hidden"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-950 text-white"><Shield size={19}/></div><div><div className="text-sm font-black text-blue-950">MARKET-<span className="text-amber-500">CASH</span></div><div className="text-[10px] font-bold text-slate-400">{sessionLabel}</div></div></div><button onClick={()=>setShowMenu(true)} className="rounded-xl p-2.5 text-slate-600"><Menu size={21}/></button></header>

    <aside className="hidden md:flex md:min-h-screen md:w-72 md:shrink-0 md:flex-col md:border-r md:border-slate-200 md:bg-white"><div className="border-b border-slate-100 p-5"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-950 text-white shadow-sm"><Shield size={21}/></div><div><div className="font-black tracking-tight text-blue-950">MARKET-<span className="text-amber-500">CASH</span></div><div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{isOperations?'Opérations':'Control Center'}</div></div></div><div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3"><div className="flex items-center gap-2 text-xs font-black text-blue-950"><Building2 size={14}/>{sessionLabel}</div><div className="mt-1 truncate text-[11px] text-blue-800/70">{user?.displayName||user?.email}</div></div></div><nav className="flex-1 overflow-y-auto p-3">{navigation}</nav><div className="m-4 rounded-2xl bg-slate-950 p-4 text-white"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Architecture active</div><div className="mt-2 flex items-center gap-2 text-xs font-bold"><WalletCards size={15} className="text-amber-400"/>Wallet → Réseau → Cartes</div></div></aside>

    <main className="min-w-0 flex-1 p-3 pb-24 sm:p-5 md:p-6 lg:p-8"><div className="mx-auto max-w-7xl"><Outlet/></div></main>

    <nav className={`fixed inset-x-0 bottom-0 z-40 grid h-16 border-t border-slate-200 bg-white md:hidden ${primary.length===4?'grid-cols-5':'grid-cols-4'}`}>{primary.map(item=>{const I=item.icon;return <Link key={item.path} to={item.path} className={cn('flex flex-col items-center justify-center gap-1 px-1 text-center text-[9px] font-bold',active(item.path)?'text-blue-950':'text-slate-400')}><I size={20}/><span className="max-w-[72px] truncate">{item.name}</span></Link>})}<button onClick={()=>setShowMenu(true)} className="flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-400"><Menu size={20}/><span>Plus</span></button></nav>

    {showMenu&&<div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/40" onClick={()=>setShowMenu(false)}><aside onClick={e=>e.stopPropagation()} className="h-full w-[88%] max-w-sm overflow-y-auto bg-white p-5 shadow-2xl"><div className="flex items-center justify-between border-b pb-4"><div><h2 className="text-lg font-black text-blue-950">Market-Cash Admin</h2><p className="text-xs text-slate-500">{sessionLabel}</p></div><button onClick={()=>setShowMenu(false)} className="rounded-xl p-2 hover:bg-slate-100"><X size={20}/></button></div><div className="mt-5">{navigation}</div></aside></div>}
  </div>;
}
