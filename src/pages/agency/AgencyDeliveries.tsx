import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { PhysicalCardRequest, User, DeliveryStatus } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { cardService } from '../../services/cardService';
import { cleanFirestoreData } from '../../lib/firestoreUtils';
import toast from 'react-hot-toast';
import { 
  Truck, 
  MapPin, 
  Phone, 
  MessageSquare, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  User as UserIcon, 
  ExternalLink,
  Shield,
  Search,
  Filter,
  X,
  Send,
  Navigation
} from 'lucide-react';

export default function AgencyDeliveries() {
  const { user } = useAuthStore();
  const [deliveries, setDeliveries] = useState<PhysicalCardRequest[]>([]);
  const [livreurs, setLivreurs] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Assign Livreur Modal
  const [selectedDelivery, setSelectedDelivery] = useState<PhysicalCardRequest | null>(null);
  const [assignedLivreurUid, setAssignedLivreurUid] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // 1. Real-time delivery listener
    const qDeliveries = query(collection(db, 'physical_card_requests'));
    const unsub = onSnapshot(qDeliveries, (snap) => {
      const docs = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as PhysicalCardRequest))
        .sort((a, b) => {
          if (a.isUrgent && !b.isUrgent) return -1;
          if (!a.isUrgent && b.isUrgent) return 1;
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
      
      setDeliveries(docs);
      setLoading(false);
    }, (err) => {
      console.error('[AGENCY_DELIVERIES_LISTENER_ERROR]', err);
      setLoading(false);
    });

    loadLivreurs();

    return () => unsub();
  }, []);

  const loadLivreurs = async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'livreur'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => d.data() as User);
      setLivreurs(list);
    } catch (e) {
      console.error('[LOAD_LIVREURS_ERROR]', e);
    }
  };

  const handleAssignLivreur = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDelivery || !assignedLivreurUid || !user) return;

    setIsProcessing(true);
    try {
      const targetLivreur = livreurs.find(l => l.uid === assignedLivreurUid);
      const deliveryRef = doc(db, 'physical_card_requests', selectedDelivery.id);

      const updatePayload = cleanFirestoreData({
        assignedLivreurId: assignedLivreurUid,
        assignedLivreurName: targetLivreur?.displayName || targetLivreur?.email || 'Livreur',
        assignedLivreurPhone: targetLivreur?.phone || '',
        status: 'in_progress',
        processedAt: Date.now(),
        processedBy: user.displayName || user.email,
        updatedAt: Date.now(),
      });

      await updateDoc(deliveryRef, updatePayload);

      // Notify the Livreur
      await setDoc(doc(collection(db, 'notifications')), {
        userId: assignedLivreurUid,
        targetRole: 'livreur',
        title: 'Nouvelle course attribuée !',
        message: `Vous avez été assigné à la livraison de la carte ${selectedDelivery.cardIdentifier || ''} pour ${selectedDelivery.clientName || 'un client'}.`,
        type: 'info',
        read: false,
        createdAt: Date.now(),
      });

      toast.success(`Livraison assignée à ${targetLivreur?.displayName || 'Livreur'}`);
      setSelectedDelivery(null);
      setAssignedLivreurUid('');
    } catch (err) {
      console.error('[ASSIGN_LIVREUR_ERROR]', err);
      toast.error('Erreur lors de l\'attribution du livreur.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: DeliveryStatus) => {
    switch (status) {
      case 'delivered':
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 size={13} className="text-emerald-600" />
            Livrée
          </span>
        );
      case 'reported':
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
            <Clock size={13} className="text-amber-600" />
            Reportée
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-red-100 text-red-800 border border-red-200 flex items-center gap-1">
            <AlertCircle size={13} className="text-red-600" />
            Annulée
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
            <Truck size={13} className="text-blue-600" />
            En cours
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-black bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
            <Clock size={13} className="text-slate-500" />
            En attente
          </span>
        );
    }
  };

  const filteredDeliveries = deliveries.filter(d => {
    const matchesFilter = filterStatus === 'ALL' || d.status === filterStatus;
    const q = searchQuery.toLowerCase();
    const matchesSearch = 
      !q ||
      d.clientName?.toLowerCase().includes(q) ||
      d.clientEmail?.toLowerCase().includes(q) ||
      d.cardIdentifier?.toLowerCase().includes(q) ||
      d.deliveryAddress?.toLowerCase().includes(q) ||
      d.assignedLivreurName?.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <Truck className="text-emerald-600" />
          Suivi des Livraisons Physiques
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Supervisez l'acheminement des cartes physiques PVC et assignez les livreurs sur le terrain.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Rechercher par client, adresse, carte MC-001..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'pending', 'in_progress', 'delivered', 'reported', 'cancelled'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all touch-manipulation ${
                filterStatus === st
                  ? 'bg-emerald-800 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {st === 'ALL' ? 'Toutes' :
               st === 'pending' ? 'En attente' :
               st === 'in_progress' ? 'En cours' :
               st === 'delivered' ? 'Livrées' :
               st === 'reported' ? 'Reportées' : 'Annulées'}
            </button>
          ))}
        </div>
      </div>

      {/* Deliveries Mobile-First Cards */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Chargement des livraisons...</div>
      ) : filteredDeliveries.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200/80 shadow-sm space-y-2">
          <Truck size={36} className="mx-auto text-slate-300" />
          <h3 className="font-bold text-slate-700 text-sm">Aucune livraison trouvée</h3>
          <p className="text-xs text-slate-400">Aucune commande physique ne correspond aux filtres.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredDeliveries.map((del) => {
            const cleanPhone = (del.clientPhone || '').replace(/\D/g, '');
            const hasCoords = del.latitude && del.longitude;
            const mapsUrl = hasCoords 
              ? `https://maps.google.com/?q=${del.latitude},${del.longitude}`
              : `https://maps.google.com/?q=${encodeURIComponent(del.deliveryAddress || '')}`;

            return (
              <div
                key={del.id}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3.5"
              >
                {/* Top: Client and Status */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-sm text-slate-800">
                        {del.clientName || 'Client'}
                      </h3>
                      {del.cardIdentifier && (
                        <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold">
                          {del.cardIdentifier}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{del.clientEmail}</p>
                  </div>
                  {getStatusBadge(del.status)}
                </div>

                {/* Body: Location, GPS, Phone */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-800">{del.deliveryAddress || 'Adresse non spécifiée'}</span>
                      {del.deliveryCity && <span className="text-slate-500">, {del.deliveryCity}</span>}
                    </div>
                  </div>

                  {del.deliveryDate && (
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400 shrink-0" />
                      <span>Date souhaitée : <strong className="text-slate-700">{del.deliveryDate}</strong></span>
                    </div>
                  )}

                  {del.assignedLivreurName && (
                    <div className="flex items-center gap-2 text-blue-900 bg-blue-50/80 px-2.5 py-1.5 rounded-lg font-medium">
                      <Truck size={14} className="text-blue-600 shrink-0" />
                      <span>Livreur : <strong>{del.assignedLivreurName}</strong></span>
                    </div>
                  )}

                  {del.deliveryReport && (
                    <div className="pt-1.5 border-t border-slate-200/60 text-emerald-800">
                      Rapport de livraison : <em>"{del.deliveryReport}"</em>
                    </div>
                  )}
                  {del.reportReason && (
                    <div className="pt-1.5 border-t border-slate-200/60 text-amber-800">
                      Motif de report : <em>"{del.reportReason}"</em>
                    </div>
                  )}
                  {del.cancelReason && (
                    <div className="pt-1.5 border-t border-slate-200/60 text-red-800">
                      Motif d'annulation : <em>"{del.cancelReason}"</em>
                    </div>
                  )}
                </div>

                {/* Actions: Map, WhatsApp, Assign */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {/* WhatsApp Direct */}
                  {cleanPhone && (
                    <a
                      href={`https://wa.me/${cleanPhone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <MessageSquare size={14} />
                      <span>WhatsApp</span>
                    </a>
                  )}

                  {/* GPS Direct */}
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Navigation size={14} />
                    <span>GPS</span>
                  </a>

                  {/* Assign Livreur Button */}
                  {del.status !== 'delivered' && (
                    <button
                      onClick={() => {
                        setSelectedDelivery(del);
                        setAssignedLivreurUid(del.assignedLivreurId || '');
                      }}
                      className="flex-1 bg-blue-950 hover:bg-blue-900 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Truck size={14} />
                      <span>{del.assignedLivreurId ? 'Changer Livreur' : 'Assigner Livreur'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign Livreur Modal */}
      {selectedDelivery && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-950 flex items-center justify-center font-bold">
                  <Truck size={18} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm sm:text-base">Assigner un Livreur</h3>
                  <p className="text-xs text-slate-500">Pour {selectedDelivery.clientName || 'Client'}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedDelivery(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAssignLivreur} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Sélectionner un livreur de l'équipe
                </label>
                <select
                  required
                  value={assignedLivreurUid}
                  onChange={(e) => setAssignedLivreurUid(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">-- Choisir un livreur disponible --</option>
                  {livreurs.map((l) => (
                    <option key={l.uid} value={l.uid}>
                      {l.displayName || l.email} ({l.phone || 'Sans téléphone'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                <div><strong>Adresse :</strong> {selectedDelivery.deliveryAddress}</div>
                <div><strong>Carte :</strong> {selectedDelivery.cardIdentifier || '-'}</div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDelivery(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-bold text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  <Send size={15} />
                  <span>{isProcessing ? 'Attribution...' : 'Attribuer la Course'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
