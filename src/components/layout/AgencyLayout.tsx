import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, CreditCard, Truck, Bell, User, Building, Users } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';

export default function AgencyLayout() {
  const location = useLocation();
  const { user } = useAuthStore();
  const navItems = [
    { name: 'Tableau', path: '/agency/dashboard', icon: LayoutDashboard },
    { name: 'Clients', path: '/agency/users', icon: Users },
    { name: 'Demandes', path: '/agency/requests', icon: FileText },
    { name: 'Cartes', path: '/agency/cards', icon: CreditCard },
    { name: 'Livraisons', path: '/agency/deliveries', icon: Truck },
    { name: 'Alertes', path: '/agency/notifications', icon: Bell },
    { name: 'Profil', path: '/agency/profile', icon: User },
  ];
  return <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-800 antialiased">
    <header className="md:hidden bg-blue-950 text-white px-4 py-3 flex justify-between items-center z-20 sticky top-0 shadow-md"><div className="flex items-center gap-2"><div className="w-8 h-8 bg-amber-400 rounded-xl flex items-center justify-center"><Building size={16} className="text-blue-950"/></div><div><div className="font-black text-sm">MARKET-CASH <span className="text-amber-300 text-[10px]">AGENCE</span></div><p className="text-[11px] text-blue-200">{user?.agencyName||"Chef d'Agence"}</p></div></div></header>
    <aside className="hidden md:flex flex-col w-64 bg-blue-950 min-h-screen shrink-0 text-white"><div className="p-6"><div className="flex gap-3 items-center"><div className="w-9 h-9 bg-amber-400 rounded-xl flex items-center justify-center text-blue-950"><Building/></div><div><h1 className="text-amber-400 text-xl font-black">MARKET-CASH</h1><span className="text-[10px] text-blue-300 font-bold uppercase">Espace Chef d'Agence</span></div></div>{user?.agencyName&&<div className="mt-3 bg-blue-900/50 rounded-xl p-2.5 text-xs font-bold">{user.agencyName}</div>}</div><nav className="flex-1 px-3 space-y-1">{navItems.map(item=>{const Icon=item.icon,isActive=location.pathname.startsWith(item.path);return <Link key={item.path} to={item.path} className={cn('flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold',isActive?'bg-blue-900 text-amber-400':'text-blue-200 hover:bg-blue-900/40 hover:text-white')}><Icon size={18}/>{item.name}</Link>})}</nav></aside>
    <div className="flex-1 flex flex-col relative min-h-screen overflow-x-hidden pb-24 md:pb-6"><main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto"><Outlet/></main></div>
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t px-1 py-1 z-40 overflow-x-auto"><div className="flex items-center min-w-max mx-auto">{navItems.map(item=>{const Icon=item.icon,isActive=location.pathname.startsWith(item.path);return <Link key={item.path} to={item.path} className={cn('flex flex-col items-center justify-center py-1.5 px-2 min-w-[58px]',isActive?'text-blue-950 font-black':'text-slate-400')}><div className={cn('p-1 rounded-lg',isActive?'bg-amber-400':'')}><Icon size={18}/></div><span className="text-[9px] mt-0.5">{item.name}</span></Link>})}</div></nav>
  </div>;
}
