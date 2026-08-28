import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase/config';
import { CardPurchaseRequest, PhysicalCardRequest } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { cardService } from '../../services/cardService';
import toast from 'react-hot-toast';
import {
  AlertCircle, CheckCircle2, Clock, CreditCard, Eye, FileText, History,
  MapPin, Phone, Truck, User as UserIcon, X, XCircle
} from 'lucide-react';

const MAX_NOTIFICATION_MESSAGE_LENGTH = 2000;
const rejectionMessage = (cardName: string, reason: string) => `Votre demande pour la carte ${cardName} n'a pas pu être validée. Motif : ${reason}`;

export default function AdminRequests() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'purchases'|'deliveries'>('purchases');
  const [viewMode, setViewMode] = useState<'pending'|'history'>('pending');
  const [requests, setRequests] = useState<CardPurchaseRequest[]>([]);
  const [deliveryRequests, setDeliveryRequests] = useState<PhysicalCardRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<CardPurchaseRequest|null>(null);
  const [selectedDelivery, setSelectedDelivery] = useState<PhysicalCardRequest|null>(null);
  const [actionType, setActionType] = useState<'approve'|'reject'|null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubPurchases = onSnapshot(query(collection(db, 'card_purchase_requests')), snap => {
      setRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as CardPurchaseRequest)).sort((a,b) => {
        const au = Boolean(a.urgentProcessing || a.isUrgent), bu = Boolean(b.urgentProcessing || b.isUrgent);
        if (au !== bu) return au ? -1 : 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      }));
      setLoading(false);
    }, err => { console.error('[ADMIN_PURCHASES_ERROR]', err); setLoading(false); });

    const unsubDeliveries = onSnapshot(query(collection(db, 'physical_card_requests')), snap => {
      setDeliveryRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as PhysicalCardRequest)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)));
    }, err => console.error('[ADMIN_DELIVERIES_ERROR]', err));

    return () => { unsubPurchases(); unsubDeliveries(); };
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
    const req = selectedRequest;
    setIsProcessing(true);
    try {
      const assigned = await cardService.approveRequestWithStock(req.id, 'virtual', { uid: user.uid, email: user.email! });
      try {
        await cardService.createNotification({
          userId: req.userId,
          title: 'Paiement vérifié & carte attribuée',
          message: `Votre paiement a été vérifié. Votre carte Market-Cash vous a été attribuée (ID: ${assigned.cardIdentifier}).`,
          type: 'success', requestId: req.id, cardIdentifier: assigned.cardIdentifier
        });
      } catch (notificationError) {
        console.warn('[APPROVAL_NOTIFICATION_WARNING]', notificationError);
      }
      // Close the dialog exactly once after the transaction has completed.
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

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest || !user || isProcessing) return;
    const req = selectedRequest;
    const reason = rejectionReason.trim();
    if (!reason) return toast.error('Raison du rejet obligatoire.');
    const cardName = req.cardName || 'Market-Cash';
    const message = rejectionMessage(cardName, reason);
    if (message.length > MAX_NOTIFICATION_MESSAGE_LENGTH) return toast.error('Motif trop long.');
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'card_purchase_requests', req.id), {
        status: 'rejected', rejectionReason: reason, processedAt: Date.now(), processedBy: user.email, updatedAt: Date.now()
      });
      try {
        await cardService.createNotification({ userId:req.userId, title:`Demande refusée : ${cardName}`, message, type:'error', requestId:req.id, cardName });
      } catch (notificationError) { console.warn('[REJECT_NOTIFICATION_WARNING]', notificationError); }
      setActionType(null); setSelectedRequest(null); setRejectionReason('');
      toast.success('Demande rejetée et déplacée dans l’historique.');
    } catch (error) {
      console.error('[REJECT_REQUEST_ERROR]', error);
      toast.error('Erreur lors du rejet.');
    } finally { setIsProcessing(false); }
  };

  const updateDelivery = async (deliveryId:string, status:PhysicalCardRequest['status']) => {
    if (!user || isProcessing) return;
    setIsProcessing(true);
    try {
      await cardService.updateDeliveryStatus(deliveryId, status as any, { email:user.email, uid:user.uid, role:user.role });
      setSelectedDelivery(null);
      toast.success('Statut de livraison mis à jour.');
    } catch (error) {
      console.error('[DELIVERY_STATUS_ERROR]', error); toast.error('Mise à jour impossible.');
    } finally { setIsProcessing(false); }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 font-bold">Chargement des demandes...</div>;

  const pendingCount = activeTab === 'purchases' ? pendingRequests.length : pendingDeliveries.length;
  const historyCount = activeTab === 'purchases' ? historyRequests.length : historyDeliveries.length;

  return <div className="max-w-6xl mx-auto space-y-4 pb-24 px-1 sm:px-0">
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
      <h1 className="text-lg sm:text-xl font-black text-blue-950">Demandes & opérations</h1>
      <p className="text-xs sm:text-sm text-blue-700 mt-1">Une approbation réserve puis attribue une carte disponible du stock unique.</p>
    </div>

    <div className="grid grid-cols-2 gap-2 bg-white border border-slate-200 rounded-2xl p-1.5">
      <button onClick={()=>setActiveTab('purchases')} className={`rounded-xl px-3 py-2.5 text-xs sm:text-sm font-black flex items-center justify-center gap-2 ${activeTab==='purchases'?'bg-blue-950 text-white':'text-slate-500'}`}><CreditCard size={16}/>Cartes <span className="opacity-70">({pendingRequests.length})</span></button>
      <button onClick={()=>setActiveTab('deliveries')} className={`rounded-xl px-3 py-2.5 text-xs sm:text-sm font-black flex items-center justify-center gap-2 ${activeTab==='deliveries'?'bg-blue-950 text-white':'text-slate-500'}`}><Truck size={16}/>Livraisons <span className="opacity-70">({pendingDeliveries.length})</span></button>
    </div>

    <div className="flex gap-2">
      <button onClick={()=>setViewMode('pending')} className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-black ${viewMode==='pending'?'bg-amber-400 text-blue-950':'bg-white border text-slate-500'}`}><Clock size={14} className="inline mr-1.5"/>À traiter ({pendingCount})</button>
      <button onClick={()=>setViewMode('history')} className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-black ${viewMode==='history'?'bg-blue-950 text-white':'bg-white border text-slate-500'}`}><History size={14} className="inline mr-1.5"/>Historique ({historyCount})</button>
    </div>

    {activeTab === 'purchases' ? <>
      <div className="sm:hidden space-y-3">
        {visibleRequests.map(req => <PurchaseCard key={req.id} req={req} onUser={openUser} onView={()=>{setSelectedRequest(req);setActionType(null)}} onApprove={()=>{setSelectedRequest(req);setActionType('approve')}} />)}
        {!visibleRequests.length && <Empty text={viewMode==='pending'?'Aucune demande à traiter.':'Aucune demande traitée.'}/>} 
      </div>
      <div className="hidden sm:block bg-white rounded-2xl border border-slate-200 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500 uppercase"><tr><th className="p-3">Date</th><th className="p-3">Client</th><th className="p-3">Commande</th><th className="p-3">Montant</th><th className="p-3">Statut</th><th className="p-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleRequests.map(req=><tr key={req.id} className="hover:bg-slate-50"><td className="p-3 whitespace-nowrap">{new Date(req.createdAt).toLocaleDateString('fr-FR')}</td><td className="p-3"><button onClick={()=>openUser(req.userId)} className="font-black text-blue-700 hover:underline">{req.userName||req.fullName||'Client'}</button><div className="text-[10px] text-slate-400">{req.userEmail||'—'} · {req.phone||req.userPhone||'—'}</div></td><td className="p-3"><div className="font-bold">{requestLabel(req)}</div><div className="text-[10px] text-slate-400">{req.urgentProcessing||req.isUrgent?'Urgence · ':''}{req.printRequested?'Impression physique':'Carte numérique'}</div></td><td className="p-3 font-black">{req.amount} {req.currency||'USD'}</td><td className="p-3"><Status status={req.status}/></td><td className="p-3"><div className="flex justify-end gap-2"><button onClick={()=>{setSelectedRequest(req);setActionType(null)}} className="p-2 rounded-lg bg-blue-50 text-blue-700"><Eye size={16}/></button>{req.status==='pending'&&<button onClick={()=>{setSelectedRequest(req);setActionType('approve')}} className="px-3 py-2 rounded-lg bg-emerald-600 text-white font-black">Approuver</button>}</div></td></tr>)}</tbody></table></div></div>
    </> : <>
      <div className="sm:hidden space-y-3">{visibleDeliveries.map(d=><DeliveryCard key={d.id} d={d} onUser={openUser} onView={()=>setSelectedDelivery(d)}/>)}{!visibleDeliveries.length&&<Empty text={viewMode==='pending'?'Aucune livraison active.':'Aucune livraison terminée.'}/>}</div>
      <div className="hidden sm:block bg-white rounded-2xl border border-slate-200 overflow-hidden"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500 uppercase"><tr><th className="p-3">Date</th><th className="p-3">Client</th><th className="p-3">Carte</th><th className="p-3">Adresse</th><th className="p-3">Statut</th><th className="p-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleDeliveries.map(d=><tr key={d.id}><td className="p-3">{new Date(d.createdAt).toLocaleDateString('fr-FR')}</td><td className="p-3"><button onClick={()=>openUser(d.userId)} className="font-black text-blue-700 hover:underline">{d.userName||d.clientName||'Client'}</button></td><td className="p-3 font-bold">{d.cardIdentifier||d.cardName||d.cardId}</td><td className="p-3 max-w-xs truncate">{d.deliveryAddress}</td><td className="p-3"><DeliveryStatusBadge status={d.status}/></td><td className="p-3 text-right"><button onClick={()=>setSelectedDelivery(d)} className="p-2 bg-blue-50 text-blue-700 rounded-lg"><Eye size={16}/></button></td></tr>)}</tbody></table></div>
    </>}

    {selectedRequest && <div className="fixed inset-0 z-50 bg-slate-950/70 p-3 flex items-center justify-center" onMouseDown={e=>{if(e.target===e.currentTarget&&!isProcessing)closeRequest()}}><div className="w-full max-w-lg max-h-[90vh] overflow-hidden bg-white rounded-3xl shadow-2xl flex flex-col"><div className="p-4 border-b flex items-center justify-between"><div><h3 className="font-black text-lg text-blue-950">{actionType==='approve'?'Approbation et attribution':actionType==='reject'?'Rejeter la demande':'Détail de la demande'}</h3><button onClick={()=>openUser(selectedRequest.userId)} className="text-xs text-blue-700 font-bold hover:underline">{selectedRequest.userName||selectedRequest.fullName||selectedRequest.userEmail}</button></div><button disabled={isProcessing} onClick={closeRequest} className="p-2 rounded-full bg-slate-100 disabled:opacity-40"><X size={17}/></button></div><div className="p-4 overflow-y-auto space-y-3">
      {actionType==='approve' ? <><div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-900">Vous allez confirmer le paiement. Une carte Market-Cash disponible sera réservée puis attribuée automatiquement au client.{selectedRequest.printRequested?' La même carte entrera ensuite dans le flux d’impression PVC.':''}</div><Summary req={selectedRequest}/><div className="grid grid-cols-2 gap-2"><button disabled={isProcessing} onClick={closeRequest} className="py-3 rounded-xl bg-slate-100 text-slate-600 font-black">Annuler</button><button disabled={isProcessing} onClick={handleApprove} className="py-3 rounded-xl bg-emerald-600 text-white font-black disabled:opacity-50">{isProcessing?'Attribution...':'Confirmer'}</button></div></> : actionType==='reject' ? <form onSubmit={handleReject} className="space-y-3"><Summary req={selectedRequest}/><textarea value={rejectionReason} onChange={e=>setRejectionReason(e.target.value)} placeholder="Motif du rejet" className="w-full min-h-28 p-3 rounded-xl border"/><button disabled={isProcessing} className="w-full py-3 rounded-xl bg-red-600 text-white font-black">{isProcessing?'Traitement...':'Confirmer le rejet'}</button></form> : <><Summary req={selectedRequest}/>{selectedRequest.proofUrl&&<a href={selectedRequest.proofUrl} target="_blank" rel="noreferrer" className="block py-2.5 text-center rounded-xl bg-blue-50 text-blue-700 font-black text-xs">Voir preuve de paiement</a>}{selectedRequest.identityProofUrl&&<a href={selectedRequest.identityProofUrl} target="_blank" rel="noreferrer" className="block py-2.5 text-center rounded-xl bg-slate-100 text-slate-700 font-black text-xs">Voir pièce d’identité</a>}{selectedRequest.status==='pending'&&<div className="grid grid-cols-2 gap-2"><button onClick={()=>setActionType('reject')} className="py-3 rounded-xl bg-red-50 text-red-700 font-black">Rejeter</button><button onClick={()=>setActionType('approve')} className="py-3 rounded-xl bg-emerald-600 text-white font-black">Approuver</button></div>}</>}
    </div></div></div>}

    {selectedDelivery && <div className="fixed inset-0 z-50 bg-slate-950/70 p-3 flex items-center justify-center" onMouseDown={e=>{if(e.target===e.currentTarget&&!isProcessing)setSelectedDelivery(null)}}><div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden"><div className="p-4 border-b flex justify-between"><div><div className="font-black text-blue-950">Détail livraison</div><button onClick={()=>openUser(selectedDelivery.userId)} className="text-xs text-blue-700 font-bold hover:underline">{selectedDelivery.userName||selectedDelivery.clientName||'Client'}</button></div><button onClick={()=>setSelectedDelivery(null)} className="p-2 rounded-full bg-slate-100"><X size={17}/></button></div><div className="p-4 space-y-3 text-sm"><InfoRow icon={<Truck/>} label="Carte" value={selectedDelivery.cardIdentifier||selectedDelivery.cardName||selectedDelivery.cardId}/><InfoRow icon={<MapPin/>} label="Adresse" value={selectedDelivery.deliveryAddress}/><InfoRow icon={<Phone/>} label="WhatsApp" value={selectedDelivery.whatsapp||selectedDelivery.whatsappNumber}/><InfoRow icon={<Clock/>} label="Date souhaitée" value={selectedDelivery.deliveryDate}/><DeliveryStatusBadge status={selectedDelivery.status}/>{!['delivered','cancelled'].includes(selectedDelivery.status)&&<div className="grid grid-cols-2 gap-2 pt-2"><button disabled={isProcessing} onClick={()=>updateDelivery(selectedDelivery.id,'out_for_delivery')} className="py-2.5 rounded-xl bg-blue-950 text-white font-black text-xs">En livraison</button><button disabled={isProcessing} onClick={()=>updateDelivery(selectedDelivery.id,'delivered')} className="py-2.5 rounded-xl bg-emerald-600 text-white font-black text-xs">Livrée</button></div>}</div></div></div>}
  </div>;
}

function requestLabel(req:CardPurchaseRequest){ if(req.cardName) return req.cardName; return `Carte Market-Cash${req.printRequested?' + impression':''}${req.urgentProcessing||req.isUrgent?' + urgence':''}`; }
function PurchaseCard({req,onUser,onView,onApprove}:{req:CardPurchaseRequest,onUser:(id?:string)=>void,onView:()=>void,onApprove:()=>void}){return <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><button onClick={()=>onUser(req.userId)} className="font-black text-blue-800 text-sm text-left hover:underline break-words">{req.userName||req.fullName||'Client'}</button><div className="text-[10px] text-slate-400 mt-0.5">{new Date(req.createdAt).toLocaleString('fr-FR')}</div></div><Status status={req.status}/></div><div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-black text-slate-900">{requestLabel(req)}</div><div className="text-[11px] text-slate-500 mt-1">{req.printRequested?'Impression physique · ':''}{req.urgentProcessing||req.isUrgent?'Traitement urgent':'Traitement normal'}</div><div className="text-lg font-black text-blue-950 mt-2">{req.amount} {req.currency||'USD'}</div></div><div className="flex gap-2"><button onClick={onView} className="flex-1 py-2.5 rounded-xl bg-blue-50 text-blue-700 font-black text-xs flex items-center justify-center gap-1.5"><Eye size={15}/>Voir</button>{req.status==='pending'&&<button onClick={onApprove} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center gap-1.5"><CheckCircle2 size={15}/>Approuver</button>}</div></div>}
function DeliveryCard({d,onUser,onView}:{d:PhysicalCardRequest,onUser:(id?:string)=>void,onView:()=>void}){return <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"><div className="flex justify-between gap-2"><div><button onClick={()=>onUser(d.userId)} className="font-black text-blue-800 text-sm hover:underline">{d.userName||d.clientName||'Client'}</button><div className="text-[10px] text-slate-400">{new Date(d.createdAt).toLocaleString('fr-FR')}</div></div><DeliveryStatusBadge status={d.status}/></div><div className="mt-3 text-xs text-slate-600"><b>{d.cardIdentifier||d.cardName||d.cardId}</b><div className="mt-1 line-clamp-2">{d.deliveryAddress}</div></div><button onClick={onView} className="w-full mt-3 py-2.5 rounded-xl bg-blue-50 text-blue-700 font-black text-xs">Voir la livraison</button></div>}
function Status({status}:{status:CardPurchaseRequest['status']}){const cls=status==='pending'?'bg-amber-50 text-amber-700 border-amber-200':status==='approved'?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-red-50 text-red-700 border-red-200';return <span className={`shrink-0 px-2 py-1 rounded-lg border text-[10px] font-black ${cls}`}>{status==='pending'?'EN ATTENTE':status==='approved'?'APPROUVÉE':'REJETÉE'}</span>}
function DeliveryStatusBadge({status}:{status:PhysicalCardRequest['status']}){return <span className="inline-flex w-fit px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black uppercase">{status.replaceAll('_',' ')}</span>}
function Summary({req}:{req:CardPurchaseRequest}){return <div className="grid grid-cols-2 gap-2 text-xs"><Small label="Commande" value={requestLabel(req)}/><Small label="Montant" value={`${req.amount} ${req.currency||'USD'}`}/><Small label="Paiement" value={req.paymentMethod}/><Small label="Référence" value={req.transactionReference||req.paymentReference||'—'}/><Small label="Identité" value={req.identityProofUrl?'Fournie':'Non fournie'}/><Small label="Statut" value={req.status}/></div>}
function Small({label,value}:{label:string,value?:string}){return <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-black uppercase text-slate-400">{label}</div><div className="font-bold text-slate-800 break-words mt-0.5">{value||'—'}</div></div>}
function InfoRow({icon,label,value}:{icon:React.ReactNode,label:string,value?:string}){return <div className="flex gap-3 bg-slate-50 rounded-xl p-3"><div className="text-blue-800 [&>svg]:w-4 [&>svg]:h-4">{icon}</div><div><div className="text-[9px] uppercase text-slate-400 font-black">{label}</div><div className="font-bold break-words">{value||'—'}</div></div></div>}
function Empty({text}:{text:string}){return <div className="p-10 text-center bg-white border border-slate-200 rounded-2xl text-slate-400"><FileText className="mx-auto mb-2"/><div className="font-bold text-sm">{text}</div></div>}
