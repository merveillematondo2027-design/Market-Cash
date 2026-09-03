import{useState}from'react';
import{Outlet,Link,useLocation}from'react-router-dom';
import{Bell,Building2,CreditCard,FileText,LayoutDashboard,Menu,Truck,User,WalletCards,X}from'lucide-react';
import{cn}from'../../lib/utils';
import{useAuthStore}from'../../store/authStore';

export default function AgencyLayout(){
  const location=useLocation();
  const{user}=useAuthStore();
  const[showMenu,setShowMenu]=useState(false);
  const navItems=[
    {name:'Vue agence',path:'/agency/dashboard',icon:LayoutDashboard},
    {name:'Opérations',path:'/agency/requests',icon:FileText},
    {name:'Cartes',path:'/agency/cards',icon:CreditCard},
    {name:'Livraisons',path:'/agency/deliveries',icon:Truck},
    {name:'Alertes',path:'/agency/notifications',icon:Bell},
    {name:'Profil',path:'/agency/profile',icon:User},
  ];
  const active=(path:string)=>location.pathname.startsWith(path);

  return <div className="min-h-screen bg-slate-50 text-slate-800 antialiased md:flex">
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:hidden"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-950 text-white"><Building2 size={19}/></div><div><div className="text-sm font-black text-blue-950">MARKET-<span className="text-amber-500">CASH</span></div><div className="max-w-[190px] truncate text-[10px] font-bold text-slate-400">{user?.agencyName||'Espace Chef d’Agence'}</div></div></div><button onClick={()=>setShowMenu(true)} className="rounded-xl p-2.5 text-slate-600"><Menu size={21}/></button></header>

    <aside className="hidden md:flex md:min-h-screen md:w-72 md:shrink-0 md:flex-col md:border-r md:border-slate-200 md:bg-white"><div className="border-b border-slate-100 p-5"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-950 text-white shadow-sm"><Building2 size={21}/></div><div><div className="font-black tracking-tight text-blue-950">MARKET-<span className="text-amber-500">CASH</span></div><div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Espace agence</div></div></div><div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-blue-700">Agence active</div><div className="mt-1 truncate text-sm font-black text-blue-950">{user?.agencyName||'Agence Market-Cash'}</div><div className="mt-1 truncate text-[11px] text-blue-800/70">{user?.displayName||user?.email}</div></div></div><nav className="flex-1 space-y-1 p-3">{navItems.map(item=>{const I=item.icon;return <Link key={item.path} to={item.path} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition',active(item.path)?'bg-blue-950 text-white shadow-sm':'text-slate-600 hover:bg-slate-100 hover:text-slate-950')}><I size={18}/><span>{item.name}</span></Link>})}</nav><div className="m-4 rounded-2xl bg-slate-950 p-4 text-white"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Mission agence</div><div className="mt-2 flex items-center gap-2 text-xs font-bold"><WalletCards size={15} className="text-amber-400"/>Servir le réseau local Market-Cash</div><p className="mt-2 text-[11px] leading-5 text-slate-400">Opérations clients, cartes physiques et coordination locale sous contrôle central.</p></div></aside>

    <main className="min-w-0 flex-1 p-3 pb-24 sm:p-5 md:p-6 lg:p-8"><div className="mx-auto max-w-7xl"><Outlet/></div></main>

    <nav className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-5 border-t border-slate-200 bg-white md:hidden">{navItems.slice(0,4).map(item=>{const I=item.icon;return <Link key={item.path} to={item.path} className={cn('flex flex-col items-center justify-center gap-1 px-1 text-[9px] font-bold',active(item.path)?'text-blue-950':'text-slate-400')}><I size={19}/><span>{item.name}</span></Link>})}<button onClick={()=>setShowMenu(true)} className="flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-400"><Menu size={20}/><span>Plus</span></button></nav>

    {showMenu&&<div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/40" onClick={()=>setShowMenu(false)}><aside onClick={e=>e.stopPropagation()} className="h-full w-[88%] max-w-sm bg-white p-5 shadow-2xl"><div className="flex items-center justify-between border-b pb-4"><div><h2 className="text-lg font-black text-blue-950">Espace agence</h2><p className="text-xs text-slate-500">{user?.agencyName||'Market-Cash'}</p></div><button onClick={()=>setShowMenu(false)} className="rounded-xl p-2 hover:bg-slate-100"><X size={20}/></button></div><div className="mt-5 space-y-1">{navItems.map(item=>{const I=item.icon;return <Link key={item.path} to={item.path} onClick={()=>setShowMenu(false)} className={cn('flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold',active(item.path)?'bg-blue-950 text-white':'text-slate-700')}><I size={18}/><span>{item.name}</span></Link>})}</div></aside></div>}
  </div>;
}
