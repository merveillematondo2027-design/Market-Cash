import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { User, UserRole } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { cleanFirestoreData } from '../../lib/firestoreUtils';
import toast from 'react-hot-toast';
import { 
  User as UserIcon, 
  Shield, 
  Building, 
  Printer, 
  Truck, 
  Edit3, 
  X,
  Search,
  Mail,
  Phone
} from 'lucide-react';

export default function AdminUsers() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit Role Modal
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('client');
  const [agencyName, setAgencyName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setUsers(snap.docs.map(d => d.data() as User));
    } catch (error) {
      console.error('[ADMIN_LOAD_USERS_ERROR]', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (targetUser: User) => {
    if (currentUser?.role !== 'admin_general') {
      toast.error('Seul un Administrateur Général peut modifier les rôles.');
      return;
    }
    setEditingUser(targetUser);
    setSelectedRole(targetUser.role || 'client');
    setAgencyName(targetUser.agencyName || targetUser.agencyId || '');
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || currentUser?.role !== 'admin_general') return;

    // Validation for roles that mandate an agency
    if ((selectedRole === 'chef_agence' || selectedRole === 'livreur') && !agencyName.trim()) {
      toast.error("L'agence est obligatoire pour un Chef d'Agence et un Livreur.");
      return;
    }

    setIsSaving(true);
    try {
      console.log(`[ROLE_UPDATE] uid=${editingUser.uid} oldRole=${editingUser.role} newRole=${selectedRole}`);

      const userRef = doc(db, 'users', editingUser.uid);
      
      const rawUpdates: Record<string, any> = {
        role: selectedRole,
        updatedAt: Date.now()
      };

      if (selectedRole === 'chef_agence' || selectedRole === 'livreur') {
        rawUpdates.agencyId = agencyName.trim();
        rawUpdates.agencyName = agencyName.trim();
      } else if (selectedRole === 'designer_graphique') {
        if (agencyName.trim()) {
          rawUpdates.agencyId = agencyName.trim();
          rawUpdates.agencyName = agencyName.trim();
        } else {
          rawUpdates.agencyId = deleteField();
          rawUpdates.agencyName = deleteField();
        }
      } else {
        // For client or admin_general, remove agency fields
        rawUpdates.agencyId = deleteField();
        rawUpdates.agencyName = deleteField();
      }

      await updateDoc(userRef, rawUpdates);

      toast.success(`Rôle de ${editingUser.displayName || editingUser.email} mis à jour : ${selectedRole}`);
      setEditingUser(null);
      loadUsers();
    } catch (err: any) {
      console.error('[UPDATE_ROLE_ERROR]', err);
      toast.error('Erreur lors de la modification du rôle.');
    } finally {
      setIsSaving(false);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin_general':
        return (
          <span className="px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-black bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1.5 w-fit">
            <Shield size={12} className="text-purple-600 shrink-0" />
            Admin Général
          </span>
        );
      case 'chef_agence':
        return (
          <span className="px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-black bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1.5 w-fit">
            <Building size={12} className="text-blue-600 shrink-0" />
            Chef d'Agence
          </span>
        );
      case 'designer_graphique':
        return (
          <span className="px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-black bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1.5 w-fit">
            <Printer size={12} className="text-amber-600 shrink-0" />
            Designer Graphique
          </span>
        );
      case 'livreur':
        return (
          <span className="px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5 w-fit">
            <Truck size={12} className="text-emerald-600 shrink-0" />
            Livreur
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-bold bg-slate-100 text-slate-700 w-fit">
            Client
          </span>
        );
    }
  };

  const filteredUsers = users.filter(u => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').includes(q) ||
      (u.role || '').toLowerCase().includes(q) ||
      (u.agencyName || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 font-bold">
        <div className="w-10 h-10 border-4 border-blue-950 border-t-amber-400 rounded-full animate-spin mx-auto mb-3"></div>
        Chargement des utilisateurs...
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">Utilisateurs & Rôles</h1>
          <p className="text-xs text-slate-500 font-medium">Attribution des responsabilités système RBAC Market-Cash</p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher utilisateur, rôle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none shadow-xs"
          />
        </div>
      </div>

      {/* MOBILE LIST VIEW (< sm) */}
      <div className="sm:hidden space-y-3">
        {filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-slate-400 font-medium text-xs bg-white rounded-2xl border border-slate-100">
            Aucun utilisateur trouvé
          </div>
        ) : (
          filteredUsers.map(u => (
            <div key={u.uid} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 overflow-hidden shrink-0">
                    {u.avatar ? <img src={u.avatar} alt={u.displayName} className="w-full h-full object-cover" /> : <UserIcon size={18} />}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-xs leading-tight">{u.displayName || 'Sans nom'}</div>
                    <div className="text-[10px] text-slate-400 font-mono">UID: {u.uid.substring(0, 8)}...</div>
                  </div>
                </div>
                {getRoleBadge(u.role)}
              </div>

              <div className="bg-slate-50 rounded-xl p-2.5 space-y-1 text-xs text-slate-600">
                <div className="flex items-center gap-2 truncate">
                  <Mail size={12} className="text-slate-400 shrink-0" />
                  <span className="truncate">{u.email}</span>
                </div>
                {u.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={12} className="text-slate-400 shrink-0" />
                    <span>{u.phone}</span>
                  </div>
                )}
                {(u.agencyName || u.agencyId) && (
                  <div className="flex items-center gap-2 text-blue-700 font-semibold pt-1 border-t border-slate-200/60">
                    <Building size={12} className="text-blue-500 shrink-0" />
                    <span className="truncate">{u.agencyName || u.agencyId}</span>
                  </div>
                )}
              </div>

              {currentUser?.role === 'admin_general' && (
                <button
                  onClick={() => handleOpenEdit(u)}
                  className="w-full py-2 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer touch-manipulation"
                >
                  <Edit3 size={13} />
                  <span>Modifier Rôle & Agence</span>
                </button>
              )}
            </div>
          ))
        )}
      </div>
      
      {/* DESKTOP TABLE VIEW (>= sm) */}
      <div className="hidden sm:block bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-800 border-b border-slate-200">
              <tr>
                <th className="p-3.5 font-bold uppercase tracking-wider">Utilisateur</th>
                <th className="p-3.5 font-bold uppercase tracking-wider">Contact</th>
                <th className="p-3.5 font-bold uppercase tracking-wider">Rôle Attribué</th>
                <th className="p-3.5 font-bold uppercase tracking-wider">Agence / Secteur</th>
                <th className="p-3.5 font-bold uppercase tracking-wider">Date Inscription</th>
                <th className="p-3.5 font-bold uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map(u => (
                <tr key={u.uid} className="hover:bg-slate-50 transition">
                  <td className="p-3.5 flex items-center space-x-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 overflow-hidden shrink-0">
                      {u.avatar ? <img src={u.avatar} alt={u.displayName} className="w-full h-full object-cover" /> : <UserIcon size={18} />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{u.displayName || 'Sans nom'}</div>
                      <div className="text-[10px] text-slate-400 font-mono">UID: {u.uid.substring(0, 8)}...</div>
                    </div>
                  </td>
                  <td className="p-3.5">
                    <div className="font-medium text-slate-800">{u.email}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{u.phone || 'Non renseigné'}</div>
                  </td>
                  <td className="p-3.5">
                    {getRoleBadge(u.role)}
                  </td>
                  <td className="p-3.5 font-semibold text-slate-700">
                    {u.agencyName || u.agencyId || '—'}
                  </td>
                  <td className="p-3.5 font-medium text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="p-3.5 text-right">
                    {currentUser?.role === 'admin_general' && (
                      <button
                        onClick={() => handleOpenEdit(u)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl font-bold text-xs flex items-center gap-1.5 ml-auto transition cursor-pointer"
                      >
                        <Edit3 size={13} />
                        <span>Modifier Rôle</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT ROLE MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 sm:p-7 shadow-2xl border border-slate-200 relative space-y-4 animate-in fade-in zoom-in-95 my-auto">
            <button
              onClick={() => setEditingUser(null)}
              className="absolute top-4 right-4 p-1.5 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <Shield size={20} />
              </div>
              <div className="min-w-0 pr-6">
                <h3 className="text-base sm:text-lg font-black text-slate-900 truncate">Permissions & Rôle</h3>
                <p className="text-xs text-slate-500 font-medium truncate">{editingUser.displayName || editingUser.email}</p>
              </div>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Rôle / Responsabilité Système
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-purple-500 outline-none cursor-pointer"
                >
                  <option value="client">Client (Standard)</option>
                  <option value="chef_agence">Chef d'Agence (Gestion locale)</option>
                  <option value="designer_graphique">Designer Graphique (Impression PVC)</option>
                  <option value="livreur">Livreur (Tournées & Courses)</option>
                  <option value="admin_general">Admin Général (Accès Total)</option>
                </select>
              </div>

              {(selectedRole === 'chef_agence' || selectedRole === 'livreur') && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nom de l'Agence / Secteur <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Agence Kinshasa Nord"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Obligatoire pour les chefs d'agence et livreurs.</p>
                </div>
              )}

              {selectedRole === 'designer_graphique' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Agence ou Atelier (Optionnel)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Atelier Central"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl text-xs transition cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Enregistrement...' : 'Enregistrer le rôle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
