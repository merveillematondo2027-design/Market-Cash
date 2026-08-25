import React from 'react';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LogoutModal({ isOpen, onClose }: LogoutModalProps) {
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleLogout = async () => {
    console.log('[LOGOUT_START]');
    try {
      await logout();
      console.log('[LOGOUT_SUCCESS]');
      toast.success('Déconnexion réussie');
      navigate('/login');
    } catch (error) {
      console.log('[LOGOUT_ERROR]');
      toast.error('Impossible de vous déconnecter. Veuillez réessayer.');
    }
  };

  const handleCancel = () => {
    console.log('[LOGOUT_CANCEL]');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-10 text-center shadow-2xl">
        <div className="w-24 h-24 bg-red-50 text-red-500 rounded-[2rem] flex items-center justify-center mx-auto mb-6 transform -rotate-6 shadow-sm">
          <LogOut size={40} />
        </div>
        <h3 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">Se déconnecter ?</h3>
        <p className="text-slate-500 mb-10 font-medium leading-relaxed">
          Voulez-vous vraiment vous déconnecter de votre compte Market-Cash ?
        </p>
        
        <div className="flex space-x-4">
          <button 
            onClick={handleCancel}
            className="flex-1 py-4 rounded-2xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Annuler
          </button>
          <button 
            onClick={handleLogout}
            className="flex-1 py-4 rounded-2xl font-black text-white bg-red-500 hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30 tracking-wide"
          >
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
