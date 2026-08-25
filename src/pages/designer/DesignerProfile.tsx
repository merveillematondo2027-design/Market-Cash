import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { LogOut, Printer, User } from 'lucide-react';
import LogoutModal from '../../components/LogoutModal';

export default function DesignerProfile() {
  const { user } = useAuthStore();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  if (!user) return null;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">Profil Designer Graphique</h1>
      
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm flex flex-col items-center text-center relative overflow-hidden space-y-4">
        <div className="w-24 h-24 bg-blue-950 rounded-3xl flex items-center justify-center text-amber-400 border-4 border-white shadow-lg">
          <Printer size={40} />
        </div>

        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">
            {user.displayName || 'Designer Graphique'}
          </h2>
          <p className="text-xs text-slate-500 font-medium">{user.email}</p>
        </div>

        <span className="bg-amber-100 text-amber-900 border border-amber-200 px-3.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider">
          Production & Tirage PVC
        </span>

        <div className="w-full bg-slate-50 rounded-2xl p-4 border border-slate-100 text-left space-y-2 text-xs">
          <div className="flex justify-between py-1 border-b border-slate-200/60">
            <span className="text-slate-400">Rôle :</span>
            <span className="font-bold text-slate-800">Designer Graphique</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-200/60">
            <span className="text-slate-400">Atelier :</span>
            <span className="font-bold text-slate-800">Impression Plastique ISO PVC</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-slate-400">UID :</span>
            <span className="font-mono text-slate-600 truncate max-w-[180px]">{user.uid}</span>
          </div>
        </div>

        <button 
          onClick={() => setShowLogoutModal(true)}
          className="flex items-center space-x-2 bg-slate-100 text-slate-700 hover:text-red-600 hover:bg-red-50 w-full justify-center py-3 rounded-2xl font-bold text-sm transition-all"
        >
          <LogOut size={18} />
          <span>Se déconnecter</span>
        </button>
      </div>

      <LogoutModal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} />
    </div>
  );
}
