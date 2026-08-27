import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { CardPurchaseRequest } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { cardService } from '../../services/cardService';
import toast from 'react-hot-toast';
import { 
  FileText, 
  Check, 
  X, 
  Clock, 
  User as UserIcon, 
  CreditCard, 
  Search, 
  Filter, 
  Phone, 
  Mail, 
  Calendar,
  ShieldCheck,
  AlertCircle,
  Building
} from 'lucide-react';

const MAX_NOTIFICATION_MESSAGE_LENGTH = 2000;
const AGENCY_REJECTION_MESSAGE_PREFIX = "Votre demande a été refusée par l'agence. Motif : ";
const AGENCY_REJECTION_MESSAGE_SUFFIX = '.';
const MAX_AGENCY_REJECTION_REASON_LENGTH =
  MAX_NOTIFICATION_MESSAGE_LENGTH - AGENCY_REJECTION_MESSAGE_PREFIX.length - AGENCY_REJECTION_MESSAGE_SUFFIX.length;

export default function AgencyRequests() {
  const { user } = useAuthStore();
  const [requests, setRequests] = useState<CardPurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'pending' | 'approved' | 'rejected'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Approval uses the same atomic stock assignment as the admin flow.
  const [selectedReq, setSelectedReq] = useState<CardPurchaseRequest | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Rejection modal
  const [rejectingReq, setRejectingReq] = useState<CardPurchaseRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    const qReqs = query(collection(db, 'card_purchase_requests'));
    const unsub = onSnapshot(qReqs, (snap) => {
      const docs = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as CardPurchaseRequest))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      
      setRequests(docs);
      setLoading(false);
    }, (err) => {
      console.error('[AGENCY_REQUESTS_ERR]', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const openApproveModal = (req: CardPurchaseRequest) => {
    setSelectedReq(req);
  };

  const handleConfirmApproval = async () => {
    if (!selectedReq || !user) return;

    setIsProcessing(true);
    try {
      const assignedCard = await cardService.approveRequestWithStock(selectedReq.id, 'virtual', { uid: user.uid, email: user.email });
      await cardService.createNotification({
        userId: selectedReq.userId,
        title: "Demande d'achat approuvée !",
        message: `Votre carte Market-Cash ${assignedCard.cardIdentifier} vous a été attribuée.`,
        type: 'success',
        requestId: selectedReq.id,
        cardIdentifier: assignedCard.cardIdentifier
      });
      toast.success(`Demande validée : ${assignedCard.cardIdentifier}`);
      setSelectedReq(null);
    } catch (err: any) {
      console.error('[APPROVE_REQUEST_ERROR]', err);
      if (err?.message === 'STOCK_EMPTY') toast.error('Stock épuisé : aucune carte préconfigurée disponible.');
      else if (err?.message === 'IDENTITY_REQUIRED') toast.error("La pièce d'identité obligatoire doit être vérifiée avant attribution.");
      else toast.error('Erreur lors de la validation de la demande.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingReq || !user) return;

    const cleanRejectionReason = rejectionReason.trim();
    if (!cleanRejectionReason) {
      toast.error('Raison du rejet obligatoire.');
      return;
    }

    const notificationMessage = `${AGENCY_REJECTION_MESSAGE_PREFIX}${cleanRejectionReason}${AGENCY_REJECTION_MESSAGE_SUFFIX}`;
    if (notificationMessage.length > MAX_NOTIFICATION_MESSAGE_LENGTH) {
      toast.error(`Le message de notification ne peut pas dépasser ${MAX_NOTIFICATION_MESSAGE_LENGTH} caractères. Raccourcissez le motif.`);
      return;
    }

    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'card_purchase_requests', rejectingReq.id), {
        status: 'rejected',
        processedAt: Date.now(),
        processedBy: user.displayName || user.email,
        rejectionReason: cleanRejectionReason,
        updatedAt: Date.now()
      });

      // Notify Client
      await setDoc(doc(collection(db, 'notifications')), {
        userId: rejectingReq.userId,
        title: 'Demande d\'achat refusée',
        message: notificationMessage,
        type: 'error',
        read: false,
        createdAt: Date.now()
      });

      toast.success('Demande rejetée.');
      setRejectingReq(null);
      setRejectionReason('');
    } catch (err: any) {
      console.error('[REJECT_REQUEST_ERROR]', err);
      toast.error('Erreur lors du rejet de la demande.');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredRequests = requests.filter(r => {
    const matchesFilter = activeFilter === 'ALL' || r.status === activeFilter;
    const queryStr = searchQuery.toLowerCase();
    const matchesSearch = 
      !queryStr ||
      (r.userName?.toLowerCase().includes(queryStr)) ||
      (r.userEmail?.toLowerCase().includes(queryStr)) ||
      (r.cardName?.toLowerCase().includes(queryStr));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <FileText className="text-blue-600" />
            Demandes d'Achat de Cartes
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Validez les demandes d'achat des clients et transmettez les cartes à l'atelier d'impression.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar (Mobile First) */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Rechercher un client, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['pending', 'approved', 'rejected', 'ALL'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all touch-manipulation ${
                activeFilter === filter
                  ? 'bg-blue-950 text-amber-400 shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {filter === 'pending' ? 'En attente' :
               filter === 'approved' ? 'Approuvées' :
               filter === 'rejected' ? 'Rejetées' : 'Toutes'}
            </button>
          ))}
        </div>
      </div>

      {/* Requests List (Mobile-First Vertical Cards) */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Chargement des demandes...</div>
      ) : filteredRequests.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200/80 shadow-sm space-y-2">
          <Clock size={36} className="mx-auto text-slate-300" />
          <h3 className="font-bold text-slate-700 text-sm">Aucune demande trouvée</h3>
          <p className="text-xs text-slate-400">Aucune demande ne correspond à vos critères actuels.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredRequests.map((req) => (
            <div
              key={req.id}
              className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3"
            >
              {/* Header: User Info & Status */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-950 font-black text-xs shrink-0">
                    <UserIcon size={18} />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-800 leading-tight">
                      {req.userName || 'Client'}
                    </h3>
                    <p className="text-xs text-slate-500 truncate max-w-[180px]">
                      {req.userEmail}
                    </p>
                  </div>
                </div>

                <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider ${
                  req.status === 'pending' ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                  req.status === 'approved' ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' :
                  'bg-red-100 text-red-900 border border-red-200'
                }`}>
                  {req.status === 'pending' ? 'En attente' :
                   req.status === 'approved' ? 'Approuvée' : 'Rejetée'}
                </span>
              </div>

              {/* Body: Card details & Date */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">Type :</span>
                  <span className="font-bold text-slate-800">{req.cardName || 'Carte Market-Cash'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">Prix d'achat :</span>
                  <span className="font-black text-blue-600">{req.price || 10} USD</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-medium">Date de soumission :</span>
                  <span className="font-medium text-slate-600">
                    {req.createdAt ? new Date(req.createdAt).toLocaleDateString('fr-FR', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    }) : '-'}
                  </span>
                </div>
                {req.rejectionReason && (
                  <div className="pt-1.5 border-t border-slate-200/60 text-red-600 font-medium">
                    Motif de rejet : {req.rejectionReason}
                  </div>
                )}
              </div>

              {/* Actions */}
              {req.status === 'pending' && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => openApproveModal(req)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs touch-manipulation"
                  >
                    <Check size={16} />
                    <span>Valider & Vendre</span>
                  </button>
                  <button
                    onClick={() => setRejectingReq(req)}
                    className="bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all touch-manipulation"
                  >
                    <X size={16} />
                    <span>Rejeter</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Approval from the unique preconfigured stock */}
      {selectedReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5">
            <div className="flex justify-between gap-3">
              <div><h3 className="font-black text-blue-950 text-lg">Approuver et attribuer</h3>
                <p className="text-xs text-slate-500 mt-1">Pour {selectedReq.userName || selectedReq.userEmail}</p></div>
              <button type="button" onClick={() => setSelectedReq(null)} className="p-2 text-slate-500"><X size={19} /></button>
            </div>
            <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900">
              Une carte Market-Cash disponible sera attribuée atomiquement. Aucun numéro, CVV ou code de recharge ne doit être saisi ici.
            </div>
            {selectedReq.identityRequired === true && !selectedReq.urgentProcessing && (
              selectedReq.identityProofUrl
                ? <a href={selectedReq.identityProofUrl} target="_blank" rel="noopener noreferrer" className="block text-center py-3 rounded-xl border border-blue-200 text-blue-700 font-bold">Vérifier la pièce d'identité</a>
                : <p className="p-3 rounded-xl bg-red-50 text-red-700 font-bold text-sm">Pièce d'identité manquante — approbation bloquée.</p>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => setSelectedReq(null)} disabled={isProcessing} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold">Annuler</button>
              <button type="button" onClick={handleConfirmApproval} disabled={isProcessing || (selectedReq.identityRequired === true && !selectedReq.urgentProcessing && !selectedReq.identityProofUrl)}
                className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black disabled:opacity-50">
                {isProcessing ? 'Attribution…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectingReq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="font-black text-slate-800 text-base">Rejeter la Demande d'Achat</h3>
            <p className="text-xs text-slate-500">
              Veuillez indiquer un motif de refus qui sera envoyé par notification au client.
            </p>
            <form onSubmit={handleReject} className="space-y-3">
              <textarea
                required
                maxLength={MAX_AGENCY_REJECTION_REASON_LENGTH}
                rows={3}
                placeholder="Ex : Paiement non vérifié, pièces justificatives manquantes..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                {rejectionReason.length}/{MAX_AGENCY_REJECTION_REASON_LENGTH} caractères maximum
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRejectingReq(null)}
                  className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-xl font-bold text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl font-bold text-xs disabled:opacity-50"
                >
                  {isProcessing ? 'Rejet...' : 'Confirmer le Rejet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
