import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase/config';
import { CardPurchaseRequest, PhysicalCardRequest } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { cardService } from '../../services/cardService';
import {
  isUrgentCardRequest,
  ManualCardDetails,
  requestApprovalService
} from '../../services/requestApprovalService';
import toast from 'react-hot-toast';
import {
  AlertTriangle, CheckCircle2, Clock, CreditCard, Eye, FileCheck2,
  History, ShieldCheck, Truck, X, Zap
} from 'lucide-react';

const MAX_NOTIFICATION_MESSAGE_LENGTH = 2000;
const rejectionMessage = (cardName: string, reason: string) => `Votre demande pour la carte ${cardName} n'a pas pu être validée. Motif : ${reason}`;
type PurchaseQueue = 'urgent' | 'normal' | 'history';
type ActionType = 'approve-urgent' | 'approve-normal' | 'reject' | null;

const emptyManualCard: ManualCardDetails = {
  rechargeNumber: '',
  cardNumber: '',
  expiryStart: '',
  expiryEnd: '',
  cvv: ''
};

export default function AdminRequests() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'purchases' | 'deliveries'>('purchases');
  const [purchaseQueue, setPurchaseQueue] = useState<PurchaseQueue>('urgent');
  const [deliveryView, setDeliveryView] = useState<'pending' | 'history'>('pending');
  const [requests, setRequests] = useState<CardPurchaseRequest[]>([]);
  const [deliveryRequests, setDeliveryRequests] = useState<PhysicalCardRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<CardPurchaseRequest | null>(null);
  const [selectedDelivery, setSelectedDelivery] = useState<PhysicalCardRequest | null>(null);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [manualCard, setManualCard] = useState<ManualCardDetails>(emptyManualCard);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribePurchases = onSnapshot(query(collection(db, 'card_purchase_requests')), snap => {
      const list = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as CardPurchaseRequest))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRequests(list);
      setSelectedRequest(current => current ? list.find(item => item.id === current.id) || current : null);
      setLoading(false);
    }, error => {
      console.error('[ADMIN_PURCHASES_ERROR]', error);
      setLoading(false);
    });

    const unsubscribeDeliveries = onSnapshot(query(collection(db, 'physical_card_requests')), snap => {
      setDeliveryRequests(snap.docs
        .map(d => ({ ...d.data(), id: d.id } as PhysicalCardRequest))
        .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)));
    }, error => console.error('[ADMIN_DELIVERIES_ERROR]', error));

    return () => {
      unsubscribePurchases();
      unsubscribeDeliveries();
    };
  }, []);

  const urgentRequests = useMemo(
    () => requests.filter(r => r.status === 'pending' && isUrgentCardRequest(r)),
    [requests]
  );
  const normalRequests = useMemo(
    () => requests.filter(r => r.status === 'pending' && !isUrgentCardRequest(r)),
    [requests]
  );
  const historyRequests = useMemo(() => requests.filter(r => r.status !== 'pending'), [requests]);
  const visibleRequests = purchaseQueue === 'urgent' ? urgentRequests : purchaseQueue === 'normal' ? normalRequests : historyRequests;

  const pendingDeliveries = useMemo(() => deliveryRequests.filter(d => !['delivered','cancelled'].includes(d.status)), [deliveryRequests]);
  const historyDeliveries = useMemo(() => deliveryRequests.filter(d => ['delivered','cancelled'].includes(d.status)), [deliveryRequests]);
  const visibleDeliveries = deliveryView === 'pending' ? pendingDeliveries : historyDeliveries;

  const reviewer = user ? {
    uid: user.uid,
    email: user.email || '',
    role: user.role,
    agencyId: user.agencyId,
    agencyName: user.agencyName
  } : null;

  const openUser = (userId?: string) => {
    if (userId) navigate(`/admin/users?uid=${encodeURIComponent(userId)}`);
  };

  const closeRequest = () => {
    if (isProcessing) return;
    setActionType(null);
    setRejectionReason('');
    setManualCard(emptyManualCard);
    setSelectedRequest(null);
  };

  const startApproval = (request: CardPurchaseRequest) => {
    setSelectedRequest(request);
    setManualCard(emptyManualCard);
    setActionType(isUrgentCardRequest(request) ? 'approve-urgent' : 'approve-normal');
  };

  const handleAcceptIdentity = async () => {
    if (!selectedRequest || !reviewer || isProcessing) return;
    setIsProcessing(true);
    try {
      await requestApprovalService.acceptIdentity(selectedRequest.id, reviewer);
      setSelectedRequest({ ...selectedRequest, identityVerified: true });
      toast.success('Pièce d’identité acceptée. La demande peut maintenant être approuvée.');
    } catch (error: any) {
      console.error('[IDENTITY_ACCEPT_ERROR]', error);
      const code = error?.message || error?.code;
      if (code === 'IDENTITY_MISSING') toast.error('Aucune pièce d’identité n’est disponible.');
      else toast.error(`Validation de l’identité impossible${code ? ` : ${code}` : '.'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveUrgent = async () => {
    if (!selectedRequest || !reviewer || isProcessing) return;
    const request = selectedRequest;
    setIsProcessing(true);
    try {
      const assigned = await requestApprovalService.approveUrgentRequest(request.id, reviewer);
      await cardService.createNotification({
        userId: request.userId,
        title: 'Commande urgente approuvée',
        message: `Votre paiement a été vérifié. La carte ${assigned.cardIdentifier} a été attribuée automatiquement depuis le stock.`,
        type: 'success',
        requestId: request.id,
        cardIdentifier: assigned.cardIdentifier
      });
      closeAfterSuccess();
      toast.success(`Urgence approuvée : ${assigned.cardIdentifier} attribuée depuis le stock.`);
    } catch (error: any) {
      console.error('[URGENT_APPROVAL_ERROR]', error);
      const code = error?.message || error?.code;
      if (code === 'STOCK_EMPTY') toast.error('Stock épuisé : aucune carte préconfigurée disponible.');
      else toast.error(`Approbation urgente impossible${code ? ` : ${code}` : '.'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveNormal = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRequest || !reviewer || isProcessing) return;
    if (selectedRequest.identityVerified !== true) {
      return toast.error('Acceptez d’abord la pièce d’identité du client.');
    }

    setIsProcessing(true);
    try {
      const issued = await requestApprovalService.approveNormalRequest(selectedRequest.id, manualCard, reviewer);
      closeAfterSuccess();
      toast.success(`Demande normale approuvée : ${issued.cardIdentifier} créée et attribuée.`);
    } catch (error: any) {
      console.error('[NORMAL_APPROVAL_ERROR]', error);
      const code = error?.message || error?.code;
      const messages: Record<string,string> = {
        IDENTITY_NOT_ACCEPTED: 'La pièce d’identité doit être acceptée avant l’approbation.',
        IDENTITY_MISSING: 'La pièce d’identité est absente.',
        INVALID_CARD_NUMBER: 'Le numéro de carte doit contenir exactement 16 chiffres.',
        INVALID_RECHARGE_NUMBER: 'Le numéro de recharge est obligatoire.',
        INVALID_CVV: 'Le CVV doit contenir 3 ou 4 chiffres.',
        INVALID_EXPIRY: 'Les dates doivent être au format MM/AA.'
      };
      toast.error(messages[code] || `Approbation impossible${code ? ` : ${code}` : '.'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const closeAfterSuccess = () => {
    setActionType(null);
    setSelectedRequest(null);
    setRejectionReason('');
    setManualCard(emptyManualCard);
  };

  const handleReject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRequest || !reviewer || isProcessing) return;
    const request = selectedRequest;
    const reason = rejectionReason.trim();
    if (!reason) return toast.error('Raison du rejet obligatoire.');
    const cardName = request.cardName || 'Market-Cash';
    const message = rejectionMessage(cardName, reason);
    if (message.length > MAX_NOTIFICATION_MESSAGE_LENGTH) return toast.error('Motif trop long.');

    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'card_purchase_requests', request.id), {
        status: 'rejected',
        rejectionReason: reason,
        processedAt: Date.now(),
        processedBy: reviewer.uid,
        updatedAt: Date.now()
      });
      await cardService.createNotification({
        userId: request.userId,
        title: `Demande refusée : ${cardName}`,
        message,
        type: 'error',
        requestId: request.id,
        cardName
      });
      closeAfterSuccess();
      toast.success('Demande rejetée et déplacée dans l’historique.');
    } catch (error) {
      console.error('[REJECT_REQUEST_ERROR]', error);
      toast.error('Erreur lors du rejet.');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateDelivery = async (deliveryId: string, status: PhysicalCardRequest['status']) => {
    if (!user || isProcessing) return;
    setIsProcessing(true);
    try {
      await cardService.updateDeliveryStatus(deliveryId, status, { email: user.email, uid: user.uid, role: user.role });
      setSelectedDelivery(null);
      toast.success('Statut de livraison mis à jour.');
    } catch (error) {
      console.error('[DELIVERY_STATUS_ERROR]', error);
      toast.error('Mise à jour impossible.');
    } finally { setIsProcessing(false); }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 font-bold">Chargement des demandes...</div>;

  return <div className="max-w-6xl mx-auto space-y-4 pb-24 px-1 sm:px-0">
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
      <h1 className="text-lg sm:text-xl font-black text-blue-950">Demandes de cartes</h1>
      <p className="text-xs sm:text-sm text-blue-700 mt-1">Urgence = attribution automatique du stock. Normale = identité validée puis saisie manuelle de la carte.</p>
    </div>

    <div className="grid grid-cols-2 gap-2 bg-white border border-slate-200 rounded-2xl p-1.5">
      <button onClick={()=>setActiveTab('purchases')} className={`rounded-xl px-2 py-2.5 text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 ${activeTab==='purchases'?'bg-blue-950 text-white':'text-slate-500'}`}><CreditCard size={15}/>Cartes ({urgentRequests.length + normalRequests.length})</button>
      <button onClick={()=>setActiveTab('deliveries')} className={`rounded-xl px-2 py-2.5 text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 ${activeTab==='deliveries'?'bg-blue-950 text-white':'text-slate-500'}`}><Truck size={15}/>Livraisons ({pendingDeliveries.length})</button>
    </div>

    {activeTab === 'purchases' ? <>
      <div className="grid grid-cols-3 gap-2">
        <QueueButton active={purchaseQueue==='urgent'} onClick={()=>setPurchaseQueue('urgent')} icon={<Zap size={14}/>} label={`Urgentes (${urgentRequests.length})`} urgent />
        <QueueButton active={purchaseQueue==='normal'} onClick={()=>setPurchaseQueue('normal')} icon={<FileCheck2 size={14}/>} label={`Normales (${normalRequests.length})`} />
        <QueueButton active={purchaseQueue==='history'} onClick={()=>setPurchaseQueue('history')} icon={<History size={14}/>} label={`Historique (${historyRequests.length})`} />
      </div>

      <div className="space-y-2.5">
        {visibleRequests.map(request => <PurchaseCard
          key={request.id}
          request={request}
          onUser={()=>openUser(request.userId)}
          onView={()=>{ setSelectedRequest(request); setActionType(null); }}
          onApprove={()=>startApproval(request)}
        />)}
        {!visibleRequests.length && <Empty text={purchaseQueue==='urgent'?'Aucune demande urgente à traiter.':purchaseQueue==='normal'?'Aucune demande normale à traiter.':'Aucune demande traitée.'}/>} 
      </div>
    </> : <>
      <div className="grid grid-cols-2 gap-2">
        <QueueButton active={deliveryView==='pending'} onClick={()=>setDeliveryView('pending')} icon={<Clock size={14}/>} label={`À traiter (${pendingDeliveries.length})`} />
        <QueueButton active={deliveryView==='history'} onClick={()=>setDeliveryView('history')} icon={<History size={14}/>} label={`Historique (${historyDeliveries.length})`} />
      </div>
      <div className="space-y-2.5">
        {visibleDeliveries.map(delivery => <DeliveryCard key={delivery.id} delivery={delivery} onUser={()=>openUser(delivery.userId)} onView={()=>setSelectedDelivery(delivery)}/>)}
        {!visibleDeliveries.length && <Empty text={deliveryView==='pending'?'Aucune livraison active.':'Aucune livraison terminée.'}/>} 
      </div>
    </>}

    {selectedRequest && <RequestModal
      request={selectedRequest}
      actionType={actionType}
      manualCard={manualCard}
      rejectionReason={rejectionReason}
      isProcessing={isProcessing}
      onClose={closeRequest}
      onUser={()=>openUser(selectedRequest.userId)}
      onSetAction={setActionType}
      onSetManualCard={setManualCard}
      onSetRejectionReason={setRejectionReason}
      onAcceptIdentity={handleAcceptIdentity}
      onApproveUrgent={handleApproveUrgent}
      onApproveNormal={handleApproveNormal}
      onReject={handleReject}
    />}

    {selectedDelivery && <div className="fixed inset-0 z-50 bg-slate-950/70 p-3 flex items-center justify-center" onMouseDown={e=>{if(e.target===e.currentTarget&&!isProcessing)setSelectedDelivery(null)}}><div className="w-full max-w-md bg-white rounded-3xl p-5 space-y-3"><div className="flex justify-between"><div><h3 className="font-black text-lg">Livraison</h3><button onClick={()=>openUser(selectedDelivery.userId)} className="text-xs font-black text-blue-700 hover:underline">{selectedDelivery.userName||selectedDelivery.clientName||'Client'}</button></div><button onClick={()=>setSelectedDelivery(null)} className="p-2 bg-slate-100 rounded-full"><X size={16}/></button></div><Info label="Carte" value={selectedDelivery.cardIdentifier||selectedDelivery.cardId}/><Info label="Adresse" value={selectedDelivery.deliveryAddress||'—'}/><Info label="WhatsApp" value={selectedDelivery.whatsapp||selectedDelivery.whatsappNumber||'—'}/><DeliveryStatus status={selectedDelivery.status}/><div className="grid grid-cols-2 gap-2"><button disabled={isProcessing} onClick={()=>void updateDelivery(selectedDelivery.id,'in_progress')} className="py-3 rounded-xl bg-blue-950 text-white font-black text-xs">En cours</button><button disabled={isProcessing} onClick={()=>void updateDelivery(selectedDelivery.id,'delivered')} className="py-3 rounded-xl bg-emerald-600 text-white font-black text-xs">Livrée</button></div></div></div>}
  </div>;
}

function RequestModal(props:{
  request:CardPurchaseRequest;
  actionType:ActionType;
  manualCard:ManualCardDetails;
  rejectionReason:string;
  isProcessing:boolean;
  onClose:()=>void;
  onUser:()=>void;
  onSetAction:(action:ActionType)=>void;
  onSetManualCard:(details:ManualCardDetails)=>void;
  onSetRejectionReason:(value:string)=>void;
  onAcceptIdentity:()=>Promise<void>;
  onApproveUrgent:()=>Promise<void>;
  onApproveNormal:(event:React.FormEvent)=>Promise<void>;
  onReject:(event:React.FormEvent)=>Promise<void>;
}) {
  const { request, actionType, manualCard, isProcessing } = props;
  const urgent = isUrgentCardRequest(request);
  return <div className="fixed inset-0 z-50 bg-slate-950/70 p-2 sm:p-4 flex items-center justify-center" onMouseDown={e=>{if(e.target===e.currentTarget)props.onClose()}}><div className="w-full max-w-lg max-h-[94vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">
    <div className="p-4 border-b flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-black text-lg text-blue-950">{actionType==='approve-urgent'?'Approuver urgence':actionType==='approve-normal'?'Approuver demande normale':actionType==='reject'?'Rejeter la demande':'Détail de la demande'}</h2>{urgent&&<span className="px-2 py-1 bg-red-100 text-red-700 rounded-lg text-[9px] font-black">URGENTE</span>}</div><button onClick={props.onUser} className="text-xs font-black text-blue-700 hover:underline">{request.userName||request.fullName||request.userEmail||'Client'}</button></div><button disabled={isProcessing} onClick={props.onClose} className="p-2 rounded-full bg-slate-100 disabled:opacity-40"><X size={17}/></button></div>
    <div className="p-4 overflow-y-auto space-y-3">
      <Summary request={request}/>
      <Proofs request={request}/>

      {!urgent && request.status==='pending' && <IdentityReview request={request} isProcessing={isProcessing} onAccept={props.onAcceptIdentity}/>} 

      {actionType===null && request.status==='pending' && <div className="grid grid-cols-2 gap-2"><button onClick={()=>props.onSetAction('reject')} className="py-3 rounded-xl bg-red-50 text-red-700 font-black text-xs">Rejeter</button><button onClick={()=>props.onSetAction(urgent?'approve-urgent':'approve-normal')} disabled={!urgent && request.identityVerified!==true} className="py-3 rounded-xl bg-emerald-600 text-white font-black text-xs disabled:opacity-40 disabled:cursor-not-allowed">{urgent?'Approuver urgence':'Continuer l’approbation'}</button></div>}

      {actionType==='approve-urgent' && <div className="space-y-3"><div className="rounded-2xl bg-red-50 border border-red-100 p-4 text-sm text-red-900"><strong>Commande urgente.</strong> Aucune pièce d’identité n’est requise. Après confirmation du paiement, une carte disponible sera choisie automatiquement dans le stock et attribuée au client.</div><div className="grid grid-cols-2 gap-2"><button disabled={isProcessing} onClick={()=>props.onSetAction(null)} className="py-3 rounded-xl bg-slate-100 font-black">Retour</button><button disabled={isProcessing} onClick={()=>void props.onApproveUrgent()} className="py-3 rounded-xl bg-emerald-600 text-white font-black disabled:opacity-50">{isProcessing?'Attribution...':'Confirmer'}</button></div></div>}

      {actionType==='approve-normal' && <form onSubmit={props.onApproveNormal} className="space-y-3"><div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-900"><strong>Commande normale.</strong> La pièce d’identité doit être acceptée. Saisissez ensuite manuellement les informations de la carte à attribuer. Cette carte ne sera pas prise dans le stock urgent.</div><ManualCardForm value={manualCard} onChange={props.onSetManualCard}/><div className="grid grid-cols-2 gap-2"><button type="button" disabled={isProcessing} onClick={()=>props.onSetAction(null)} className="py-3 rounded-xl bg-slate-100 font-black">Retour</button><button disabled={isProcessing||request.identityVerified!==true} className="py-3 rounded-xl bg-emerald-600 text-white font-black disabled:opacity-40">{isProcessing?'Création...':'Créer & approuver'}</button></div></form>}

      {actionType==='reject' && <form onSubmit={props.onReject} className="space-y-3"><textarea value={props.rejectionReason} onChange={e=>props.onSetRejectionReason(e.target.value)} placeholder="Motif du rejet" className="w-full min-h-28 p-3 rounded-xl border"/><div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>props.onSetAction(null)} className="py-3 rounded-xl bg-slate-100 font-black">Retour</button><button disabled={isProcessing} className="py-3 rounded-xl bg-red-600 text-white font-black">Confirmer rejet</button></div></form>}
    </div>
  </div></div>;
}

function IdentityReview({request,isProcessing,onAccept}:{request:CardPurchaseRequest;isProcessing:boolean;onAccept:()=>Promise<void>}) {
  if (request.identityVerified === true) return <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-black"><ShieldCheck size={17}/>Identité acceptée — approbation autorisée.</div>;
  if (!request.identityProofUrl) return <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 text-xs font-black"><AlertTriangle size={17}/>Pièce d’identité absente : la demande normale ne peut pas être approuvée.</div>;
  return <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2"><div className="text-xs font-black text-amber-900">Vérifiez la pièce d’identité avant de continuer.</div><button disabled={isProcessing} onClick={()=>void onAccept()} className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-black disabled:opacity-50"><CheckCircle2 size={15} className="inline mr-1.5"/>Identité acceptée</button></div>;
}

function ManualCardForm({value,onChange}:{value:ManualCardDetails;onChange:(value:ManualCardDetails)=>void}) {
  const field = (key:keyof ManualCardDetails, next:string) => onChange({ ...value, [key]: next });
  return <div className="grid grid-cols-2 gap-2">
    <label className="col-span-2 text-xs font-black text-slate-700">Numéro de recharge<input required value={value.rechargeNumber} onChange={e=>field('rechargeNumber',e.target.value)} className="mt-1 w-full p-3 rounded-xl border font-mono" placeholder="Numéro de recharge"/></label>
    <label className="col-span-2 text-xs font-black text-slate-700">Numéro de carte<input required inputMode="numeric" value={value.cardNumber} onChange={e=>field('cardNumber',e.target.value)} className="mt-1 w-full p-3 rounded-xl border font-mono" placeholder="16 chiffres" maxLength={19}/></label>
    <label className="text-xs font-black text-slate-700">Début<input required value={value.expiryStart} onChange={e=>field('expiryStart',e.target.value)} className="mt-1 w-full p-3 rounded-xl border font-mono" placeholder="MM/AA" maxLength={5}/></label>
    <label className="text-xs font-black text-slate-700">Fin<input required value={value.expiryEnd} onChange={e=>field('expiryEnd',e.target.value)} className="mt-1 w-full p-3 rounded-xl border font-mono" placeholder="MM/AA" maxLength={5}/></label>
    <label className="col-span-2 text-xs font-black text-slate-700">CVV<input required inputMode="numeric" type="password" value={value.cvv} onChange={e=>field('cvv',e.target.value)} className="mt-1 w-full p-3 rounded-xl border font-mono" placeholder="3 ou 4 chiffres" maxLength={4}/><span className="block mt-1 text-[10px] text-slate-400">Le CVV n’est jamais écrit dans les logs.</span></label>
  </div>;
}

function PurchaseCard({request,onUser,onView,onApprove}:{request:CardPurchaseRequest;onUser:()=>void;onView:()=>void;onApprove:()=>void}) {
  const urgent = isUrgentCardRequest(request);
  return <article className={`bg-white border rounded-2xl p-4 shadow-sm ${urgent&&request.status==='pending'?'border-red-200':''}`}><div className="flex justify-between gap-3"><div className="min-w-0"><button onClick={onUser} className="font-black text-sm text-blue-800 hover:underline text-left break-words">{request.userName||request.fullName||request.userEmail||'Client'}</button><div className="text-[10px] text-slate-400 mt-0.5">{new Date(request.createdAt).toLocaleString('fr-FR')}</div></div><Status status={request.status}/></div><div className="mt-3 grid grid-cols-2 gap-2"><Info label="Traitement" value={urgent?'URGENT — stock automatique':request.identityVerified?'Normal — identité acceptée':'Normal — identité à vérifier'}/><Info label="Montant" value={`${request.amount} ${request.currency||'USD'}`}/><Info label="Impression" value={request.printRequested?'Oui':'Non'}/><Info label="Paiement" value={request.paymentMethod||'—'}/></div>{request.status==='pending'&&<div className="mt-3 grid grid-cols-2 gap-2"><button onClick={onView} className="py-2.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-black"><Eye size={14} className="inline mr-1"/>Vérifier</button><button onClick={onApprove} disabled={!urgent&&request.identityVerified!==true} className={`py-2.5 rounded-xl text-xs font-black text-white disabled:opacity-40 ${urgent?'bg-red-600':'bg-emerald-600'}`}>{urgent?'Approuver urgence':'Approuver'}</button></div>}{request.status!=='pending'&&<button onClick={onView} className="mt-3 w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-black">Voir le dossier</button>}</article>;
}

function DeliveryCard({delivery,onUser,onView}:{delivery:PhysicalCardRequest;onUser:()=>void;onView:()=>void}) { return <article className="bg-white border rounded-2xl p-4"><div className="flex justify-between gap-3"><button onClick={onUser} className="font-black text-sm text-blue-800 hover:underline text-left">{delivery.userName||delivery.clientName||'Client'}</button><DeliveryStatus status={delivery.status}/></div><div className="mt-3 grid grid-cols-2 gap-2"><Info label="Carte" value={delivery.cardIdentifier||delivery.cardId}/><Info label="Date" value={new Date(delivery.createdAt).toLocaleDateString('fr-FR')}/><div className="col-span-2"><Info label="Adresse" value={delivery.deliveryAddress||'—'}/></div></div><button onClick={onView} className="mt-3 w-full py-2.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-black">Ouvrir</button></article> }
function Proofs({request}:{request:CardPurchaseRequest}) { const urgent=isUrgentCardRequest(request); return <div className="space-y-2">{(request.proofUrl||request.paymentProofUrl)?<a href={request.proofUrl||request.paymentProofUrl} target="_blank" rel="noreferrer" className="block p-3 rounded-xl bg-blue-50 text-blue-700 font-black text-xs">Voir la preuve de paiement</a>:<div className="p-3 rounded-xl bg-red-50 text-red-700 font-bold text-xs">Preuve de paiement absente</div>}{!urgent&&(request.identityProofUrl?<a href={request.identityProofUrl} target="_blank" rel="noreferrer" className="block p-3 rounded-xl bg-amber-50 text-amber-800 font-black text-xs">Voir la pièce d’identité</a>:<div className="p-3 rounded-xl bg-red-50 text-red-700 font-bold text-xs">Pièce d’identité obligatoire manquante</div>)}</div> }
function Summary({request}:{request:CardPurchaseRequest}) { return <div className="grid grid-cols-2 gap-2"><Info label="Type" value={isUrgentCardRequest(request)?'Urgente':'Normale'}/><Info label="Montant" value={`${request.amount} ${request.currency||'USD'}`}/><Info label="Impression" value={request.printRequested?'Oui':'Non'}/><Info label="Identité" value={isUrgentCardRequest(request)?'Non requise':request.identityVerified?'Acceptée':'À vérifier'}/></div> }
function QueueButton({active,onClick,icon,label,urgent=false}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string;urgent?:boolean}) { return <button onClick={onClick} className={`px-2 py-2.5 rounded-xl text-[10px] sm:text-xs font-black flex items-center justify-center gap-1 ${active?(urgent?'bg-red-600 text-white':'bg-blue-950 text-white'):'bg-white border text-slate-500'}`}>{icon}{label}</button> }
function Info({label,value}:{label:string;value:string}) { return <div className="bg-slate-50 border rounded-xl p-3 min-w-0"><div className="text-[9px] uppercase font-black text-slate-400">{label}</div><div className="text-xs sm:text-sm font-bold text-slate-800 break-words mt-0.5">{value}</div></div> }
function Status({status}:{status:CardPurchaseRequest['status']}) { const c=status==='pending'?'bg-amber-50 text-amber-800':status==='approved'?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'; return <span className={`shrink-0 px-2 py-1 rounded-lg text-[9px] font-black ${c}`}>{status==='pending'?'EN ATTENTE':status==='approved'?'APPROUVÉE':'REJETÉE'}</span> }
function DeliveryStatus({status}:{status:PhysicalCardRequest['status']}) { const c=status==='delivered'?'bg-emerald-50 text-emerald-700':status==='cancelled'?'bg-red-50 text-red-700':'bg-blue-50 text-blue-700'; return <span className={`inline-block shrink-0 px-2 py-1 rounded-lg text-[9px] font-black ${c}`}>{status.replaceAll('_',' ').toUpperCase()}</span> }
function Empty({text}:{text:string}) { return <div className="p-10 text-center bg-white border rounded-2xl text-slate-400 text-sm font-bold">{text}</div> }
