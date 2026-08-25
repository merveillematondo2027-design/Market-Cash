import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
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
  X,
  Send,
  Plus
} from 'lucide-react';

export default function DeliveryDashboard() {
  const { user } = useAuthStore();
  const [myDeliveries, setMyDeliveries] = useState<PhysicalCardRequest[]>([]);
  const [availableDeliveries, setAvailableDeliveries] = useState<PhysicalCardRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'MY_DELIVERIES' | 'AVAILABLE'>('MY_DELIVERIES');
  
  // Status modal
  const [modalAction, setModalAction] = useState<{ 
    delivery: PhysicalCardRequest; 
    type: 'delivered' | 'report' | 'cancel';
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
      console.error('[DELIVERY_MY_DELIVERIES_ERR]', err);
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
      console.error('[DELIVERY_AVAILABLE_ERR]', err);
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

      if (status === 'delivered') toast.success('Livraison validée comme effectuée !');
      if (status === 'reported') toast.success('Livraison reportée enregistrée.');
      if (status === 'cancelled') toast.success('Annulation enregistrée.');
      
      setModalAction(null);
      setActionReason('');
    } catch (err: any) {
      console.error('[UPDATE_STATUS_ERROR]', err);
      toast.error('Erreur lors de la mise à jour du statut.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelfAssign = async (delivery: PhysicalCardRequest) => {
    if (!user) return;
    setIsProcessing(true);
    try {
      const deliveryRef = doc(db, 'physical_card_requests', delivery.id);
      await updateDoc(deliveryRef, {
        assignedLivreurId: user.uid,
        assignedLivreurName: user.displayName || user.email,
        assignedLivreurPhone: user.phone || '',
        status: 'in_progress',
        processedAt: Date.now(),
        processedBy: user.displayName || user.email,
        updatedAt: Date.now(),
      });

      toast.success('Course prise en charge ! Retrouvez-la dans "Mes courses".');
    } catch (err: any) {
      console.error('[SELF_ASSIGN_ERROR]', err);
      toast.error('Erreur lors de la prise en charge.');
    } finally {
      setIsProcessing(false);
    }
  };

  const activeMyDeliveries = myDeliveries.filter(d => d.status === 'in_progress' || d.status === 'pending' || d.status === 'reported');

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-950 rounded-3xl p-5 sm:p-6 text-white shadow-xl border border-emerald-800/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-emerald-400 text-emerald-950 font-black text-xs px-2.5 py-1 rounded-lg uppercase tracking-wider">
                Terrain & Livraisons
              </span>
              <span className="text-xs text-emerald-200">
                {user?.displayName || user?.email}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white mt-1.5 tracking-tight">
              Espace Livreur Market-Cash
            </h1>
            <p className="text-xs sm:text-sm text-emerald-200/90 mt-1 max-w-xl">
              Consultez vos commandes assignées, ouvrez les itinéraires GPS, contactez vos clients sur WhatsApp et validez les remises physiques.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-slate-200/80 p-1 rounded-2xl max-w-md">
        <button
          onClick={() => setActiveTab('MY_DELIVERIES')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all touch-manipulation flex items-center justify-center gap-1.5 ${
            activeTab === 'MY_DELIVERIES'
              ? 'bg-white text-emerald-950 shadow-sm font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Truck size={15} />
          <span>Mes Courses ({activeMyDeliveries.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('AVAILABLE')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all touch-manipulation flex items-center justify-center gap-1.5 ${
            activeTab === 'AVAILABLE'
              ? 'bg-white text-emerald-950 shadow-sm font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Plus size={15} />
          <span>Disponibles ({availableDeliveries.length})</span>
        </button>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Chargement de vos livraisons...</div>
      ) : activeTab === 'MY_DELIVERIES' ? (
        activeMyDeliveries.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200/80 shadow-sm space-y-2">
            <CheckCircle2 size={36} className="mx-auto text-emerald-400" />
            <h3 className="font-bold text-slate-700 text-sm">Aucune course active</h3>
            <p className="text-xs text-slate-400">
              Vous n'avez aucune livraison en cours. Consultez l'onglet "Disponibles" pour prendre en charge de nouvelles courses.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeMyDeliveries.map((del) => {
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
                  {/* Top Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-sm text-slate-800">
                          {del.clientName || 'Client Destinataire'}
                        </h3>
                        {del.cardIdentifier && (
                          <span className="font-mono text-[10px] bg-emerald-50 text-emerald-900 border border-emerald-200 px-2 py-0.5 rounded-md font-bold">
                            {del.cardIdentifier}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{del.clientEmail}</p>
                    </div>

                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider ${
                      del.status === 'in_progress' ? 'bg-blue-100 text-blue-900 border border-blue-200' :
                      del.status === 'reported' ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {del.status === 'in_progress' ? 'En cours' :
                       del.status === 'reported' ? 'Reportée' : 'À traiter'}
                    </span>
                  </div>

                  {/* Delivery Location & Dates */}
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2 text-xs text-slate-700">
                    <div className="flex items-start gap-2">
                      <MapPin size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-900">{del.deliveryAddress || 'Adresse non communiquée'}</strong>
                        {del.deliveryCity && <span className="text-slate-500"> ({del.deliveryCity})</span>}
                      </div>
                    </div>

                    {del.deliveryDate && (
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400 shrink-0" />
                        <span>Date de remise : <strong>{del.deliveryDate}</strong></span>
                      </div>
                    )}

                    {del.deliveryNote && (
                      <div className="pt-1.5 border-t border-slate-200/60 text-slate-600">
                        <em>Instructions : {del.deliveryNote}</em>
                      </div>
                    )}
                  </div>

                  {/* Contact & Map Buttons */}
                  <div className="flex gap-2">
                    {cleanPhone && (
                      <a
                        href={`https://wa.me/${cleanPhone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                      >
                        <MessageSquare size={15} />
                        <span>WhatsApp Client</span>
                      </a>
                    )}
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-slate-800 hover:bg-slate-900 text-white py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Navigation size={15} />
                      <span>Ouvrir GPS</span>
                    </a>
                  </div>

                  {/* Action Buttons: Delivered / Postponed / Cancelled */}
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100">
                    <button
                      onClick={() => setModalAction({ delivery: del, type: 'delivered' })}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all touch-manipulation"
                    >
                      <CheckCircle2 size={14} />
                      <span>Livrée</span>
                    </button>
                    <button
                      onClick={() => setModalAction({ delivery: del, type: 'report' })}
                      className="bg-amber-100 hover:bg-amber-200 text-amber-900 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all touch-manipulation"
                    >
                      <Clock size={14} />
                      <span>Reporter</span>
                    </button>
                    <button
                      onClick={() => setModalAction({ delivery: del, type: 'cancel' })}
                      className="bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-600 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all touch-manipulation"
                    >
                      <XCircle size={14} />
                      <span>Annuler</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* AVAILABLE UNASSIGNED DELIVERIES */
        availableDeliveries.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200/80 shadow-sm space-y-2">
            <Clock size={36} className="mx-auto text-slate-300" />
            <h3 className="font-bold text-slate-700 text-sm">Aucune course libre</h3>
            <p className="text-xs text-slate-400">Toutes les livraisons en cours sont déjà assignées.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableDeliveries.map((del) => (
              <div
                key={del.id}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3.5"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-black text-sm text-slate-800">{del.clientName || 'Client'}</h3>
                    <span className="font-mono text-[10px] bg-blue-50 text-blue-900 px-2 py-0.5 rounded-md font-bold">
                      {del.cardIdentifier || 'MC-001'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{del.clientEmail}</p>
                </div>

                <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 space-y-1.5">
                  <div className="flex items-start gap-1.5">
                    <MapPin size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                    <span>{del.deliveryAddress}</span>
                  </div>
                  {del.deliveryDate && (
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-slate-400" />
                      <span>Prévu pour : <strong>{del.deliveryDate}</strong></span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => handleSelfAssign(del)}
                  disabled={isProcessing}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                >
                  <Truck size={15} />
                  <span>Prendre en charge cette course</span>
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Action Modal (Delivered / Report / Cancel) */}
      {modalAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-800 text-base">
                {modalAction.type === 'delivered' ? 'Confirmer la Livraison Effectuée' :
                 modalAction.type === 'report' ? 'Reporter la Livraison' : 'Annuler la Livraison'}
              </h3>
              <button 
                onClick={() => setModalAction(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Pour : <strong>{modalAction.delivery.clientName || 'Client'}</strong> ({modalAction.delivery.cardIdentifier})
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {modalAction.type === 'delivered' ? 'Rapport de remise ou note client (optionnel)' :
                   modalAction.type === 'report' ? 'Motif du report (obligatoire)' : 'Motif d\'annulation (obligatoire)'}
                </label>
                <textarea
                  rows={3}
                  required={modalAction.type !== 'delivered'}
                  placeholder={
                    modalAction.type === 'delivered' ? 'Ex : Remis en mains propres au client avec vérification de la pièce d\'identité.' :
                    modalAction.type === 'report' ? 'Ex : Client absent au domicile, report convenu à demain 14h.' :
                    'Ex : Client injoignable, numéro erroné.'
                  }
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalAction(null)}
                  className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-xl font-bold text-xs"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  disabled={isProcessing || (modalAction.type !== 'delivered' && !actionReason.trim())}
                  onClick={() => {
                    if (modalAction.type === 'delivered') {
                      handleUpdateStatus(modalAction.delivery.id, 'delivered', { report: actionReason });
                    } else if (modalAction.type === 'report') {
                      handleUpdateStatus(modalAction.delivery.id, 'reported', { reason: actionReason });
                    } else {
                      handleUpdateStatus(modalAction.delivery.id, 'cancelled', { reason: actionReason });
                    }
                  }}
                  className={`flex-1 text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50 ${
                    modalAction.type === 'delivered' ? 'bg-emerald-600 hover:bg-emerald-700' :
                    modalAction.type === 'report' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  <Send size={15} />
                  <span>Confirmer</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
