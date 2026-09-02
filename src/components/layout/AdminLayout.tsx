import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Boxes, FileClock, HandCoins, LayoutDashboard, Library, Menu, ScrollText, Settings, Shield, Truck, User, Users, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';

export default function AdminLayout() {
  const location = useLocation();
  const { user } = useAuthStore();
  const [showMenu, setShowMenu] = useState(false);

  const navItems = [
    { name: 'Accueil', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Clients', path: '/admin/users', icon: Users },
    { name: 'Agents & Float', path: '/admin/agents', icon: HandCoins },
    { name: 'Demandes', path: '/admin/requests', icon: FileClock },
    { name: 'Stock', path: '/admin/stock', icon: Boxes },
    { name: 'Livraisons', path: '/admin/deliveries', icon: Truck },
    { name: 'Bibliothèque', path: '/admin/library', icon: Library },
    { name: 'Journaux', path: '/admin/logs', icon: ScrollText },
    { name: 'Paramètres', path: '/admin/settings', icon: Settings },
    { name: 'Profil', path: '/admin/profile', icon: User },
  ];

  const primary = navItems.slice(0, 4);
  const active = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased md:flex">
      <header className="md:hidden sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-950 text-white"><Shield size={18}/></div>
          <div><div className="text-sm font-black text-slate-950">MARKET-CASH</div><div className="text-[10px] font-semibold text-slate-500">Administration générale</div></div>
        </div>
        <button onClick={() => setShowMenu(true)} className="rounded-xl p-2.5 text-slate-600 hover:bg-slate-100" aria-label="Menu administration"><Menu size={21}/></button>
      </header>

      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-slate-200 md:bg-white md:min-h-screen">
        <div className="border-b border-slate-100 p-6">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-950 text-white"><Shield size={20}/></div><div><div className="font-black text-slate-950">MARKET-CASH</div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Administration</div></div></div>
        </div>
        <nav className="flex-1 space-y-1 p-3">{navItems.map(item=>{const I=item.icon;const isActive=active(item.path);return <Link key={item.path} to={item.path} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition',isActive?'bg-blue-950 text-white':'text-slate-600 hover:bg-slate-100 hover:text-slate-950')}><I size={18}/><span>{item.name}</span></Link>})}</nav>
        <div className="m-4 rounded-2xl bg-slate-50 p-4 text-xs text-slate-500"><div className="font-bold text-slate-800">Session administrateur</div><div className="mt-1 truncate">{user?.displayName || user?.email}</div><div className="mt-3 flex items-center gap-2 font-semibold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500"/> Système actif</div></div>
      </aside>

      <main className="min-w-0 flex-1 p-3 pb-24 sm:p-5 sm:pb-24 md:p-6 lg:p-8"><div className="mx-auto max-w-7xl"><Outlet/></div></main>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-5 border-t border-slate-200 bg-white md:hidden">
        {primary.map(item=>{const I=item.icon;const isActive=active(item.path);return <Link key={item.path} to={item.path} className={cn('flex flex-col items-center justify-center gap-1 text-[10px] font-bold',isActive?'text-blue-950':'text-slate-400')}><I size={20}/><span>{item.name}</span></Link>})}
        <button onClick={()=>setShowMenu(true)} className="flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-400"><Menu size={20}/><span>Plus</span></button>
      </nav>

      {showMenu && <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/35" onClick={()=>setShowMenu(false)}><aside onClick={e=>e.stopPropagation()} className="h-full w-[86%] max-w-sm overflow-y-auto bg-white p-5 shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 pb-4"><div><h2 className="text-lg font-black text-slate-950">Administration</h2><p className="text-xs text-slate-500">Tous les modules Market-Cash</p></div><button onClick={()=>setShowMenu(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X size={20}/></button></div><div className="mt-4 space-y-1">{navItems.map(item=>{const I=item.icon;return <Link key={item.path} to={item.path} onClick={()=>setShowMenu(false)} className={cn('flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold',active(item.path)?'bg-blue-950 text-white':'text-slate-700 hover:bg-slate-50')}><I size={18}/><span>{item.name}</span></Link>})}</div></aside></div>}
    </div>
  );
}
