import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Notification, User } from '../../types';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { firestoreErrorMessage, firestoreNetwork } from '../../lib/firestoreNetwork';

const MAX_NOTIFICATION_TITLE_LENGTH = 200;
const MAX_NOTIFICATION_MESSAGE_LENGTH = 2000;

export default function AdminNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  const [formData, setFormData] = useState<Partial<Notification>>({
    userId: '', title: '', message: '', type: 'info'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
      const snap = await firestoreNetwork.guard('admin.notifications.list', () => getDocs(q));
      setNotifications(snap.docs.map(d => ({ ...d.data(), id: d.id } as Notification)));

      const usersSnap = await firestoreNetwork.guard('admin.notifications.users', () => getDocs(collection(db, 'users')));
      setUsers(usersSnap.docs.map(d => d.data() as User));
    } catch (error) {
      firestoreNetwork.reportFailure('admin.notifications.load', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = formData.title?.trim() || '';
    const message = formData.message?.trim() || '';

    if (!title || !message) {
      toast.error('Le titre et le message sont obligatoires.');
      return;
    }

    if (title.length > MAX_NOTIFICATION_TITLE_LENGTH) {
      toast.error(`Le titre ne peut pas dépasser ${MAX_NOTIFICATION_TITLE_LENGTH} caractères.`);
      return;
    }

    if (message.length > MAX_NOTIFICATION_MESSAGE_LENGTH) {
      toast.error(`Le message ne peut pas dépasser ${MAX_NOTIFICATION_MESSAGE_LENGTH} caractères.`);
      return;
    }

    try {
      const id = doc(collection(db, 'notifications')).id;
      const notification: Notification = {
        ...formData,
        id,
        title,
        message,
        read: false,
        createdAt: Date.now(),
      } as Notification;

      await firestoreNetwork.guard('admin.notifications.create', () => setDoc(doc(db, 'notifications', id), notification));
      toast.success('Notification envoyée');
      setShowModal(false);
      loadData();
    } catch (error) {
      toast.error(firestoreErrorMessage(error, "Erreur lors de l'envoi"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette notification ?')) return;
    try {
      await firestoreNetwork.guard('admin.notifications.delete', () => deleteDoc(doc(db, 'notifications', id)));
      toast.success('Notification supprimée');
      loadData();
    } catch (error) {
      toast.error(firestoreErrorMessage(error, 'Erreur lors de la suppression'));
    }
  };

  const openNew = () => {
    setFormData({ userId: users[0]?.uid || '', title: '', message: '', type: 'info' });
    setShowModal(true);
  };

  if (loading) return <div>Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">Notifications</h1>
        <button onClick={openNew} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 hover:bg-blue-700 transition">
          <Plus size={20} />
          <span>Envoyer une notification</span>
        </button>
      </div>
      
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-800 border-b border-slate-200">
              <tr>
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Client</th>
                <th className="p-4 font-medium">Titre</th>
                <th className="p-4 font-medium">Statut</th>
                <th className="p-4 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {notifications.map(notif => {
                const user = users.find(u => u.uid === notif.userId);
                return (
                  <tr key={notif.id} className="hover:bg-slate-50">
                    <td className="p-4">{new Date(notif.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td className="p-4 font-medium text-slate-800">{user?.displayName || notif.userId}</td>
                    <td className="p-4">
                      <div className="font-bold text-slate-800">{notif.title}</div>
                      <div className="text-xs truncate max-w-xs">{notif.message}</div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${notif.read ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-800'}`}>
                        {notif.read ? 'Lue' : 'Non lue'}
                      </span>
                    </td>
                    <td className="p-4">
                      <button onClick={() => handleDelete(notif.id)} className="p-2 text-red-600 hover:bg-red-50 rounded"><Trash2 size={18}/></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-[100] flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="bg-white rounded-2xl w-full max-w-lg p-6">
            <h3 className="font-bold text-xl mb-4">Envoyer une notification</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Client</label>
                <select required value={formData.userId} onChange={e => setFormData({...formData, userId: e.target.value})} className="w-full p-2 border rounded-lg">
                  {users.map(u => (
                    <option key={u.uid} value={u.uid}>{u.displayName} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select required value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as any})} className="w-full p-2 border rounded-lg">
                  <option value="info">Information</option>
                  <option value="success">Succès</option>
                  <option value="error">Erreur</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Titre</label>
                <input required type="text" maxLength={MAX_NOTIFICATION_TITLE_LENGTH} value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-2 border rounded-lg" />
                <p className="mt-1 text-xs text-slate-500">{formData.title?.length || 0}/{MAX_NOTIFICATION_TITLE_LENGTH} caractères</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Message</label>
                <textarea required maxLength={MAX_NOTIFICATION_MESSAGE_LENGTH} value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} className="w-full p-2 border rounded-lg h-24" />
                <p className="mt-1 text-xs text-slate-500">{formData.message?.length || 0}/{MAX_NOTIFICATION_MESSAGE_LENGTH} caractères maximum</p>
              </div>
            </div>
            <div className="flex space-x-4 mt-8">
              <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2 bg-slate-100 rounded-lg">Annuler</button>
              <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg">Envoyer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
