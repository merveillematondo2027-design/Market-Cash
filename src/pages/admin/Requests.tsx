import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  doc, 
  updateDoc, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { CardPurchaseRequest, PhysicalCardRequest, UserCard } from '../../types';
import { removeUndefined } from '../../lib/firestoreUtils';
import toast from 'react-hot-toast';
import { 
  Eye, 
  CheckCircle, 
  XCircle, 
  X, 
  Truck, 
  CreditCard, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Calendar,
  MapPin,
  Phone,
  Mail,
  User as UserIcon
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { cardService } from '../../services/cardService';

const MAX_NOTIFICATION_MESSAGE_LENGTH = 2000;

const getAdminRejectionMessage = (cardName: string, reason: string) =>
  `Votre demande pour la carte ${cardName} n'a pas pu être validée. Motif : ${reason}`;

const getAdminRejectionReasonLimit = (cardName: string) =>
  Math.max(0, MAX_NOTIFICATION_MESSAGE_LENGTH - getAdminRejectionMessage(cardName, '').length);

export default function AdminRequests() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'purchases' | 'deliveries'>('purchases');

  // Purchase Requests
  const [requests, setRequests] = useState<CardPurchaseRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<CardPurchaseRequest | null>(null);

  // Delivery Requests
  const [deliveryRequests, setDeliveryRequests] = useState<PhysicalCardRequest[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<PhysicalCardRequest | null>(null);

  const [loading, setLoading] = useState(true);
  
  // Rejection Form
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    // 1. Real-time purchase requests listener
    const qPurchases = query(collection(db, 'card_purchase_requests'));
    const unsubPurchases = onSnapshot(qPurchases, (snap) => {
      const docs = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as CardPurchaseRequest))
        .sort((a, b) => {
          if ((a.urgentProcessing || a.isUrgent) && !(b.urgentProcessing || b.isUrgent)) return -1;
          if (!(a.urgentProcessing || a.isUrgent) && (b.urgentProcessing || b.isUrgent)) return 1;
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
      setRequests(docs);
      setLoading(false);
    }, (err) => {
      console.error('[ADMIN_PURCHASES_ERROR]', err);
      setLoading(false);
    });

    // 2. Real-time delivery requests listener
    const qDeliveries = query(collection(db, 'physical_card_requests'));
    const unsubDeliveries = onSnapshot(qDeliveries, (snap) => {
      const docs = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as PhysicalCardRequest))
        .sort((a, b) => {
          if (a.isUrgent && !b.isUrgent) return -1;
          if (!a.isUrgent && b.isUrgent) return 1;
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
      setDeliveryRequests(docs);
    }, (err) => {
      console.error('[ADMIN_DELIVERIES_ERROR]', err);
    });

    return () => {
      unsubPurchases();
      unsubDeliveries();
    };
  }, []);

  const handleOpenApproveModal = (req: CardPurchaseRequest) => {
    setSelectedRequest(req);
    setActionType('approve');
  };

  
  
  const handleApprove = async () => {
    if (!selectedRequest || !user) return;
    
    setIsProcessing(true);
    try {
      const assignedCard = await cardService.approveRequestWithStock(selectedRequest.id, 'virtual', { uid: user.uid, email: user.email! });
      
      toast.success(`Carte Market-Cash ${assignedCard.cardIdentifier} attribuée avec succès !`);
      
      await cardService.createNotification({
        userId: selectedRequest.userId,
        title: 'Paiement vérifié & Carte Attribuée 🎉',
        message: `Votre paiement a été vérifié. Votre carte Market-Cash vous a été attribuée (ID: ${assignedCard.cardIdentifier}).`,
        type: 'success',
        requestId: selectedRequest.id,
        cardIdentifier: assignedCard.cardIdentifier
      });

      setSelectedRequest(null);
      setActionType(null);
    } catch (error: any) {
      console.error(error);
      if (error.message === 'STOCK_EMPTY') {
        toast.error("STOCK ÉPUISÉ : Aucune carte disponible dans le stock.");
      } else if (error.message === 'IDENTITY_REQUIRED') {
        toast.error("Pièce d'identité obligatoire : vérifiez le document avant d'approuver cette demande normale.");
      } else {
        toast.error("Une erreur est survenue lors de l'attribution.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !user) return;
    const cleanRejectionReason = rejectionReason.trim();
    if (!cleanRejectionReason) {
      toast.error('Raison du rejet obligatoire.');
      return;
    }

    const notificationTitle = `Demande refusée : ${selectedRequest.cardName}`;
    const notificationMessage = getAdminRejectionMessage(selectedRequest.cardName, cleanRejectionReason);
    if (notificationTitle.length > 200) {
      toast.error('Le titre de la notification dépasse 200 caractères.');
      return;
    }

    if (notificationMessage.length > MAX_NOTIFICATION_MESSAGE_LENGTH) {
      toast.error(`Le message de notification ne peut pas dépasser ${MAX_NOTIFICATION_MESSAGE_LENGTH} caractères. Raccourcissez le motif.`);
      return;
    }

    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'card_purchase_requests', selectedRequest.id), {
        status: 'rejected',
        rejectionReason: cleanRejectionReason,
        processedAt: Date.now(),
        processedBy: user.email
      });

      await cardService.createNotification({
        userId: selectedRequest.userId,
        title: notificationTitle,
        message: notificationMessage,
        type: 'error',
        requestId: selectedRequest.id,
        cardName: selectedRequest.cardName
      });

      toast.success('Demande rejetée.');
      setSelectedRequest(null);
      setActionType(null);
    } catch (error) {
      toast.error('Erreur lors du rejet.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Update Physical Card Delivery Status
  const handleUpdateDeliveryStatus = async (deliveryId: string, newStatus: PhysicalCardRequest['status']) => {
    if (!user) return;
    try {
      await cardService.updateDeliveryStatus(
        deliveryId,
        newStatus as any,
        { email: user.email, uid: user.uid, role: user.role }
      );
      toast.success('Statut de livraison mis à jour.');
      setSelectedDelivery(null);
    } catch (error: any) {
      console.error('[UPDATE_DELIVERY_STATUS_ERROR]', error);
      toast.error("Impossible de mettre à jour le statut de livraison.");
    }
  };


  if (loading) return <div className="p-8 text-center text-slate-500 font-bold">Chargement du panneau d'administration...</div>;

  return (
    <div className="space-y-8 pb-20">
      
      {/* Tarifs Section */}
      <div className="flex items-center justify-between rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div>
          <h2 className="font-black text-blue-950">Attribution depuis le stock unique</h2>
          <p className="text-xs text-blue-700 mt-1">Chaque approbation attribue atomiquement une carte Market-Cash disponible. Les tarifs se configurent dans Profil.</p>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('purchases')}
          className={`pb-4 px-2 font-black text-lg flex items-center gap-2 cursor-pointer transition border-b-2 ${
            activeTab === 'purchases' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          <CreditCard size={20} />
          <span>Demandes d'achat de cartes</span>
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">
            {requests.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('deliveries')}
          className={`pb-4 px-2 font-black text-lg flex items-center gap-2 cursor-pointer transition border-b-2 ${
            activeTab === 'deliveries' 
              ? 'border-amber-500 text-amber-600' 
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          <Truck size={20} />
          <span>Commandes de cartes physiques (Livraisons)</span>
          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
            {deliveryRequests.length}
          </span>
        </button>
      </div>

      {/* TAB 1: PURCHASES */}
      {activeTab === 'purchases' && (
        <div className="bg-white rounded-[2.5rem] border-4 border-slate-100/50 overflow-hidden shadow-xl shadow-slate-200/40 p-3">
          <div className="overflow-x-auto rounded-[1.5rem]">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-800 border-b border-slate-200">
                <tr>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider">Date</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider">Client</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider">Type / Carte</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider">Montant</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider">Statut</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map(req => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-4 text-xs font-semibold">{new Date(req.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{req.userName || req.fullName} {(req.urgentProcessing || req.isUrgent) && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">⚠️ TRAITEMENT URGENT</span>}</div>
                      <div className="text-xs text-slate-500">{req.userEmail} • {req.phone || req.userPhone}</div>
                    </td>
                    <td className="p-4 font-bold text-blue-600">{req.cardName}</td>
                    <td className="p-4 font-black text-slate-800">{req.amount} {req.currency}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase ${
                        req.status === 'pending' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        req.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        'bg-red-100 text-red-800 border border-red-200'
                      }`}>
                        {req.status === 'pending' ? 'En attente' : req.status === 'approved' ? 'Approuvée' : 'Rejetée'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => {
                            setSelectedRequest(req);
                            setActionType(null);
                          }}
                          className="text-blue-600 hover:bg-blue-50 p-2 rounded-xl transition cursor-pointer"
                          title="Voir les détails"
                        >
                          <Eye size={18} />
                        </button>
                        {req.status === 'pending' && (
                          <button
                            onClick={() => handleOpenApproveModal(req)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition shadow-sm cursor-pointer"
                          >
                            Approuver
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">Aucune demande d'achat enregistrée.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PHYSICAL CARD DELIVERIES */}
      {activeTab === 'deliveries' && (
        <div className="bg-white rounded-[2.5rem] border-4 border-slate-100/50 overflow-hidden shadow-xl shadow-slate-200/40 p-3">
          <div className="overflow-x-auto rounded-[1.5rem]">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-800 border-b border-slate-200">
                <tr>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider">Date Commande</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider">Client</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider">Carte & Masque</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider">Date Souhaitée</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider">Adresse</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider">Statut</th>
                  <th className="p-4 font-bold text-xs uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveryRequests.map(deliv => (
                  <tr key={deliv.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-4 text-xs font-semibold">{new Date(deliv.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{deliv.userName}</div>
                      <div className="text-xs text-slate-500">{deliv.userEmail} • {deliv.userPhone}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-slate-800">{deliv.cardName}</div>
                      <div className="font-mono text-xs text-slate-500">{deliv.cardNumberMasked}</div>
                    </td>
                    <td className="p-4 font-bold text-amber-700">
                      {deliv.deliveryDate}
                    </td>
                    <td className="p-4 max-w-xs truncate text-xs text-slate-700" title={deliv.deliveryAddress}>
                      {deliv.deliveryAddress}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase ${
                        deliv.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                        deliv.status === 'assigned' || deliv.status === 'out_for_delivery' ? 'bg-blue-100 text-blue-800' :
                        deliv.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                        deliv.status === 'reported' ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {deliv.status === 'pending' ? 'En attente' :
                         deliv.status === 'assigned' ? 'Assignée' :
                         deliv.status === 'out_for_delivery' ? 'En livraison' :
                         deliv.status === 'delivered' ? 'Livrée' :
                         deliv.status === 'reported' ? 'Reportée' : 'Annulée'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedDelivery(deliv)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer"
                          title="Gérer la livraison"
                        >
                          <Eye size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {deliveryRequests.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 font-medium">Aucune commande de livraison physique.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DETAIL MODAL FOR PURCHASE REQUEST */}
      {selectedRequest && !actionType && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-slate-100/50">
              <h3 className="font-black text-xl text-slate-800 tracking-tight">Détails de la demande d'achat</h3>
              <button onClick={() => setSelectedRequest(null)} className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors cursor-pointer">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase mb-1">Client</div>
                  <div className="font-bold text-slate-800">{selectedRequest.fullName || selectedRequest.userName}</div>
                  <div className="text-xs text-slate-500">{selectedRequest.userEmail} • {selectedRequest.phone || selectedRequest.userPhone}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase mb-1">Carte demandée</div>
                  <div className="font-bold text-blue-600">{selectedRequest.cardName}</div>
                  <div className="text-xs text-slate-500 font-bold">{selectedRequest.amount} {selectedRequest.currency || 'USD'}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase mb-1">Paiement</div>
                  <div className="font-bold text-slate-800">{selectedRequest.paymentMethod}</div>
                  <div className="text-xs text-slate-500 font-mono">Ref: {selectedRequest.transactionReference || selectedRequest.paymentReference}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase mb-1">Statut</div>
                  <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                    selectedRequest.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                    selectedRequest.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {selectedRequest.status}
                  </span>
                </div>
              </div>

              {(selectedRequest.note || selectedRequest.clientNote) && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div className="text-xs font-bold text-slate-400 uppercase mb-1">Note du client</div>
                  <p className="text-xs text-slate-700">{selectedRequest.note || selectedRequest.clientNote}</p>
                </div>
              )}

              <div>
                <div className="text-xs font-bold text-slate-400 uppercase mb-2">Preuve de paiement</div>
                {(selectedRequest.proofUrl || selectedRequest.paymentProofUrl) ? (
                  <a 
                    href={selectedRequest.proofUrl || selectedRequest.paymentProofUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="block border border-slate-200 rounded-2xl overflow-hidden hover:opacity-90 transition max-w-sm"
                  >
                    <img 
                      src={selectedRequest.proofUrl || selectedRequest.paymentProofUrl} 
                      alt="Preuve de paiement" 
                      className="w-full max-h-64 object-contain bg-slate-100" 
                    />
                  </a>
                ) : (
                  <div className="text-sm text-slate-400 italic">Aucune preuve disponible</div>
                )}
              </div>

              {selectedRequest.identityRequired === true && !selectedRequest.urgentProcessing && (
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase mb-2">Pièce d'identité requise</div>
                  {selectedRequest.identityProofUrl ? (
                    <a href={selectedRequest.identityProofUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 text-blue-700 font-bold text-sm border border-blue-200">
                      <Eye size={16} /> Vérifier la pièce d'identité
                    </a>
                  ) : (
                    <div className="text-sm text-red-600 font-bold">Document manquant — approbation bloquée</div>
                  )}
                </div>
              )}
            </div>

            {selectedRequest.status === 'pending' && (
              <div className="p-6 border-t border-slate-100 flex space-x-4 bg-slate-50">
                <button 
                  onClick={() => setActionType('reject')}
                  className="flex-1 bg-red-100 text-red-700 py-3 rounded-xl font-bold hover:bg-red-200 transition flex justify-center items-center cursor-pointer"
                >
                  <XCircle size={18} className="mr-2" /> Rejeter
                </button>
                <button 
                  onClick={() => handleOpenApproveModal(selectedRequest)}
                  className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-black hover:bg-emerald-700 transition flex justify-center items-center shadow-sm cursor-pointer"
                >
                  <CheckCircle size={18} className="mr-2" /> Approuver & Attribuer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      
      {/* APPROVAL & CARD ATTRIBUTION MODAL */}
      {actionType === 'approve' && selectedRequest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl space-y-4">
            <h3 className="font-black text-2xl text-emerald-600 tracking-tight">Approuver & Attribuer</h3>
            <p className="text-sm font-medium text-slate-500">
              Vous êtes sur le point de valider le paiement de <strong>{selectedRequest.userName || selectedRequest.fullName}</strong>.
            </p>
            <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm font-medium">
              Une carte Market-Cash disponible sera automatiquement réservée puis attribuée à ce client. {selectedRequest.printRequested ? "La même carte entrera ensuite dans le flux d'impression PVC." : ''}
            </div>
            
            <div className="flex gap-3 pt-4">
              <button 
                onClick={() => setActionType(null)} 
                className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition"
                disabled={isProcessing}
              >
                Annuler
              </button>
              <button 
                onClick={handleApprove}
                disabled={isProcessing}
                className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-black hover:bg-emerald-700 transition flex justify-center items-center"
              >
                {isProcessing ? (
                   <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>Confirmer l'attribution</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
  {/* REJECTION MODAL */}
      {actionType === 'reject' && selectedRequest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <form onSubmit={handleReject} className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl space-y-4">
            <h3 className="font-black text-2xl text-red-600 tracking-tight">Rejeter la demande</h3>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2 uppercase">Raison du rejet (Obligatoire)</label>
              <textarea 
                required
                maxLength={getAdminRejectionReasonLimit(selectedRequest.cardName)}
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Ex: Preuve de paiement non valide ou référence introuvable"
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-red-500 font-medium text-slate-800 text-xs h-28 resize-none" 
              />
              <p className="mt-1 text-xs text-slate-500">
                {rejectionReason.length}/{getAdminRejectionReasonLimit(selectedRequest.cardName)} caractères maximum
              </p>
            </div>
            <div className="flex space-x-3 pt-2">
              <button 
                type="button" 
                onClick={() => setActionType(null)} 
                className="flex-1 py-3.5 rounded-2xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors cursor-pointer text-sm"
              >
                Annuler
              </button>
              <button 
                type="submit" 
                disabled={isProcessing} 
                className="flex-1 py-3.5 rounded-2xl bg-red-600 text-white font-black tracking-wide hover:bg-red-500 transition-colors disabled:opacity-50 shadow-lg shadow-red-600/30 cursor-pointer text-sm"
              >
                Confirmer le rejet
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DELIVERY DETAILS & STATUS MANAGEMENT MODAL */}
      {selectedDelivery && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center">
                  <Truck size={20} />
                </div>
                <div>
                  <h3 className="font-black text-xl text-slate-900 tracking-tight">Traitement de la Livraison</h3>
                  <p className="text-xs text-slate-500 font-medium">Commande de carte physique</p>
                </div>
              </div>
              <button onClick={() => setSelectedDelivery(null)} className="p-2 text-slate-400 hover:text-slate-800 rounded-full cursor-pointer">
                <X size={22} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Client :</span>
                  <span className="font-bold text-slate-800">{selectedDelivery.userName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Email :</span>
                  <span className="font-mono text-slate-700">{selectedDelivery.userEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Téléphone :</span>
                  <span className="font-mono text-slate-700">{selectedDelivery.userPhone || 'Non renseigné'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Carte :</span>
                  <span className="font-mono text-blue-600 font-bold">{selectedDelivery.cardNumberMasked}</span>
                </div>
              </div>

              <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 space-y-2 text-xs text-amber-900">
                <div>
                  <span className="font-black uppercase tracking-wider block mb-0.5">📅 Date souhaitée :</span>
                  <span className="font-bold text-sm">{selectedDelivery.deliveryDate}</span>
                </div>
                <div>
                  <span className="font-black uppercase tracking-wider block mb-0.5">📍 Adresse de livraison :</span>
                  <p className="font-medium text-xs leading-relaxed">{selectedDelivery.deliveryAddress}</p>
                </div>
              </div>

              <div className="pt-3">
                <label className="block text-xs font-black text-slate-700 uppercase mb-2">Changer le statut de la commande</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleUpdateDeliveryStatus(selectedDelivery.id, 'out_for_delivery')}
                    className="py-2.5 px-3 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 transition cursor-pointer"
                  >
                    En livraison
                  </button>
                  <button
                    onClick={() => handleUpdateDeliveryStatus(selectedDelivery.id, 'delivered')}
                    className="py-2.5 px-3 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-700 transition cursor-pointer"
                  >
                    Marquer Livrée
                  </button>
                  <button
                    onClick={() => handleUpdateDeliveryStatus(selectedDelivery.id, 'cancelled')}
                    className="py-2.5 px-3 bg-red-100 text-red-700 rounded-xl text-xs font-bold hover:bg-red-200 transition cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
