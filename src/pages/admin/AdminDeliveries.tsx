import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { PhysicalCardRequest, User, DeliveryStatus } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { cardService } from '../../services/cardService';
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
  X
} from 'lucide-react';

export default function AdminDeliveries() {
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
      console.error('[ADMIN_DELIVERIES_LISTENER_ERROR]', err);
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
    if (!selectedDelivery || !user) return;
    if (!assignedLivreurUid) {
      toast.error('Veuillez sélectionner un livreur.');
      return;
    }

    setIsProcessing(true);
    try {
      const selectedLivreur = livreurs.find(l => l.uid === assignedLivreurUid);
      await cardService.updateDeliveryStatus(
        selectedDelivery.id,
        'assigned',
        { email: user.email, uid: user.uid, role: user.role },
        { assignedLivreur: selectedLivreur }
      );

      toast.success(`Livraison assignée à ${selectedLivreur?.displayName || selectedLivreur?.email}.`);
      setSelectedDelivery(null);
      setAssignedLivreurUid('');
    } catch (err: any) {
      console.error('[ASSIGN_LIVREUR_ERROR]', err);
      toast.error("Erreur lors de l'assignation du livreur.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStatusChange = async (deliveryId: string, newStatus: DeliveryStatus) => {
    if (!user) return;
    try {
      await cardService.updateDeliveryStatus(
        deliveryId,
        newStatus,
        { email: user.email, uid: user.uid, role: user.role }
      );
      toast.success('Statut de livraison mis à jour.');
    } catch (err: any) {
      console.error('[UPDATE_STATUS_ERROR]', err);
      toast.error('Erreur lors de la mise à jour.');
    }
  };

  const filteredDeliveries = deliveries.filter(d => {
    if (user?.role === 'chef_agence' && user.agencyId) {
      if (d.agencyId && d.agencyId !== user.agencyId) return false;
    }

    if (filterStatus !== 'ALL' && d.status !== filterStatus) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchHolder = (d.cardHolder || d.userName || '').toLowerCase().includes(q);
      const matchCardId = (d.cardIdentifier || '').toLowerCase().includes(q);
      const matchAddress = (d.deliveryAddress || '').toLowerCase().includes(q);
      const matchPhone = (d.whatsapp || d.userPhone || '').includes(q);
      if (!matchHolder && !matchCardId && !matchAddress && !matchPhone) return false;
    }

    return true;
  });

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-bold">Chargement des livraisons...</div>;
  }

  return (
    <div className="space-y-8 pb-20 max-w-7xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-blue-950 via-slate-900 to-blue-900 p-8 rounded-[2.5rem] text-white shadow-xl shadow-blue-950/20 border-2 border-blue-800/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-400/20 backdrop-blur-md flex items-center justify-center border border-amber-400/30 text-amber-400">
            <Truck size={22} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase">
              GESTION DES LIVRAISONS
            </h1>
            <p className="text-xs text-blue-200 font-medium">
              Suivi logistique, géolocalisation & assignation des livreurs Market-Cash
            </p>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-[2rem] border border-slate-200 shadow-sm">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl overflow-x-auto hide-scrollbar">
          {[
            { id: 'ALL', label: 'Toutes' },
            { id: 'pending', label: 'En attente' },
            { id: 'assigned', label: 'Assignées' },
            { id: 'out_for_delivery', label: 'En cours' },
            { id: 'delivered', label: 'Livrées' },
            { id: 'reported', label: 'Reportées' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
                filterStatus === tab.id
                  ? 'bg-blue-950 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par client, ID, adresse, WhatsApp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
        </div>
      </div>

      {/* Deliveries Table / Cards */}
      {filteredDeliveries.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 p-12 text-center shadow-sm">
          <Truck size={40} className="mx-auto text-slate-300 mb-3" />
          <h3 className="text-base font-bold text-slate-700">Aucune commande de livraison trouvée</h3>
          <p className="text-xs text-slate-400 mt-1">Les demandes soumises par les clients apparaîtront ici en temps réel.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {filteredDeliveries.map((delivery) => {
            const cleanPhone = (delivery.whatsapp || delivery.userPhone || '').replace(/\D/g, '');
            const mapsUrl = delivery.location?.lat && delivery.location?.lng 
              ? `https://www.google.com/maps/search/?api=1&query=${delivery.location.lat},${delivery.location.lng}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.deliveryAddress)}`;
            const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : '#';

            return (
              <div 
                key={delivery.id}
                className="bg-white rounded-[2rem] border border-slate-200 shadow-md p-6 space-y-4 hover:shadow-lg transition flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar: Card Identifier & Status */}
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-black bg-blue-900 text-amber-400 px-3 py-1 rounded-full shadow-sm">
                        {delivery.cardIdentifier || 'CARTE PVC'}
                      </span>
                      {delivery.status === 'delivered' && (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 size={12} /> Livrée
                        </span>
                      )}
                      {delivery.status === 'pending' && (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Clock size={12} /> En attente de livreur
                        </span>
                      )}
                      {delivery.status === 'assigned' && (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                          Livreur assigné
                        </span>
                      )}
                    </div>

                    <div className="text-right text-[11px] text-slate-400 font-medium">
                      {new Date(delivery.createdAt).toLocaleDateString('fr-FR')}
                    </div>
                  </div>

                  {/* Client Info */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <UserIcon size={14} className="text-blue-600 shrink-0" />
                      <span className="font-bold text-slate-800 text-sm">
                        {delivery.cardHolder || delivery.userName || 'Client'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-amber-600 shrink-0" />
                      <span className="text-slate-600 font-semibold">
                        Jour de livraison souhaité : <strong className="text-slate-900 font-mono">{delivery.deliveryDate}</strong>
                      </span>
                    </div>

                    <div className="flex items-start gap-2">
                      <MapPin size={14} className="text-rose-600 shrink-0 mt-0.5" />
                      <span className="text-slate-700 font-medium leading-relaxed">
                        {delivery.deliveryAddress}
                      </span>
                    </div>

                    {delivery.location?.lat && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 font-mono">
                          GPS: {delivery.location.lat.toFixed(6)}, {delivery.location.lng.toFixed(6)}
                        </span>
                        <a 
                          href={mapsUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 font-bold hover:underline flex items-center gap-1"
                        >
                          <span>Ouvrir GPS</span>
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    )}

                    {delivery.assignedLivreurName && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 text-[11px] text-blue-900 font-medium">
                        Livreur en charge : <strong className="font-black">{delivery.assignedLivreurName}</strong> ({delivery.assignedLivreurPhone || 'Sans téléphone'})
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
                    >
                      <MessageSquare size={13} />
                      <span>WhatsApp</span>
                    </a>

                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs flex items-center gap-1.5 transition"
                    >
                      <MapPin size={13} className="text-rose-600" />
                      <span>Position</span>
                    </a>
                  </div>

                  {/* Assign or Status Buttons */}
                  <div className="flex items-center gap-2">
                    {delivery.status !== 'delivered' && (
                      <button
                        onClick={() => setSelectedDelivery(delivery)}
                        className="px-3 py-2 bg-blue-900 hover:bg-blue-950 text-amber-400 rounded-xl font-bold text-xs transition cursor-pointer"
                      >
                        {delivery.assignedLivreurId ? 'Changer Livreur' : 'Assigner Livreur'}
                      </button>
                    )}

                    {delivery.status !== 'delivered' && (
                      <button
                        onClick={() => handleStatusChange(delivery.id, 'delivered')}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition cursor-pointer"
                      >
                        Marquer Livrée
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ASSIGN LIVREUR MODAL */}
      {selectedDelivery && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border-4 border-slate-100 relative space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setSelectedDelivery(null)}
              className="absolute top-6 right-6 p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <Truck size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800">Assigner un Livreur</h3>
                <p className="text-xs text-slate-500 font-medium">Commande : {selectedDelivery.cardIdentifier}</p>
              </div>
            </div>

            <form onSubmit={handleAssignLivreur} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Choisir le Livreur responsable
                </label>
                {livreurs.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                    Aucun compte avec le rôle <strong>Livreur</strong> n'a été créé. Vous pouvez en attribuer un dans l'onglet <em>Utilisateurs</em>.
                  </div>
                ) : (
                  <select
                    required
                    value={assignedLivreurUid}
                    onChange={(e) => setAssignedLivreurUid(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Sélectionner un livreur...</option>
                    {livreurs.map(l => (
                      <option key={l.uid} value={l.uid}>
                        {l.displayName || l.email} ({l.phone || 'Sans tel'})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedDelivery(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isProcessing || !assignedLivreurUid}
                  className="px-5 py-2.5 bg-blue-900 hover:bg-blue-950 text-amber-400 font-black rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
                >
                  Confirmer l'assignation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
