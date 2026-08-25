import { Outlet, Link, useLocation } from 'react-router-dom';
import { Truck, CheckCircle2, Bell, User, Clock, MapPin } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';

export default function DeliveryLayout() {
  const location = useLocation();
  const { user } = useAuthStore();

  const navItems = [
    { name: 'Courses', path: '/delivery/dashboard', icon: Truck },
    { name: 'Historique', path: '/delivery/history', icon: CheckCircle2 },
    { name: 'Alertes', path: '/delivery/notifications', icon: Bell },
    { name: 'Profil', path: '/delivery/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-800 antialiased selection:bg-emerald-500 selection:text-white">
      {/* Mobile Top Header */}
      <header className="md:hidden bg-blue-950 text-white px-4 py-3 flex justify-between items-center z-20 sticky top-0 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center border-2 border-white shadow-sm text-white">
            <Truck size={16} />
          </div>
          <div>
            <div className="font-black text-sm tracking-tight text-white flex items-center gap-1.5">
              <span>MARKET-CASH</span>
              <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                Livreur
              </span>
            </div>
            <p className="text-[11px] text-emerald-200 truncate max-w-[190px]">
              {user?.displayName || user?.email}
            </p>
          </div>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-blue-950 border-r border-blue-900 min-h-screen shrink-0 text-white">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-black shadow-md">
              <Truck size={20} />
            </div>
            <div>
              <h1 className="text-amber-400 text-xl font-black tracking-tight leading-none">
                MARKET-CASH
              </h1>
              <span className="text-[10px] text-emerald-300 font-bold uppercase tracking-widest">
                Service Livraison
              </span>
            </div>
          </div>
          <div className="mt-3 bg-blue-900/40 border border-blue-800/60 rounded-xl p-2.5">
            <div className="text-[10px] text-blue-300 uppercase tracking-wider font-semibold">Livreur Actif</div>
            <div className="text-xs font-bold text-white truncate">{user?.displayName || user?.email}</div>
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
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-sm font-bold',
                  isActive 
                    ? 'bg-emerald-600 text-white shadow-md font-black' 
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
        <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-3 py-1.5 z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around max-w-md mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  'flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all duration-150 touch-manipulation',
                  isActive ? 'text-emerald-700 font-black' : 'text-slate-400 hover:text-slate-600 font-medium'
                )}
              >
                <div className={cn(
                  'p-1.5 rounded-lg transition-colors',
                  isActive ? 'bg-emerald-500 text-white shadow-sm' : 'bg-transparent'
                )}>
                  <Icon size={18} />
                </div>
                <span className={cn(
                  'text-[10px] mt-0.5 leading-none',
                  isActive ? 'text-emerald-800 font-bold' : 'text-slate-500'
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
