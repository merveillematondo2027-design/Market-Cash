import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { PhysicalCardRequest } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { CheckCircle2, Clock, MapPin, Calendar, Truck, AlertCircle, XCircle } from 'lucide-react';

export default function DeliveryHistory() {
  const { user } = useAuthStore();
  const [deliveries, setDeliveries] = useState<PhysicalCardRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'physical_card_requests'),
      where('assignedLivreurId', '==', user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as PhysicalCardRequest))
        .filter(d => d.status === 'delivered' || d.status === 'cancelled' || d.status === 'reported')
        .sort((a, b) => (b.deliveredAt || b.updatedAt || 0) - (a.deliveredAt || a.updatedAt || 0));
      
      setDeliveries(docs);
      setLoading(false);
    }, (err) => {
      console.error('[DELIVERY_HISTORY_ERR]', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid]);

  const deliveredCount = deliveries.filter(d => d.status === 'delivered').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <CheckCircle2 className="text-emerald-600" />
          Historique des Livraisons ({deliveredCount} effectuées)
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Consultez l'historique complet de vos courses réalisées et vos rapports de remise.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Chargement...</div>
      ) : deliveries.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200/80 shadow-sm space-y-2">
          <Truck size={36} className="mx-auto text-slate-300" />
          <h3 className="font-bold text-slate-700 text-sm">Aucun historique pour le moment</h3>
          <p className="text-xs text-slate-400">Vos courses terminées s'afficheront ici.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {deliveries.map((del) => (
            <div
              key={del.id}
              className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-black text-sm text-slate-800">{del.clientName || 'Client'}</h3>
                  <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold">
                    {del.cardIdentifier || 'MC-001'}
                  </span>
                </div>
                <span className={`text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider ${
                  del.status === 'delivered' ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' :
                  del.status === 'reported' ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                  'bg-red-100 text-red-900 border border-red-200'
                }`}>
                  {del.status === 'delivered' ? 'Livrée' :
                   del.status === 'reported' ? 'Reportée' : 'Annulée'}
                </span>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-1 text-slate-600">
                <div className="flex items-start gap-1.5">
                  <MapPin size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span>{del.deliveryAddress}</span>
                </div>
                {del.deliveredAt && (
                  <div className="flex items-center gap-1.5 text-emerald-800 font-medium">
                    <CheckCircle2 size={13} />
                    <span>Livrée le : {new Date(del.deliveredAt).toLocaleDateString('fr-FR', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}</span>
                  </div>
                )}
                {del.deliveryReport && (
                  <div className="pt-1 text-slate-700 font-medium border-t border-slate-200/60">
                    Rapport : "{del.deliveryReport}"
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
