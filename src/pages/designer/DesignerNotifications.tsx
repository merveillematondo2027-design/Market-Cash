import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Notification } from '../../types';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { Bell, Check, Trash2, CheckCircle2 } from 'lucide-react';

export default function DesignerNotifications() {
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', 'in', [user.uid, 'designer_graphique', 'all'])
    );

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as Notification))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      
      setNotifications(docs);
      setLoading(false);
    }, (err) => {
      console.error('[DESIGNER_NOTIFICATIONS_ERR]', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
      toast.success('Notification supprimée');
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de la suppression');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <Bell className="text-amber-500" />
          Alertes & Notifications Tirage PVC
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Nouvelles cartes transmises par les agences pour impression.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Chargement...</div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200/80 shadow-sm space-y-2">
          <CheckCircle2 size={36} className="mx-auto text-emerald-400" />
          <h3 className="font-bold text-slate-700 text-sm">Toutes les alertes sont traitées</h3>
          <p className="text-xs text-slate-400">Aucune nouvelle commande en attente d'impression.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                n.read 
                  ? 'bg-white border-slate-200/80 text-slate-600' 
                  : 'bg-amber-50/70 border-amber-200 text-slate-900 shadow-xs'
              }`}
            >
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-sm text-slate-800">{n.title}</h3>
                  {!n.read && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                  )}
                </div>
                <p className="text-xs text-slate-600">{n.message}</p>
                <div className="text-[10px] text-slate-400 font-medium">
                  {n.createdAt ? new Date(n.createdAt).toLocaleDateString('fr-FR', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                  }) : ''}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!n.read && (
                  <button
                    onClick={() => handleMarkAsRead(n.id)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                    title="Marquer comme lue"
                  >
                    <Check size={16} />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(n.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 transition-colors"
                  title="Supprimer"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
