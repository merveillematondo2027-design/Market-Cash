import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { PhysicalCardRequest, DeliveryStatus } from '../../types';
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
  Navigation,
  XCircle,
  RotateCcw,
  X
} from 'lucide-react';

export default function LivreurDeliveries() {
  const { user } = useAuthStore();
  const [myDeliveries, setMyDeliveries] = useState<PhysicalCardRequest[]>([]);
  const [availableDeliveries, setAvailableDeliveries] = useState<PhysicalCardRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'MY_DELIVERIES' | 'AVAILABLE' | 'COMPLETED'>('MY_DELIVERIES');
  
  // Modal for report/cancel/delivered
  const [modalAction, setModalAction] = useState<{ 
    delivery: PhysicalCardRequest; 
    type: 'delivered' | 'report' | 'cancel' | 'pending';
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!user) return;

    // 1. Real-time listener for deliveries assigned to this livreur
    const qMyDeliveries = query(
      collection(db, 'physical_card_requests'),
      where('assignedLivreurId', '==', user.uid)
    );
    const unsubMy = onSnapshot(qMyDeliveries, (snap) => {
      const docs = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as PhysicalCardRequest))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setMyDeliveries(docs);
      setLoading(false);
    }, (err) => {
      console.error('[LIVREUR_MY_DELIVERIES_ERROR]', err);
      setLoading(false);
    });

    // 2. Real-time listener for available unassigned pending deliveries
    const qAvailable = query(
      collection(db, 'physical_card_requests'),
      where('status', '==', 'pending')
    );
    const unsubAvail = onSnapshot(qAvailable, (snap) => {
      const docs = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as PhysicalCardRequest))
        .filter(d => !d.assignedLivreurId)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setAvailableDeliveries(docs);
    }, (err) => {
      console.error('[LIVREUR_AVAILABLE_DELIVERIES_ERROR]', err);
    });

    return () => {
      unsubMy();
      unsubAvail();
    };
  }, [user?.uid]);

  const handleUpdateStatus = async (
    deliveryId: string, 
    status: DeliveryStatus, 
    extraData?: { reason?: string; report?: string }
  ) => {
    if (!user) return;
    setIsProcessing(true);
    try {
      await cardService.updateDeliveryStatus(
        deliveryId,
        status,
        { email: user.email, uid: user.uid, role: user.role },
        {
          reportReason: status === 'reported' ? extraData?.reason : undefined,
          cancelReason: status === 'cancelled' ? extraData?.reason : undefined,
          deliveryReport: status === 'delivered' ? (extraData?.report || 'Livraison effectuée avec succès.') : extraData?.report
        }
      );

      if (status === 'delivered') toast.success('Livraison marquée comme effectuée avec succès !');
      if (status === 'reported') toast.success('Livraison reportée enregistrée.');
      if (status === 'cancelled') toast.error('Livraison annulée.');
      if (status === 'pending') toast.success('Commande remise en attente.');
      
      setModalAction(null);
      setActionReason('');
    } catch (err: any) {
      console.error('[LIVREUR_STATUS_ERROR]', err);
      toast.error('Erreur lors de la mise à jour.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTakeDelivery = async (delivery: PhysicalCardRequest) => {
    if (!user) return;
    setIsProcessing(true);
    try {
      await cardService.updateDeliveryStatus(
        delivery.id,
        'assigned',
        { email: user.email, uid: user.uid, role: user.role },
        { assignedLivreur: user }
      );
      toast.success('Course prise en charge !');
    } catch (err) {
      toast.error('Erreur lors de la prise en charge.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Filtered lists
  const inProgressDeliveries = myDeliveries.filter(d => d.status === 'assigned' || d.status === 'out_for_delivery');
  const completedDeliveries = myDeliveries.filter(d => d.status === 'delivered' || d.status === 'reported' || d.status === 'cancelled');

  const displayedList = activeTab === 'MY_DELIVERIES' 
    ? inProgressDeliveries 
    : activeTab === 'AVAILABLE' 
      ? availableDeliveries 
      : completedDeliveries;

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-bold">Chargement de vos courses...</div>;
  }

  return (
    <div className="space-y-6 pb-20 max-w-4xl mx-auto">
      
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-blue-900 p-6 sm:p-8 rounded-[2.5rem] text-white shadow-xl border-2 border-blue-800/60">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-md">
            <Truck size={24} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">
              Espace Livreur • Courses & Tournées
            </h1>
            <p className="text-xs text-blue-200">
              {user?.displayName || user?.email} {user?.agencyName ? `• ${user.agencyName}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-200/80 rounded-2xl">
        <button
          onClick={() => setActiveTab('MY_DELIVERIES')}
          className={`flex-1 py-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'MY_DELIVERIES'
              ? 'bg-blue-950 text-white shadow-md'
              : 'text-slate-700 hover:bg-white/60'
          }`}
        >
          <span>Mes Courses en cours</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-400 text-slate-950">
            {myDeliveries.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('AVAILABLE')}
          className={`flex-1 py-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'AVAILABLE'
              ? 'bg-blue-950 text-white shadow-md'
              : 'text-slate-700 hover:bg-white/60'
          }`}
        >
          <span>Disponibles</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-300 text-slate-800">
            {availableDeliveries.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('COMPLETED')}
          className={`flex-1 py-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'COMPLETED'
              ? 'bg-blue-950 text-white shadow-md'
              : 'text-slate-700 hover:bg-white/60'
          }`}
        >
          <span>Historique</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-300 text-slate-800">
            {completedDeliveries.length}
          </span>
        </button>
      </div>

      {/* Deliveries List */}
      {displayedList.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 p-12 text-center shadow-sm">
          <Truck size={48} className="mx-auto text-slate-300 mb-3" />
          <h3 className="text-base font-bold text-slate-700">Aucune livraison dans cette section</h3>
          <p className="text-xs text-slate-400 mt-1">Vous êtes à jour dans vos tournées !</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedList.map((delivery) => {
            const cleanPhone = (delivery.whatsapp || delivery.userPhone || '').replace(/\D/g, '');
            const mapsUrl = delivery.location?.lat && delivery.location?.lng 
              ? `https://www.google.com/maps/search/?api=1&query=${delivery.location.lat},${delivery.location.lng}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.deliveryAddress)}`;
            const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : '#';

            return (
              <div 
                key={delivery.id}
                className="bg-white rounded-[2rem] border-2 border-slate-200 shadow-md p-6 space-y-4 hover:border-blue-400 transition"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-mono font-black bg-blue-950 text-amber-400 px-3 py-1 rounded-full">
                      {delivery.cardIdentifier || 'CARTE PVC'}
                    </span>
                    <h3 className="text-base font-black text-slate-900 mt-2">
                      {delivery.cardHolder || delivery.userName || 'Client'}
                    </h3>
                  </div>

                  <div className="text-right">
                    <span className="text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                      <Calendar size={12} />
                      {delivery.deliveryDate}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5 text-xs text-slate-700">
                  <div className="flex items-start gap-2">
                    <MapPin size={16} className="text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900">Adresse de livraison :</span>
                      <p className="mt-0.5 text-slate-600 leading-relaxed font-medium">{delivery.deliveryAddress}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Phone size={14} className="text-emerald-600 shrink-0" />
                    <span>WhatsApp / Tél : <strong className="font-mono text-slate-900">{delivery.whatsapp || delivery.userPhone}</strong></span>
                  </div>

                  {delivery.location?.lat && (
                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-mono">
                        GPS: {delivery.location.lat.toFixed(5)}, {delivery.location.lng.toFixed(5)}
                      </span>
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 font-bold hover:underline flex items-center gap-1"
                      >
                        <Navigation size={12} />
                        <span>Ouvrir Itinéraire GPS</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* Primary Action Buttons (High contrast, min 44px tap targets) */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition"
                  >
                    <MessageSquare size={16} />
                    <span>Contacter sur WhatsApp</span>
                  </a>

                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] bg-blue-900 hover:bg-blue-950 active:bg-slate-950 text-white rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-900/20 transition"
                  >
                    <MapPin size={16} className="text-rose-400" />
                    <span>Voir localisation</span>
                  </a>
                </div>

                {/* Status Specific Action Buttons */}
                {activeTab === 'AVAILABLE' && (
                  <button
                    onClick={() => handleTakeDelivery(delivery)}
                    disabled={isProcessing}
                    className="w-full min-h-[44px] bg-blue-950 hover:bg-slate-900 text-amber-400 font-black rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
                  >
                    <Truck size={16} />
                    <span>Prendre en charge cette livraison</span>
                  </button>
                )}

                {activeTab === 'MY_DELIVERIES' && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setModalAction({ delivery, type: 'delivered' })}
                      disabled={isProcessing}
                      className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition cursor-pointer"
                    >
                      <CheckCircle2 size={18} />
                      <span>1. Livraison effectuée</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setModalAction({ delivery, type: 'report' })}
                        className="min-h-[44px] bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <RotateCcw size={14} />
                        <span>2. Livraison reportée</span>
                      </button>

                      <button
                        onClick={() => setModalAction({ delivery, type: 'cancel' })}
                        className="min-h-[44px] bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <XCircle size={14} />
                        <span>3. Livraison annulée</span>
                      </button>
                    </div>

                    <button
                      onClick={() => setModalAction({ delivery, type: 'pending' })}
                      className="w-full min-h-[38px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Clock size={14} />
                      <span>4. Remettre en attente</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* REPORT / CANCEL / DELIVERED MODAL */}
      {modalAction && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border-4 border-slate-100 relative space-y-5 animate-in fade-in zoom-in-95">
            <button
              onClick={() => {
                setModalAction(null);
                setActionReason('');
              }}
              className="absolute top-6 right-6 p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                modalAction.type === 'delivered'
                  ? 'bg-emerald-100 text-emerald-700'
                  : modalAction.type === 'report' 
                    ? 'bg-amber-100 text-amber-700' 
                    : modalAction.type === 'cancel'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-100 text-slate-700'
              }`}>
                {modalAction.type === 'delivered' && <CheckCircle2 size={20} />}
                {modalAction.type === 'report' && <RotateCcw size={20} />}
                {modalAction.type === 'cancel' && <XCircle size={20} />}
                {modalAction.type === 'pending' && <Clock size={20} />}
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  {modalAction.type === 'delivered' && 'Confirmer la livraison effectuée'}
                  {modalAction.type === 'report' && 'Reporter la livraison'}
                  {modalAction.type === 'cancel' && 'Annuler la livraison'}
                  {modalAction.type === 'pending' && 'Remettre la course en attente'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {modalAction.delivery.cardIdentifier} • {modalAction.delivery.cardHolder}
                </p>
              </div>
            </div>

            {/* Form Fields */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {modalAction.type === 'delivered' && 'Rapport / Note de livraison (Optionnel)'}
                {modalAction.type === 'report' && 'Commentaire / Motif du report'}
                {modalAction.type === 'cancel' && (
                  <span>
                    Motif obligatoire de l'annulation <span className="text-rose-500">*</span>
                  </span>
                )}
                {modalAction.type === 'pending' && 'Raison de la remise en attente'}
              </label>
              <textarea
                rows={3}
                placeholder={
                  modalAction.type === 'delivered' 
                    ? 'Ex: Remis en mains propres au titulaire avec vérification de la pièce d\'identité.' 
                    : modalAction.type === 'report' 
                      ? 'Ex: Client indisponible aujourd\'hui, reporté à demain 10h.' 
                      : modalAction.type === 'cancel'
                        ? 'Ex: Mauvais numéro WhatsApp, client injoignable après 3 tentatives.'
                        : 'Ex: Contrainte horaire, réattribution demandée.'
                }
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setModalAction(null);
                  setActionReason('');
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Retour
              </button>
              <button
                type="button"
                disabled={isProcessing || (modalAction.type === 'cancel' && !actionReason.trim())}
                onClick={() => {
                  if (modalAction.type === 'delivered') {
                    handleUpdateStatus(modalAction.delivery.id, 'delivered', { report: actionReason.trim() || 'Livraison effectuée avec succès.' });
                  } else if (modalAction.type === 'report') {
                    handleUpdateStatus(modalAction.delivery.id, 'reported', { reason: actionReason.trim() || 'Livraison reportée.' });
                  } else if (modalAction.type === 'cancel') {
                    handleUpdateStatus(modalAction.delivery.id, 'cancelled', { reason: actionReason.trim() });
                  } else if (modalAction.type === 'pending') {
                    handleUpdateStatus(modalAction.delivery.id, 'pending', { reason: actionReason.trim() });
                  }
                }}
                className={`px-5 py-2.5 text-white font-black rounded-xl text-xs transition cursor-pointer disabled:opacity-50 ${
                  modalAction.type === 'delivered'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : modalAction.type === 'report' 
                      ? 'bg-amber-600 hover:bg-amber-700' 
                      : modalAction.type === 'cancel'
                        ? 'bg-rose-600 hover:bg-rose-700'
                        : 'bg-slate-800 hover:bg-slate-900'
                }`}
              >
                {modalAction.type === 'delivered' ? 'Valider la livraison' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
