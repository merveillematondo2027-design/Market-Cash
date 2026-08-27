import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  getDocs, 
  getDoc, 
  doc, 
  updateDoc, 
  setDoc, 
  serverTimestamp,
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
  Edit2, 
  Save, 
  Truck, 
  CreditCard, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Calendar,
  MapPin,
  Sparkles,
  Phone,
  Mail,
  User as UserIcon
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { cardService } from '../../services/cardService';

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
  
  // Pricing Settings
  const [pricing, setPricing] = useState<{virtualCardPrice: number | null, physicalCardPrice: number | null, currency: string}>({ virtualCardPrice: null, physicalCardPrice: null, currency: 'USD' });
  const [isEditingPricing, setIsEditingPricing] = useState(false);
  const [pricingForm, setPricingForm] = useState<{virtualCardPrice: number | string, physicalCardPrice: number | string}>({ virtualCardPrice: '', physicalCardPrice: '' });
  const [savingPricing, setSavingPricing] = useState(false);

  // Approval Form for Purchase Requests
  const [cardForm, setCardForm] = useState({
    cardNumber: '',
    cardHolder: '',
    expiryStart: '02/27',
    expiryEnd: '08/27',
    cvv: '551',
    rechargeNumber: '',
    network: 'visa',
    type: 'virtual'
  });
  
  // Rejection Form
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [stockCounts, setStockCounts] = useState({ virtual: 0, physical: 0 });

  
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    loadPricing();

    // 1. Real-time purchase requests listener
    const qPurchases = query(collection(db, 'card_purchase_requests'));
    const unsubPurchases = onSnapshot(qPurchases, (snap) => {
      const docs = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as CardPurchaseRequest))
        .sort((a, b) => {
          if (a.isUrgent && !b.isUrgent) return -1;
          if (!a.isUrgent && b.isUrgent) return 1;
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

  const loadPricing = async () => {
    try {
      const p = await cardService.getPricing(true);
      setPricing(p);
      setPricingForm({ 
        virtualCardPrice: p.virtualCardPrice ?? '', 
        physicalCardPrice: p.physicalCardPrice ?? '' 
      });
    } catch (error: any) {
      console.error('[PRICING_LOAD_ERROR]', { code: error?.code, message: error?.message });
    }
  };

  const handleSavePricing = async () => {
    const vPrice = Number(pricingForm.virtualCardPrice);
    const pPrice = Number(pricingForm.physicalCardPrice);

    if (!user) {
      toast.error('Non autorisé');
      return;
    }

    if (!Number.isFinite(vPrice) || !Number.isFinite(pPrice) || vPrice <= 0 || pPrice <= 0) {
      toast.error('Veuillez saisir un prix supérieur à 0 USD.');
      return;
    }

    setSavingPricing(true);
    try {
      await setDoc(doc(db, 'app_settings', 'card_pricing'), {
        virtualCardPrice: vPrice,
        physicalCardPrice: pPrice,
        currency: "USD",
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }, { merge: true });
      
      setPricing({ virtualCardPrice: vPrice, physicalCardPrice: pPrice, currency: "USD" });
      setIsEditingPricing(false);
      toast.success('Tarifs mis à jour avec succès.');
    } catch (error: any) {
      console.log('[PRICING_UPDATE_ERROR]', error);
      toast.error('Erreur lors de la mise à jour des prix');
    } finally {
      setSavingPricing(false);
    }
  };

  const handleOpenApproveModal = (req: CardPurchaseRequest) => {
    setSelectedRequest(req);
    // Prefill form
    setCardForm({
      cardNumber: '',
      cardHolder: req.fullName || req.userName || '',
      expiryStart: '02/27',
      expiryEnd: '08/27',
      cvv: '551',
      rechargeNumber: '',
      network: 'visa',
      type: req.cardType || 'virtual'
    });
    setActionType('approve');
  };

  
  
  const handleApprove = async () => {
    if (!selectedRequest || !user) return;
    
    setIsProcessing(true);
    try {
      const type = selectedRequest.cardType || 'virtual';
      const assignedCard = await cardService.approveRequestWithStock(selectedRequest.id, type, { uid: user.uid, email: user.email! });
      
      toast.success(`Carte ${type} ${assignedCard.cardIdentifier} attribuée avec succès !`);
      
      await cardService.createNotification({
        userId: selectedRequest.userId,
        title: 'Paiement vérifié & Carte Attribuée 🎉',
        message: `Votre paiement a été vérifié. Votre carte ${type === 'physical' ? 'physique' : 'virtuelle'} vous a été attribuée (ID: ${assignedCard.cardIdentifier}).`,
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
    if (!rejectionReason.trim()) {
      toast.error('Raison du rejet obligatoire.');
      return;
    }

    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'card_purchase_requests', selectedRequest.id), {
        status: 'rejected',
        rejectionReason,
        processedAt: Date.now(),
        processedBy: user.email
      });

      await cardService.createNotification({
        userId: selectedRequest.userId,
        title: `Demande refusée : ${selectedRequest.cardName}`,
        message: `Votre demande pour la carte ${selectedRequest.cardName} n'a pas pu être validée. Motif : ${rejectionReason}`,
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
      <div className="bg-white rounded-[2.5rem] border-4 border-slate-100/50 p-6 shadow-xl shadow-slate-200/40">
        
        {(stockCounts.virtual === 0 || stockCounts.physical === 0) && requests.length > 0 && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-2xl">
            <div className="flex">
              <div className="flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-red-500" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-bold text-red-800">🔴 STOCK ÉPUISÉ</h3>
                <div className="mt-1 text-sm text-red-700">
                  <p>Des demandes de cartes sont en attente, mais aucune carte n'est actuellement disponible dans le stock pour certains types. Ajoutez des cartes au stock avant de confirmer une nouvelle vente.</p>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Configuration des Tarifs</h2>
            <p className="text-xs text-slate-500 font-medium">Prix appliqués lors de l'achat de cartes par les clients</p>
          </div>
          {isEditingPricing ? (
            <div className="flex gap-3">
              <button onClick={() => setIsEditingPricing(false)} className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs cursor-pointer">
                Annuler
              </button>
              <button onClick={handleSavePricing} disabled={savingPricing} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-black text-xs flex items-center gap-1.5 shadow-md shadow-blue-600/30 cursor-pointer">
                <Save size={16}/> {savingPricing ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          ) : (
            <button onClick={() => setIsEditingPricing(true)} className="px-5 py-2.5 bg-blue-950 text-amber-400 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer hover:bg-blue-900 transition">
              <Edit2 size={16}/> Modifier les prix
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 flex justify-between items-center">
            <div>
              <span className="text-xs font-bold text-blue-900 uppercase tracking-wider block mb-1">Carte Virtuelle</span>
              <p className="text-xs text-slate-500">Délivrance numérique instantanée</p>
            </div>
            {isEditingPricing ? (
              <input 
                type="number" 
                value={pricingForm.virtualCardPrice ?? ''} 
                onChange={e => setPricingForm({...pricingForm, virtualCardPrice: Number(e.target.value)})} 
                className="w-32 px-4 py-2 bg-white border border-blue-300 rounded-xl font-black text-xl text-blue-700 outline-none text-right" 
              />
            ) : (
              <div className="text-3xl font-black text-blue-700">
                {pricing.virtualCardPrice !== null ? `${pricing.virtualCardPrice} ${pricing.currency}` : 'Non défini'}
              </div>
            )}
          </div>

          <div className="bg-amber-50/50 p-6 rounded-3xl border border-amber-100 flex justify-between items-center">
            <div>
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider block mb-1">Carte Physique</span>
              <p className="text-xs text-slate-500">Fabrication et livraison physique</p>
            </div>
            {isEditingPricing ? (
              <input 
                type="number" 
                value={pricingForm.physicalCardPrice ?? ''} 
                onChange={e => setPricingForm({...pricingForm, physicalCardPrice: Number(e.target.value)})} 
                className="w-32 px-4 py-2 bg-white border border-amber-300 rounded-xl font-black text-xl text-amber-700 outline-none text-right" 
              />
            ) : (
              <div className="text-3xl font-black text-amber-700">
                {pricing.physicalCardPrice !== null ? `${pricing.physicalCardPrice} ${pricing.currency}` : 'Non défini'}
              </div>
            )}
          </div>
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
                      <div className="font-bold text-slate-900">{req.userName || req.fullName} {req.physicalOption === 'urgent' && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">⚠️ PHYSIQUE URGENT</span>}</div>
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
              Une carte <strong>{selectedRequest.cardType === 'physical' ? 'Physique' : 'Virtuelle'}</strong> sera automatiquement piochée dans le stock et attribuée à ce client.
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
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Ex: Preuve de paiement non valide ou référence introuvable"
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-red-500 font-medium text-slate-800 text-xs h-28 resize-none" 
              />
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
