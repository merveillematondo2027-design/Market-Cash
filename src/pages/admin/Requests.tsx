import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase/config';
import { CardPurchaseRequest, PhysicalCardRequest } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { cardService } from '../../services/cardService';
import toast from 'react-hot-toast';
import { Clock, CreditCard, Eye, History, Truck, X } from 'lucide-react';

const MAX_NOTIFICATION_MESSAGE_LENGTH = 2000;
const rejectionMessage = (cardName: string, reason: string) => `Votre demande pour la carte ${cardName} n'a pas pu être validée. Motif : ${reason}`;

export default function AdminRequests() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'purchases' | 'deliveries'>('purchases');
  const [viewMode, setViewMode] = useState<'pending' | 'history'>('pending');
  const [requests, setRequests] = useState<CardPurchaseRequest[]>([]);
  const [deliveryRequests, setDeliveryRequests] = useState<PhysicalCardRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<CardPurchaseRequest | null>(null);
  const [selectedDelivery, setSelectedDelivery] = useState<PhysicalCardRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribePurchases = onSnapshot(query(collection(db, 'card_purchase_requests')), snap => {
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as CardPurchaseRequest)).sort((a, b) => {
        const aUrgent = Boolean(a.urgentProcessing || a.isUrgent);
        const bUrgent = Boolean(b.urgentProcessing || b.isUrgent);
        if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      setRequests(list);
      setLoading(false);
    }, error => {
      console.error('[ADMIN_PURCHASES_ERROR]', error);
      setLoading(false);
    });

    const unsubscribeDeliveries = onSnapshot(query(collection(db, 'physical_card_requests')), snap => {
      setDeliveryRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as PhysicalCardRequest)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)));
    }, error => console.error('[ADMIN_DELIVERIES_ERROR]', error));

    return () => {
      unsubscribePurchases();
      unsubscribeDeliveries();
    };
  }, []);

  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'pending'), [requests]);
  const historyRequests = useMemo(() => requests.filter(r => r.status !== 'pending'), [requests]);
  const visibleRequests = viewMode === 'pending' ? pendingRequests : historyRequests;

  const pendingDeliveries = useMemo(() => deliveryRequests.filter(d => !['delivered','cancelled'].includes(d.status)), [deliveryRequests]);
  const historyDeliveries = useMemo(() => deliveryRequests.filter(d => ['delivered','cancelled'].includes(d.status)), [deliveryRequests]);
  const visibleDeliveries = viewMode === 'pending' ? pendingDeliveries : historyDeliveries;

  const openUser = (userId?: string) => {
    if (userId) navigate(`/admin/users?uid=${encodeURIComponent(userId)}`);
  };

  const closeRequest = () => {
    if (isProcessing) return;
    setActionType(null);
    setRejectionReason('');
    setSelectedRequest(null);
  };

  const handleApprove = async () => {
    if (!selectedRequest || !user || isProcessing) return;
    const request = selectedRequest;
    setIsProcessing(true);
    try {
      const assigned = await cardService.approveRequestWithStock(request.id, 'virtual', { uid: user.uid, email: user.email! });
      try {
        await cardService.createNotification({
          userId: request.userId,
          title: 'Paiement vérifié & carte attribuée',
          message: `Votre paiement a été vérifié. Votre carte Market-Cash vous a été attribuée (ID: ${assigned.cardIdentifier}).`,
          type: 'success',
          requestId: request.id,
          cardIdentifier: assigned.cardIdentifier
        });
      } catch (notificationError) {
        console.warn('[APPROVAL_NOTIFICATION_WARNING]', notificationError);
      }

      // Un seul chemin ferme la fenêtre après la transaction : évite les doubles démontages DOM.
      setActionType(null);
      setSelectedRequest(null);
      setRejectionReason('');
      toast.success(`Carte ${assigned.cardIdentifier} attribuée avec succès.`);
    } catch (error: any) {
      console.error('[APPROVE_REQUEST_ERROR]', error);
      const code = error?.message || error?.code;
      if (code === 'STOCK_EMPTY') toast.error('Stock épuisé : aucune carte disponible.');
      else if (code === 'IDENTITY_REQUIRED') toast.error("Pièce d'identité obligatoire avant l'approbation d'une demande normale.");
      else toast.error(`Attribution impossible${code ? ` : ${code}` : '.'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRequest || !user || isProcessing) return;
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
        processedBy: user.email,
        updatedAt: Date.now()
      });
      try {
        await cardService.createNotification({
          userId: request.userId,
          title: `Demande refusée : ${cardName}`,
          message,
          type: 'error',
          requestId: request.id,
          cardName
        });
      } catch (notificationError) {
        console.warn('[REJECT_NOTIFICATION_WARNING]', notificationError);
      }
      setActionType(null);
      setSelectedRequest(null);
      setRejectionReason('');
      toast.success('Demande rejetée et déplacée dans l’historique.');
    } catch (error) {
      console.error('[REJECT_REQUEST_ERROR]', error);
      toast.error('Erreur lors du rejet.');
    } finally { setIsProcessing(false); }
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

  const pendingCount = activeTab === 'purchases' ? pendingRequests.length : pendingDeliveries.length;
  const historyCount = activeTab === 'purchases' ? historyRequests.length : historyDeliveries.length;

  return <div className="max-w-6xl mx-auto space-y-4 pb-24 px-1 sm:px-0">
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
      <h1 className="text-lg sm:text-xl font-black text-blue-950">Demandes & opérations</h1>
      <p className="text-xs sm:text-sm text-blue-700 mt-1">Les demandes traitées quittent automatiquement la file « À traiter ».</p>
    </div>

    <div className="grid grid-cols-2 gap-2 bg-white border border-slate-200 rounded-2xl p-1.5">
      <button onClick={()=>setActiveTab('purchases')} className={`rounded-xl px-2 py-2.5 text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 ${activeTab==='purchases'?'bg-blue-950 text-white':'text-slate-500'}`}><CreditCard size={15}/>Cartes <span className="opacity-70">({pendingRequests.length})</span></button>
      <button onClick={()=>setActiveTab('deliveries')} className={`rounded-xl px-2 py-2.5 text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 ${activeTab==='deliveries'?'bg-blue-950 text-white':'text-slate-500'}`}><Truck size={15}/>Livraisons <span className="opacity-70">({pendingDeliveries.length})</span></button>
    </div>

    <div className="grid grid-cols-2 gap-2 sm:flex">
      <button onClick={()=>setViewMode('pending')} className={`px-3 py-2.5 rounded-xl text-xs font-black ${viewMode==='pending'?'bg-amber-400 text-blue-950':'bg-white border text-slate-500'}`}><Clock size={14} className="inline mr-1"/>À traiter ({pendingCount})</button>
      <button onClick={()=>setViewMode('history')} className={`px-3 py-2.5 rounded-xl text-xs font-black ${viewMode==='history'?'bg-blue-950 text-white':'bg-white border text-slate-500'}`}><History size={14} className="inline mr-1"/>Historique ({historyCount})</button>
    </div>

    {activeTab === 'purchases' ? <>
      <div className="sm:hidden space-y-2.5">
        {visibleRequests.map(req => <PurchaseCard key={req.id} req={req} onUser={()=>openUser(req.userId)} onView={()=>{setSelectedRequest(req);setActionType(null)}} onApprove={()=>{setSelectedRequest(req);setActionType('approve')}}/>)}
        {!visibleRequests.length && <Empty text={viewMode==='pending'?'Aucune demande à traiter.':'Aucune demande dans l’historique.'}/>} 
      </div>
      <div className="hidden sm:block bg-white rounded-2xl border overflow-hidden"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500 uppercase"><tr><th className="p-3">Date</th><th className="p-3">Client</th><th className="p-3">Commande</th><th className="p-3">Montant</th><th className="p-3">Statut</th><th className="p-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleRequests.map(req=><tr key={req.id}><td className="p-3">{new Date(req.createdAt).toLocaleDateString('fr-FR')}</td><td className="p-3"><button onClick={()=>openUser(req.userId)} className="font-black text-blue-700 hover:underline">{req.userName||req.fullName||'Client'}</button><div className="text-[10px] text-slate-400">{req.userEmail||'—'} · {req.phone||req.userPhone||'—'}</div></td><td className="p-3"><div className="font-bold">{requestLabel(req)}</div><div className="text-[10px] text-slate-400">{req.urgentProcessing||req.isUrgent?'Urgence · ':''}{req.printRequested?'Impression physique':'Carte numérique'}</div></td><td className="p-3 font-black">{req.amount} {req.currency||'USD'}</td><td className="p-3"><Status status={req.status}/></td><td className="p-3 text-right"><button onClick={()=>{setSelectedRequest(req);setActionType(null)}} className="p-2 bg-blue-50 text-blue-700 rounded-lg mr-2"><Eye size={15}/></button>{req.status==='pending'&&<button onClick={()=>{setSelectedRequest(req);setActionType('approve')}} className="px-3 py-2 bg-emerald-600 text-white rounded-lg font-black">Approuver</button>}</td></tr>)}</tbody></table></div>
    </> : <>
      <div className="sm:hidden space-y-2.5">{visibleDeliveries.map(d=><DeliveryCard key={d.id} delivery={d} onUser={()=>openUser(d.userId)} onView={()=>setSelectedDelivery(d)}/>)}{!visibleDeliveries.length&&<Empty text={viewMode==='pending'?'Aucune livraison active.':'Aucune livraison terminée.'}/>}</div>
      <div className="hidden sm:block bg-white rounded-2xl border overflow-hidden"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500 uppercase"><tr><th className="p-3">Date</th><th className="p-3">Client</th><th className="p-3">Carte</th><th className="p-3">Adresse</th><th className="p-3">Statut</th><th className="p-3 text-right">Action</th></tr></thead><tbody>{visibleDeliveries.map(d=><tr key={d.id} className="border-t"><td className="p-3">{new Date(d.createdAt).toLocaleDateString('fr-FR')}</td><td className="p-3"><button onClick={()=>openUser(d.userId)} className="font-black text-blue-700 hover:underline">{d.userName||d.clientName||'Client'}</button></td><td className="p-3 font-bold">{d.cardIdentifier||d.cardName||d.cardId}</td><td className="p-3 max-w-xs truncate">{d.deliveryAddress}</td><td className="p-3"><DeliveryStatus status={d.status}/></td><td className="p-3 text-right"><button onClick={()=>setSelectedDelivery(d)} className="p-2 bg-blue-50 text-blue-700 rounded-lg"><Eye size={15}/></button></td></tr>)}</tbody></table></div>
    </>}

    {selectedRequest && <div className="fixed inset-0 z-50 bg-slate-950/70 p-2 sm:p-4 flex items-center justify-center" onMouseDown={e=>{if(e.target===e.currentTarget)closeRequest()}}><div className="w-full max-w-lg max-h-[94vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">
      <div className="p-4 border-b flex items-start justify-between gap-3"><div><h2 className="font-black text-lg text-blue-950">{actionType==='approve'?'Approbation & attribution':actionType==='reject'?'Rejeter la demande':'Détail de la demande'}</h2><button onClick={()=>openUser(selectedRequest.userId)} className="text-xs font-black text-blue-700 hover:underline">{selectedRequest.userName||selectedRequest.fullName||selectedRequest.userEmail||'Client'}</button></div><button disabled={isProcessing} onClick={closeRequest} className="p-2 rounded-full bg-slate-100 disabled:opacity-40"><X size={17}/></button></div>
      <div className="p-4 overflow-y-auto space-y-3">
        <Summary request={selectedRequest}/>
        {actionType === null && <><Proofs request={selectedRequest}/>{selectedRequest.status==='pending'&&<div className="grid grid-cols-2 gap-2"><button onClick={()=>setActionType('reject')} className="py-3 rounded-xl bg-red-50 text-red-700 font-black">Rejeter</button><button onClick={()=>setActionType('approve')} className="py-3 rounded-xl bg-emerald-600 text-white font-black">Approuver</button></div>}</>}
        {actionType === 'approve' && <><div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-900">Confirmez uniquement après vérification du paiement. Une carte disponible sera attribuée automatiquement.{selectedRequest.printRequested?' La même carte rejoindra ensuite le flux d’impression PVC.':''}</div><div className="grid grid-cols-2 gap-2"><button disabled={isProcessing} onClick={()=>setActionType(null)} className="py-3 rounded-xl bg-slate-100 text-slate-600 font-black">Retour</button><button disabled={isProcessing} onClick={handleApprove} className="py-3 rounded-xl bg-emerald-600 text-white font-black disabled:opacity-50">{isProcessing?'Attribution...':'Confirmer'}</button></div></>}
        {actionType === 'reject' && <form onSubmit={handleReject} className="space-y-3"><textarea required value={rejectionReason} onChange={e=>setRejectionReason(e.target.value)} placeholder="Motif du rejet" className="w-full min-h-28 p-3 rounded-xl border resize-none"/><div className="grid grid-cols-2 gap-2"><button type="button" disabled={isProcessing} onClick={()=>setActionType(null)} className="py-3 rounded-xl bg-slate-100 font-black">Retour</button><button disabled={isProcessing} className="py-3 rounded-xl bg-red-600 text-white font-black">Confirmer rejet</button></div></form>}
      </div>
    </div></div>}

    {selectedDelivery && <div className="fixed inset-0 z-50 bg-slate-950/70 p-2 flex items-center justify-center" onMouseDown={e=>{if(e.target===e.currentTarget&&!isProcessing)setSelectedDelivery(null)}}><div className="w-full max-w-lg max-h-[94vh] bg-white rounded-3xl overflow-hidden flex flex-col"><div className="p-4 border-b flex justify-between"><div><h2 className="font-black text-lg">Livraison</h2><button onClick={()=>openUser(selectedDelivery.userId)} className="text-xs text-blue-700 font-black">{selectedDelivery.userName||selectedDelivery.clientName||'Client'}</button></div><button disabled={isProcessing} onClick={()=>setSelectedDelivery(null)} className="p-2 rounded-full bg-slate-100"><X size={17}/></button></div><div className="p-4 overflow-y-auto space-y-3"><Info label="Carte" value={selectedDelivery.cardIdentifier||selectedDelivery.cardNumberMasked||selectedDelivery.cardId}/><Info label="Date souhaitée" value={selectedDelivery.deliveryDate}/><Info label="Adresse" value={selectedDelivery.deliveryAddress}/><Info label="WhatsApp" value={selectedDelivery.whatsapp||selectedDelivery.whatsappNumber||selectedDelivery.userPhone||'—'}/><div className="grid grid-cols-3 gap-2"><button disabled={isProcessing} onClick={()=>void updateDelivery(selectedDelivery.id,'out_for_delivery')} className="py-2.5 rounded-xl bg-blue-600 text-white text-[10px] font-black">En route</button><button disabled={isProcessing} onClick={()=>void updateDelivery(selectedDelivery.id,'delivered')} className="py-2.5 rounded-xl bg-emerald-600 text-white text-[10px] font-black">Livrée</button><button disabled={isProcessing} onClick={()=>void updateDelivery(selectedDelivery.id,'cancelled')} className="py-2.5 rounded-xl bg-red-50 text-red-700 text-[10px] font-black">Annuler</button></div></div></div></div>}
  </div>;
}

function requestLabel(request: CardPurchaseRequest) {
  if (request.cardName) return request.cardName;
  return `Carte Market-Cash${request.printRequested?' + impression':''}`;
}

function PurchaseCard({req,onUser,onView,onApprove}:{req:CardPurchaseRequest,onUser:()=>void,onView:()=>void,onApprove:()=>void}) {
  return <div className="bg-white border rounded-2xl p-4 shadow-sm space-y-3"><div className="flex justify-between gap-2"><div className="min-w-0"><button onClick={onUser} className="font-black text-blue-800 text-sm text-left break-words hover:underline">{req.userName||req.fullName||'Client'}</button><div className="text-[10px] text-slate-400 mt-0.5">{new Date(req.createdAt).toLocaleString('fr-FR')}</div></div><Status status={req.status}/></div><div className="grid grid-cols-2 gap-2 text-xs"><Info label="Commande" value={requestLabel(req)}/><Info label="Montant" value={`${req.amount} ${req.currency||'USD'}`}/><Info label="Traitement" value={req.urgentProcessing||req.isUrgent?'Urgent':'Normal'}/><Info label="Impression" value={req.printRequested?'Oui':'Non'}/></div><div className="grid grid-cols-2 gap-2"><button onClick={onView} className="py-2.5 rounded-xl bg-blue-50 text-blue-800 font-black text-xs">Voir</button>{req.status==='pending'?<button onClick={onApprove} className="py-2.5 rounded-xl bg-emerald-600 text-white font-black text-xs">Approuver</button>:<button onClick={onView} className="py-2.5 rounded-xl bg-slate-100 text-slate-600 font-black text-xs">Détails</button>}</div></div>;
}

function DeliveryCard({delivery,onUser,onView}:{delivery:PhysicalCardRequest,onUser:()=>void,onView:()=>void}) {
  return <div className="bg-white border rounded-2xl p-4 shadow-sm space-y-2"><div className="flex justify-between gap-2"><button onClick={onUser} className="font-black text-blue-800 text-left">{delivery.userName||delivery.clientName||'Client'}</button><DeliveryStatus status={delivery.status}/></div><div className="text-xs text-slate-600"><strong>{delivery.cardIdentifier||delivery.cardName||delivery.cardId}</strong><br/>{delivery.deliveryAddress}</div><button onClick={onView} className="w-full py-2.5 rounded-xl bg-blue-50 text-blue-800 font-black text-xs">Gérer la livraison</button></div>;
}

function Summary({request}:{request:CardPurchaseRequest}) { return <div className="grid grid-cols-2 gap-2"><Info label="Client" value={request.userName||request.fullName||request.userEmail||'—'}/><Info label="Montant" value={`${request.amount} ${request.currency||'USD'}`}/><Info label="Commande" value={requestLabel(request)}/><Info label="Statut" value={request.status}/><Info label="Paiement" value={request.paymentMethod||'—'}/><Info label="Référence" value={request.transactionReference||request.paymentReference||'—'}/></div> }
function Proofs({request}:{request:CardPurchaseRequest}) { return <div className="space-y-2">{(request.proofUrl||request.paymentProofUrl)?<a href={request.proofUrl||request.paymentProofUrl} target="_blank" rel="noreferrer" className="block p-3 rounded-xl bg-blue-50 text-blue-700 font-black text-xs">Voir la preuve de paiement</a>:<div className="p-3 rounded-xl bg-red-50 text-red-700 font-bold text-xs">Preuve de paiement absente</div>}{request.identityRequired&&!request.urgentProcessing&&(request.identityProofUrl?<a href={request.identityProofUrl} target="_blank" rel="noreferrer" className="block p-3 rounded-xl bg-amber-50 text-amber-800 font-black text-xs">Voir la pièce d’identité</a>:<div className="p-3 rounded-xl bg-red-50 text-red-700 font-bold text-xs">Pièce d’identité obligatoire manquante</div>)}</div> }
function Info({label,value}:{label:string,value:string}) { return <div className="bg-slate-50 border rounded-xl p-3 min-w-0"><div className="text-[9px] uppercase font-black text-slate-400">{label}</div><div className="text-xs sm:text-sm font-bold text-slate-800 break-words mt-0.5">{value}</div></div> }
function Status({status}:{status:CardPurchaseRequest['status']}) { const c=status==='pending'?'bg-amber-50 text-amber-800':status==='approved'?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'; return <span className={`shrink-0 px-2 py-1 rounded-lg text-[9px] font-black ${c}`}>{status==='pending'?'EN ATTENTE':status==='approved'?'APPROUVÉE':'REJETÉE'}</span> }
function DeliveryStatus({status}:{status:PhysicalCardRequest['status']}) { const c=status==='delivered'?'bg-emerald-50 text-emerald-700':status==='cancelled'?'bg-red-50 text-red-700':'bg-blue-50 text-blue-700'; return <span className={`shrink-0 px-2 py-1 rounded-lg text-[9px] font-black ${c}`}>{status.replaceAll('_',' ').toUpperCase()}</span> }
function Empty({text}:{text:string}) { return <div className="p-10 text-center bg-white border rounded-2xl text-slate-400 text-sm font-bold">{text}</div> }
