import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuthStore } from '../../store/authStore';
import { Link } from 'react-router-dom';
import { 
  Building, 
  FileText, 
  CreditCard, 
  Truck, 
  Clock, 
  CheckCircle2, 
  ArrowRight, 
  Plus, 
  AlertCircle,
  Phone,
  MapPin,
  Sparkles
} from 'lucide-react';
import { CardPurchaseRequest, PhysicalCardRequest, UserCard } from '../../types';

export default function AgencyDashboard() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({
    pendingRequests: 0,
    soldCards: 0,
    toPrintCards: 0,
    activeDeliveries: 0,
  });
  const [recentRequests, setRecentRequests] = useState<CardPurchaseRequest[]>([]);
  const [recentDeliveries, setRecentDeliveries] = useState<PhysicalCardRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Listen to Card Purchase Requests
    const qRequests = query(collection(db, 'card_purchase_requests'));
    const unsubRequests = onSnapshot(qRequests, (snap) => {
      const allReqs = snap.docs.map(d => ({ ...d.data(), id: d.id } as CardPurchaseRequest));
      const pending = allReqs.filter(r => r.status === 'pending');
      
      setStats(prev => ({ ...prev, pendingRequests: pending.length }));
      setRecentRequests(allReqs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 4));
      setLoading(false);
    }, (err) => {
      console.error('[AGENCY_DASH_REQUESTS_ERR]', err);
      setLoading(false);
    });

    // 2. Listen to Cards
    const qCards = query(collection(db, 'cards'));
    const unsubCards = onSnapshot(qCards, (snap) => {
      const allCards = snap.docs.map(d => d.data() as UserCard);
      const sold = allCards.filter(c => c.saleStatus === 'sold' || (c as any).userId);
      const toPrint = allCards.filter(c => (c as any).printStatus === 'pending' || (c as any).saleStatus === 'sold');
      
      setStats(prev => ({ 
        ...prev, 
        soldCards: sold.length,
        toPrintCards: toPrint.length
      }));
    }, (err) => {
      console.error('[AGENCY_DASH_CARDS_ERR]', err);
    });

    // 3. Listen to Physical Deliveries
    const qDeliveries = query(collection(db, 'physical_card_requests'));
    const unsubDeliveries = onSnapshot(qDeliveries, (snap) => {
      const allDels = snap.docs.map(d => ({ ...d.data(), id: d.id } as PhysicalCardRequest));
      const active = allDels.filter(d => d.status === 'pending' || d.status === 'in_progress');
      
      setStats(prev => ({ ...prev, activeDeliveries: active.length }));
      setRecentDeliveries(allDels.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 4));
    }, (err) => {
      console.error('[AGENCY_DASH_DELIVERIES_ERR]', err);
    });

    return () => {
      unsubRequests();
      unsubCards();
      unsubDeliveries();
    };
  }, []);

  const statItems = [
    {
      label: 'Demandes en attente',
      value: stats.pendingRequests,
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50 border-amber-200',
      link: '/agency/requests'
    },
    {
      label: 'Cartes vendues',
      value: stats.soldCards,
      icon: CreditCard,
      color: 'text-blue-600',
      bg: 'bg-blue-50 border-blue-200',
      link: '/agency/cards'
    },
    {
      label: 'À imprimer (Atelier)',
      value: stats.toPrintCards,
      icon: Sparkles,
      color: 'text-purple-600',
      bg: 'bg-purple-50 border-purple-200',
      link: '/agency/cards'
    },
    {
      label: 'Livraisons actives',
      value: stats.activeDeliveries,
      icon: Truck,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 border-emerald-200',
      link: '/agency/deliveries'
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 rounded-3xl p-5 sm:p-6 text-white shadow-xl border border-blue-900/50 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-amber-400 text-blue-950 font-black text-xs px-2.5 py-1 rounded-lg uppercase tracking-wider">
                  Agence Régionale
                </span>
                <span className="text-xs text-blue-200 font-medium">
                  {user?.agencyName || 'Siège Opérationnel'}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white mt-1.5 tracking-tight">
                Bonjour, {user?.displayName || 'Chef d\'Agence'}
              </h1>
              <p className="text-xs sm:text-sm text-blue-200/90 mt-1 max-w-xl">
                Gérez les demandes d'achat, confirmez les ventes de cartes PVC, et pilotez les livraisons en temps réel.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link
                to="/agency/requests"
                className="bg-amber-400 hover:bg-amber-300 text-blue-950 font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-1.5 touch-manipulation"
              >
                <Plus size={16} />
                <span>Traiter Demandes</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid (Mobile-First 2 cols, Desktop 4 cols) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statItems.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <Link
              key={idx}
              to={stat.link}
              className={`rounded-2xl p-4 sm:p-5 border ${stat.bg} shadow-sm hover:shadow-md transition-all flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between">
                <div className={`p-2.5 rounded-xl bg-white shadow-xs ${stat.color}`}>
                  <Icon size={20} />
                </div>
                <ArrowRight size={14} className="text-slate-400" />
              </div>
              <div className="mt-3">
                <div className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
                  {stat.value}
                </div>
                <div className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                  {stat.label}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Main Content Grid: Recent Requests & Recent Deliveries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Purchase Requests */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <FileText size={18} className="text-blue-600" />
                Dernières Demandes d'Achat
              </h2>
              <p className="text-xs text-slate-500">Demandes soumises par les clients</p>
            </div>
            <Link 
              to="/agency/requests"
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              Voir tout ({stats.pendingRequests})
              <ArrowRight size={13} />
            </Link>
          </div>

          {recentRequests.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Aucune demande d'achat enregistrée.
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentRequests.map((req) => (
                <div 
                  key={req.id}
                  className="bg-slate-50 hover:bg-blue-50/50 p-3.5 rounded-xl border border-slate-200/70 transition-all flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs sm:text-sm text-slate-800 truncate">
                        {req.userName || req.userEmail || 'Client'}
                      </span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase ${
                        req.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                        req.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {req.status === 'pending' ? 'En attente' : req.status === 'approved' ? 'Approuvée' : 'Rejetée'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                      <span>{req.cardName || 'Carte Market-Cash'}</span>
                      <span>•</span>
                      <span className="font-black text-slate-700">{req.price || 10} USD</span>
                    </div>
                  </div>

                  <Link
                    to="/agency/requests"
                    className="bg-blue-950 text-white hover:bg-blue-900 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors shadow-xs"
                  >
                    Gérer
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Deliveries */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                <Truck size={18} className="text-emerald-600" />
                Suivi des Livraisons Physiques
              </h2>
              <p className="text-xs text-slate-500">Cartes commandées en livraison</p>
            </div>
            <Link 
              to="/agency/deliveries"
              className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1"
            >
              Voir tout
              <ArrowRight size={13} />
            </Link>
          </div>

          {recentDeliveries.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Aucune commande physique en cours.
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentDeliveries.map((del) => (
                <div 
                  key={del.id}
                  className="bg-slate-50 hover:bg-emerald-50/40 p-3.5 rounded-xl border border-slate-200/70 transition-all flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs sm:text-sm text-slate-800 truncate">
                        {del.clientName || del.clientEmail || 'Destinataire'}
                      </span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase ${
                        del.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                        del.status === 'reported' ? 'bg-amber-100 text-amber-800' :
                        del.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {del.status === 'delivered' ? 'Livrée' : 
                         del.status === 'reported' ? 'Reportée' :
                         del.status === 'cancelled' ? 'Annulée' : 'En cours'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                      <MapPin size={12} className="shrink-0 text-slate-400" />
                      <span className="truncate">{del.deliveryAddress || 'Adresse non spécifiée'}</span>
                    </div>
                  </div>

                  <Link
                    to="/agency/deliveries"
                    className="bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors shadow-xs"
                  >
                    Suivre
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
