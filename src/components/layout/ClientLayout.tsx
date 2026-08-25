import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  CreditCard, 
  HelpCircle, 
  User, 
  Bell, 
  CheckCircle2, 
  XCircle, 
  Info, 
  Trash2, 
  CheckCheck,
  X,
  ExternalLink,
  Sparkles,
  Truck
} from 'lucide-react';
import { cn, formatTimeAgo, playNotificationSound } from '../../lib/utils';
import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  deleteDoc, 
  orderBy, 
  writeBatch 
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuthStore } from '../../store/authStore';
import { Notification } from '../../types';
import LogoutModal from '../LogoutModal';
import toast from 'react-hot-toast';

export default function ClientLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);

  const isInitialSnapshotRef = useRef(true);
  const initialMountTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!user) return;
    isInitialSnapshotRef.current = true;
    initialMountTimeRef.current = Date.now();

    const q = query(
      collection(db, 'notifications'), 
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as Notification))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      
      // Check for newly added notifications after initial load
      if (!isInitialSnapshotRef.current) {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const newNotif = { ...change.doc.data(), id: change.doc.id } as Notification;
            
            // Only trigger toast for notifications created around or after component mounted
            if (newNotif.createdAt >= initialMountTimeRef.current - 5000 && !newNotif.read) {
              playNotificationSound();
              
              // Show rich in-app notification toast
              toast.custom((t) => (
                <div
                  className={cn(
                    "max-w-md w-full bg-white shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-black/5 overflow-hidden transition-all duration-300 transform border-2",
                    newNotif.type === 'success' ? 'border-emerald-500/30' : newNotif.type === 'error' ? 'border-red-500/30' : 'border-blue-500/30',
                    t.visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
                  )}
                >
                  <div className="flex-1 w-0 p-4">
                    <div className="flex items-start">
                      <div className="flex-shrink-0 pt-0.5">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md",
                          newNotif.type === 'success' ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
                          newNotif.type === 'error' ? 'bg-gradient-to-br from-red-500 to-rose-600' :
                          'bg-gradient-to-br from-blue-500 to-indigo-600'
                        )}>
                          {newNotif.type === 'success' ? <CreditCard size={20} /> :
                           newNotif.type === 'error' ? <XCircle size={20} /> :
                           <Bell size={20} />}
                        </div>
                      </div>
                      <div className="ml-3.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md",
                            newNotif.type === 'success' ? 'bg-emerald-50 text-emerald-700' :
                            newNotif.type === 'error' ? 'bg-red-50 text-red-700' :
                            'bg-blue-50 text-blue-700'
                          )}>
                            {newNotif.category === 'card_status' ? 'Statut Carte' : 'Notification'}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">À l'instant</span>
                        </div>
                        <p className="text-sm font-bold text-slate-900 mt-1">
                          {newNotif.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {newNotif.message}
                        </p>
                        
                        <div className="mt-3 flex items-center gap-2">
                          {(newNotif.category === 'delivery' || newNotif.title?.includes('imprimée') || newNotif.title?.includes('livreur')) ? (
                            <button
                              onClick={() => {
                                toast.dismiss(t.id);
                                markAsRead(newNotif.id);
                                navigate(`/client/cards?delivery=true&cardId=${newNotif.cardId || newNotif.cardIdentifier || ''}`);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-blue-950 text-xs font-black rounded-lg transition-colors shadow-sm"
                            >
                              <Truck size={13} />
                              Prendre contact avec le livreur
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                toast.dismiss(t.id);
                                markAsRead(newNotif.id);
                                navigate('/client/cards');
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-950 hover:bg-blue-900 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                            >
                              <CreditCard size={13} />
                              Voir mes cartes
                            </button>
                          )}
                          <button
                            onClick={() => {
                              toast.dismiss(t.id);
                              markAsRead(newNotif.id);
                            }}
                            className="px-2.5 py-1.5 text-slate-500 hover:text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            Marquer comme lu
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex border-l border-slate-100">
                    <button
                      onClick={() => toast.dismiss(t.id)}
                      className="w-full border border-transparent rounded-none rounded-r-2xl p-4 flex items-center justify-center text-slate-400 hover:text-slate-600 focus:outline-none"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              ), { duration: 6500, position: 'top-right' });
            }
          }
        });
      }

      setNotifications(items);
      isInitialSnapshotRef.current = false;
    });

    return () => unsubscribe();
  }, [user?.uid, navigate]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const filteredNotifications = filter === 'unread' 
    ? notifications.filter(n => !n.read) 
    : notifications;

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (e) {
      console.error('Error marking as read', e);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach(n => {
        batch.update(doc(db, 'notifications', n.id), { read: true });
      });
      await batch.commit();
      toast.success('Toutes les notifications ont été marquées comme lues.');
    } catch (e) {
      toast.error('Erreur lors de la mise à jour.');
    }
  };

  const deleteNotification = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'notifications', id));
      toast.success('Notification supprimée.');
      if (selectedNotif?.id === id) {
        setSelectedNotif(null);
      }
    } catch (e) {
      toast.error('Erreur lors de la suppression.');
    }
  };

  const navItems = [
    { name: 'Cartes', path: '/client/cards', icon: CreditCard },
    { name: 'Aides', path: '/client/help', icon: HelpCircle },
    { name: 'Profil', path: '/client/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-800">
      
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-blue-950 border-r border-blue-900 min-h-screen">
        <div className="p-8">
          <h1 className="text-amber-400 text-2xl font-black tracking-tighter flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-400 rounded-md flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-blue-950 rounded-full"></div>
            </div>
            MARKET-CASH
          </h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.name}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-bold',
                  isActive 
                    ? 'bg-blue-900/50 text-amber-400' 
                    : 'text-blue-300 hover:bg-blue-900/30 hover:text-white'
                )}
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4">
          <div className="bg-blue-900/40 rounded-2xl p-4 border border-blue-800/50">
            <p className="text-xs text-blue-400 uppercase tracking-widest font-semibold mb-2">Assistance Directe</p>
            <a 
              href="https://wa.me/243820743730?text=Bonjour%20AUTOMARKET%20RDC%2C%20j%27ai%20besoin%20d%27aide%20concernant%20mon%20compte%20Market-Cash." 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
            >
              WhatsApp RDC
            </a>
          </div>
          <button 
            onClick={() => {
              console.log('[LOGOUT_CONFIRM_OPEN]');
              setShowLogoutModal(true);
            }}
            className="w-full mt-4 flex items-center justify-center gap-2 py-3 text-blue-400 text-sm font-semibold border border-blue-900 rounded-xl hover:text-red-400 hover:border-red-900 transition-all"
          >
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* Main Content Container */}
      <div className="flex-1 flex flex-col relative h-screen overflow-hidden">
        
        {/* Desktop Header area with user info & notifications */}
        <header className="hidden md:flex justify-between items-end p-8 pb-4 shrink-0">
          <div>
            <h2 className="text-3xl font-extrabold text-blue-950 tracking-tight">
              Bienvenue, {user?.displayName?.split(' ')[0] || 'Client'}
            </h2>
            <p className="text-slate-500 text-sm font-medium">Gérez vos cartes Market-Cash et suivez vos demandes en direct.</p>
          </div>
          <div className="flex items-center gap-4">
            
            {/* Notifications Bell & Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setShowNotif(!showNotif)}
                aria-label="Notifications"
                className={cn(
                  "w-11 h-11 rounded-2xl border flex items-center justify-center cursor-pointer transition-all duration-200 shadow-sm relative",
                  showNotif 
                    ? "bg-blue-950 text-white border-blue-950 ring-4 ring-blue-100" 
                    : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:text-blue-600"
                )}
              >
                <Bell size={20} className={cn(unreadCount > 0 ? "animate-pulse" : "")} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 border-2 border-white rounded-full flex items-center justify-center text-[10px] text-white font-black shadow-sm">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              
              {showNotif && (
                <div className="absolute right-0 mt-3 w-96 bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  {/* Dropdown Header */}
                  <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-slate-800 text-base tracking-tight">Notifications</h3>
                      {unreadCount > 0 && (
                        <span className="bg-red-100 text-red-700 text-xs font-black px-2 py-0.5 rounded-full">
                          {unreadCount} nouvelle{unreadCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button 
                        onClick={markAllAsRead} 
                        className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1 cursor-pointer"
                        title="Tout marquer comme lu"
                      >
                        <CheckCheck size={14} />
                        Tout lire
                      </button>
                    )}
                  </div>

                  {/* Filter Tabs */}
                  <div className="px-4 py-2 border-b border-slate-100 bg-white flex gap-2 text-xs font-bold">
                    <button
                      onClick={() => setFilter('all')}
                      className={cn(
                        "px-3 py-1.5 rounded-xl transition-colors",
                        filter === 'all' 
                          ? "bg-slate-900 text-white" 
                          : "text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      Toutes ({notifications.length})
                    </button>
                    <button
                      onClick={() => setFilter('unread')}
                      className={cn(
                        "px-3 py-1.5 rounded-xl transition-colors",
                        filter === 'unread' 
                          ? "bg-blue-600 text-white" 
                          : "text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      Non lues ({unreadCount})
                    </button>
                  </div>

                  {/* Notification List */}
                  <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                    {filteredNotifications.length === 0 ? (
                      <div className="p-10 text-center flex flex-col items-center justify-center">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                          <Bell size={22} />
                        </div>
                        <p className="text-slate-700 font-bold text-sm">Aucune notification</p>
                        <p className="text-slate-400 text-xs mt-0.5">
                          {filter === 'unread' ? "Toutes vos notifications sont lues." : "Les mises à jour apparaîtront ici."}
                        </p>
                      </div>
                    ) : (
                      filteredNotifications.map(n => (
                        <div 
                          key={n.id} 
                          onClick={() => {
                            if (!n.read) markAsRead(n.id);
                            setSelectedNotif(n);
                          }}
                          className={cn(
                            "p-4 transition-all duration-150 cursor-pointer relative group flex gap-3.5 items-start hover:bg-slate-50",
                            !n.read ? "bg-blue-50/40" : "bg-white"
                          )}
                        >
                          {/* Unread indicator dot */}
                          {!n.read && (
                            <span className="absolute left-2 top-5 w-2 h-2 rounded-full bg-blue-600" />
                          )}

                          {/* Icon badge */}
                          <div className={cn(
                            "w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-white shadow-sm mt-0.5",
                            n.type === 'success' ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
                            n.type === 'error' ? 'bg-gradient-to-br from-red-500 to-rose-600' :
                            'bg-gradient-to-br from-blue-500 to-indigo-600'
                          )}>
                            {n.type === 'success' ? <CreditCard size={18} /> :
                             n.type === 'error' ? <XCircle size={18} /> :
                             <Info size={18} />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className={cn(
                                "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
                                n.type === 'success' ? 'bg-emerald-100 text-emerald-800' :
                                n.type === 'error' ? 'bg-red-100 text-red-800' :
                                'bg-blue-100 text-blue-800'
                              )}>
                                {n.category === 'card_status' ? 'Statut Carte' : 'Message'}
                              </span>
                              <span className="text-[11px] text-slate-400 font-medium">
                                {formatTimeAgo(n.createdAt)}
                              </span>
                            </div>

                            <h4 className={cn("text-xs font-bold leading-snug line-clamp-1", !n.read ? "text-slate-900 font-extrabold" : "text-slate-700")}>
                              {n.title}
                            </h4>
                            <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                              {n.message}
                            </p>

                            {/* Quick Actions Footer */}
                            <div className="mt-2.5 flex items-center justify-between pt-1">
                              {(n.category === 'delivery' || n.title?.includes('imprimée') || n.title?.includes('livreur')) ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead(n.id);
                                    setShowNotif(false);
                                    navigate(`/client/cards?delivery=true&cardId=${n.cardId || n.cardIdentifier || ''}`);
                                  }}
                                  className="text-[11px] font-black text-amber-600 hover:text-amber-700 flex items-center gap-1"
                                >
                                  Prendre contact avec le livreur <Truck size={11} />
                                </button>
                              ) : n.category === 'card_status' ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead(n.id);
                                    setShowNotif(false);
                                    navigate('/client/cards');
                                  }}
                                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                >
                                  Voir mes cartes <ExternalLink size={11} />
                                </button>
                              ) : <span />}

                              <div className="flex items-center gap-1">
                                {!n.read && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      markAsRead(n.id);
                                    }} 
                                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                                    title="Marquer comme lu"
                                  >
                                    <CheckCircle2 size={15} />
                                  </button>
                                )}
                                <button 
                                  onClick={(e) => deleteNotification(n.id, e)} 
                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100" 
                                  title="Supprimer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {notifications.length > 0 && (
                    <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
                      <Link
                        to="/client/cards"
                        onClick={() => setShowNotif(false)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800"
                      >
                        Consulter mes demandes de cartes →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* User Profile Pill */}
            <Link to="/client/profile" className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm hover:border-amber-400 transition-colors cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold overflow-hidden">
                {user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : user?.displayName?.charAt(0) || 'U'}
              </div>
              <div className="text-xs">
                <p className="font-bold text-slate-900">{user?.displayName || 'Client'}</p>
                <p className="text-slate-400">Client</p>
              </div>
            </Link>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:px-8 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile Top Header */}
      <header className="md:hidden fixed top-0 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 z-50 h-14 flex items-center justify-between px-4">
        <div className="text-lg font-black text-blue-950 tracking-tight flex items-center gap-2">
          <div className="w-6 h-6 bg-amber-400 rounded-md flex items-center justify-center">
            <div className="w-3.5 h-3.5 border-2 border-blue-950 rounded-full"></div>
          </div>
          MARKET-CASH
        </div>
        <button 
          onClick={() => setShowNotif(!showNotif)}
          className="p-2 text-slate-600 relative rounded-xl hover:bg-slate-100 transition-colors"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[18px] h-4.5 px-1 bg-red-500 text-white rounded-full text-[10px] font-black flex items-center justify-center border-2 border-white">
              {unreadCount}
            </span>
          )}
        </button>
      </header>

      {/* Mobile Notifications Modal Drawer */}
      {showNotif && (
        <div className="md:hidden fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end">
          <div className="bg-white rounded-t-[2.5rem] w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
            
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-800 text-lg">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="bg-red-100 text-red-700 text-xs font-black px-2 py-0.5 rounded-full">
                    {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllAsRead}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800"
                  >
                    Tout lire
                  </button>
                )}
                <button 
                  onClick={() => setShowNotif(false)} 
                  className="p-1.5 rounded-full bg-slate-200/80 text-slate-600 hover:bg-slate-300"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Filter */}
            <div className="px-4 py-2 border-b border-slate-100 flex gap-2 text-xs font-bold bg-white">
              <button
                onClick={() => setFilter('all')}
                className={cn(
                  "px-3 py-1.5 rounded-xl transition-colors",
                  filter === 'all' ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
                )}
              >
                Toutes ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={cn(
                  "px-3 py-1.5 rounded-xl transition-colors",
                  filter === 'unread' ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"
                )}
              >
                Non lues ({unreadCount})
              </button>
            </div>

            {/* Mobile list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
              {filteredNotifications.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <Bell className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <p className="font-bold text-slate-700">Aucune notification</p>
                  <p className="text-xs text-slate-400 mt-1">Vous êtes à jour !</p>
                </div>
              ) : (
                filteredNotifications.map(n => (
                  <div 
                    key={n.id} 
                    onClick={() => {
                      if (!n.read) markAsRead(n.id);
                      setSelectedNotif(n);
                    }}
                    className={cn(
                      "p-4 rounded-2xl mb-1 transition flex gap-3.5 items-start",
                      !n.read ? "bg-blue-50/60" : "bg-white"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-white shadow-sm mt-0.5",
                      n.type === 'success' ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
                      n.type === 'error' ? 'bg-gradient-to-br from-red-500 to-rose-600' :
                      'bg-gradient-to-br from-blue-500 to-indigo-600'
                    )}>
                      {n.type === 'success' ? <CreditCard size={18} /> :
                       n.type === 'error' ? <XCircle size={18} /> :
                       <Info size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
                          n.type === 'success' ? 'bg-emerald-100 text-emerald-800' :
                          n.type === 'error' ? 'bg-red-100 text-red-800' :
                          'bg-blue-100 text-blue-800'
                        )}>
                          {n.category === 'card_status' ? 'Statut Carte' : 'Info'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">{formatTimeAgo(n.createdAt)}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 leading-snug">{n.title}</h4>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                      
                      <div className="mt-3 flex items-center justify-between">
                        {(n.category === 'delivery' || n.title?.includes('imprimée') || n.title?.includes('livreur')) ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(n.id);
                              setShowNotif(false);
                              navigate(`/client/cards?delivery=true&cardId=${n.cardId || n.cardIdentifier || ''}`);
                            }}
                            className="text-xs font-black text-amber-600 flex items-center gap-1"
                          >
                            Prendre contact avec le livreur →
                          </button>
                        ) : n.category === 'card_status' ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(n.id);
                              setShowNotif(false);
                              navigate('/client/cards');
                            }}
                            className="text-xs font-bold text-blue-600 flex items-center gap-1"
                          >
                            Voir mes cartes →
                          </button>
                        ) : <span />}

                        <div className="flex items-center gap-2">
                          {!n.read && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(n.id);
                              }}
                              className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-lg"
                            >
                              Lu
                            </button>
                          )}
                          <button
                            onClick={(e) => deleteNotification(n.id, e)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal for Selected Notification */}
      {selectedNotif && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-7 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-5">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md",
                selectedNotif.type === 'success' ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
                selectedNotif.type === 'error' ? 'bg-gradient-to-br from-red-500 to-rose-600' :
                'bg-gradient-to-br from-blue-500 to-indigo-600'
              )}>
                {selectedNotif.type === 'success' ? <CreditCard size={24} /> :
                 selectedNotif.type === 'error' ? <XCircle size={24} /> :
                 <Info size={24} />}
              </div>
              <button 
                onClick={() => setSelectedNotif(null)} 
                className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-2 flex items-center gap-2">
              <span className={cn(
                "text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md",
                selectedNotif.type === 'success' ? 'bg-emerald-100 text-emerald-800' :
                selectedNotif.type === 'error' ? 'bg-red-100 text-red-800' :
                'bg-blue-100 text-blue-800'
              )}>
                {selectedNotif.category === 'card_status' ? 'Mise à jour de statut' : selectedNotif.category === 'delivery' ? 'Livraison' : 'Notification'}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {new Date(selectedNotif.createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
            </div>

            <h3 className="text-xl font-extrabold text-slate-900 mb-3 tracking-tight">
              {selectedNotif.title}
            </h3>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-sm text-slate-700 leading-relaxed font-medium mb-6">
              {selectedNotif.message}
            </div>

            <div className="flex space-x-3">
              {(selectedNotif.category === 'delivery' || selectedNotif.title?.includes('imprimée') || selectedNotif.title?.includes('livreur')) ? (
                <button
                  onClick={() => {
                    setSelectedNotif(null);
                    setShowNotif(false);
                    navigate(`/client/cards?delivery=true&cardId=${selectedNotif.cardId || selectedNotif.cardIdentifier || ''}`);
                  }}
                  className="flex-1 py-3.5 bg-amber-500 hover:bg-amber-600 text-blue-950 rounded-2xl font-black text-sm transition-colors shadow-md shadow-amber-500/20 flex items-center justify-center gap-2"
                >
                  <Truck size={16} />
                  Prendre contact avec le livreur
                </button>
              ) : selectedNotif.category === 'card_status' ? (
                <button
                  onClick={() => {
                    setSelectedNotif(null);
                    setShowNotif(false);
                    navigate('/client/cards');
                  }}
                  className="flex-1 py-3.5 bg-blue-950 hover:bg-blue-900 text-white rounded-2xl font-bold text-sm transition-colors shadow-md shadow-blue-950/20"
                >
                  Accéder à mes cartes
                </button>
              ) : null}
              <button
                onClick={() => setSelectedNotif(null)}
                className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-sm transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-slate-200 flex justify-around items-center h-16 z-50 pb-safe">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.name}
              to={item.path}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors',
                isActive ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
              )}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className={cn("text-[10px] font-medium", isActive ? "text-blue-600 font-bold" : "text-slate-500")}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>
      
      {/* Spacer for Mobile Top Header */}
      <div className="md:hidden h-14"></div>

      <LogoutModal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} />
    </div>
  );
}


