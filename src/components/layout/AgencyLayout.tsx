import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, CreditCard, Truck, Bell, User, Building } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';

export default function AgencyLayout() {
  const location = useLocation();
  const { user } = useAuthStore();

  const navItems = [
    { name: 'Tableau', path: '/agency/dashboard', icon: LayoutDashboard },
    { name: 'Demandes', path: '/agency/requests', icon: FileText },
    { name: 'Cartes', path: '/agency/cards', icon: CreditCard },
    { name: 'Livraisons', path: '/agency/deliveries', icon: Truck },
    { name: 'Alertes', path: '/agency/notifications', icon: Bell },
    { name: 'Profil', path: '/agency/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-800 antialiased selection:bg-blue-500 selection:text-white">
      {/* Mobile Top Header */}
      <header className="md:hidden bg-blue-950 text-white px-4 py-3 flex justify-between items-center z-20 sticky top-0 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-400 rounded-xl flex items-center justify-center border-2 border-blue-950 shadow-sm">
            <Building size={16} className="text-blue-950" />
          </div>
          <div>
            <div className="font-black text-sm tracking-tight text-white flex items-center gap-1.5">
              <span>MARKET-CASH</span>
              <span className="text-[10px] bg-blue-800/80 text-amber-300 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                Agence
              </span>
            </div>
            <p className="text-[11px] text-blue-200 truncate max-w-[180px]">
              {user?.agencyName || 'Chef d\'Agence'}
            </p>
          </div>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-blue-950 border-r border-blue-900 min-h-screen shrink-0 text-white">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-amber-400 rounded-xl flex items-center justify-center text-blue-950 font-black shadow-md">
              <Building size={20} />
            </div>
            <div>
              <h1 className="text-amber-400 text-xl font-black tracking-tight leading-none">
                MARKET-CASH
              </h1>
              <span className="text-[10px] text-blue-300 font-bold uppercase tracking-widest">
                Espace Chef d'Agence
              </span>
            </div>
          </div>
          {user?.agencyName && (
            <div className="mt-3 bg-blue-900/50 border border-blue-800/50 rounded-xl p-2.5">
              <div className="text-[10px] text-blue-300 uppercase tracking-wider font-semibold">Agence</div>
              <div className="text-xs font-bold text-white truncate">{user.agencyName}</div>
            </div>
          )}
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
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-sm font-bold',
                  isActive 
                    ? 'bg-blue-900 text-amber-400 shadow-sm border-l-4 border-amber-400' 
                    : 'text-blue-200 hover:bg-blue-900/40 hover:text-white'
                )}
              >
                <Icon size={18} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative min-h-screen overflow-x-hidden pb-20 md:pb-6">
        <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Android Optimized) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 py-1 z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  'flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all duration-150 min-w-[50px] touch-manipulation',
                  isActive 
                    ? 'text-blue-950 font-black scale-105' 
                    : 'text-slate-400 hover:text-slate-600 font-medium'
                )}
              >
                <div className={cn(
                  'p-1 rounded-lg transition-colors',
                  isActive ? 'bg-amber-400 text-blue-950' : 'bg-transparent'
                )}>
                  <Icon size={18} />
                </div>
                <span className={cn(
                  'text-[10px] mt-0.5 leading-none',
                  isActive ? 'text-blue-950 font-bold' : 'text-slate-500'
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
