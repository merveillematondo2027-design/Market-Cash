import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, Library, Truck, User, Shield } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';

export default function AdminLayout() {
  const location = useLocation();
  const { user } = useAuthStore();

  
  const navItems = [
    { name: 'Tableau', fullName: 'Tableau de bord', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Stock', fullName: 'Stock', path: '/admin/stock', icon: Package },
    { name: 'Biliothèque', fullName: 'Bibliothèque', path: '/admin/library', icon: Library },
    { name: 'Livraison', fullName: 'Livraison', path: '/admin/deliveries', icon: Truck },
    { name: 'Profil', fullName: 'Profil', path: '/admin/profile', icon: User },
  ];


  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-800 antialiased selection:bg-purple-600 selection:text-white">
      {/* Mobile Header */}
      <header className="md:hidden bg-blue-950 text-white px-4 py-3 flex justify-between items-center z-20 sticky top-0 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-amber-400 rounded-xl flex items-center justify-center border-2 border-blue-950 shadow-sm text-blue-950">
            <Shield size={16} />
          </div>
          <div>
            <div className="font-black text-sm tracking-tight text-white flex items-center gap-1.5">
              <span>MARKET-CASH</span>
              <span className="text-[9px] bg-purple-600 text-white px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                Admin
              </span>
            </div>
            <p className="text-[9px] text-blue-200 truncate max-w-[200px]">
              {user?.displayName || user?.email}
            </p>
          </div>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-blue-950 border-r border-blue-900 min-h-screen shrink-0 text-white">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-amber-400 rounded-2xl flex items-center justify-center text-blue-950 font-black shadow-md">
              <Shield size={22} />
            </div>
            <div>
              <h1 className="text-amber-400 text-xl font-black tracking-tight leading-none">
                MARKET-CASH
              </h1>
              <span className="text-[10px] text-purple-300 font-bold uppercase tracking-widest block mt-0.5">
                Administration Générale
              </span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1.5 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-sm font-bold',
                  isActive 
                    ? 'bg-blue-900 text-amber-400 shadow-md border-l-4 border-amber-400' 
                    : 'text-blue-200 hover:bg-blue-900/40 hover:text-white'
                )}
              >
                <Icon size={20} />
                <span>{item.fullName}</span>
              </Link>
            );
          })}
        </nav>

        {/* Quick Admin Indicator in sidebar */}
        <div className="p-4 m-3 bg-blue-900/50 rounded-2xl border border-blue-800/60 text-xs text-blue-200">
          <div className="flex items-center gap-2 text-amber-400 font-bold mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Système Actif</span>
          </div>
          <p className="text-[11px] text-blue-300 leading-tight">
            Market-Cash v2.4 • Plateforme RDC
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative min-h-screen overflow-x-hidden pb-28 md:pb-8">
        <main className="flex-1 p-3 sm:p-5 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Nav - 3 primary modules */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-4 py-2 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="grid grid-cols-5 gap-1 max-w-lg mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  'flex flex-col items-center justify-center py-1 px-1 rounded-2xl transition-all duration-150 touch-manipulation',
                  isActive 
                    ? 'text-blue-950 font-black' 
                    : 'text-slate-400 hover:text-slate-600 font-medium'
                )}
              >
                <div className={cn(
                  'p-2 rounded-xl transition-all duration-200',
                  isActive ? 'bg-amber-400 text-blue-950 shadow-sm scale-105' : 'bg-transparent'
                )}>
                  <Icon size={20} />
                </div>
                <span className={cn(
                  'text-[11px] mt-1 tracking-tight',
                  isActive ? 'text-blue-950 font-black' : 'text-slate-500 font-bold'
                )}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

