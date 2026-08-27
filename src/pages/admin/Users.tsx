import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteField, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { AppLog, CardPurchaseRequest, PhysicalCardRequest, User, UserCard, UserRole } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { logService } from '../../services/logService';
import toast from 'react-hot-toast';
import {
  Activity, Building, CreditCard, Edit3, FileText, History, Mail, Phone,
  Search, Shield, Truck, User as UserIcon, X
} from 'lucide-react';

type Tab = 'summary' | 'cards' | 'requests' | 'deliveries' | 'history' | 'security';

const fmt = (value?: number) => value ? new Date(value).toLocaleString('fr-FR') : '—';
const maskPhone = (value?: string) => value ? `${value.slice(0, 4)}••••${value.slice(-2)}` : '—';

export default function AdminUsers() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('summary');
  const [cards, setCards] = useState<UserCard[]>([]);
  const [requests, setRequests] = useState<CardPurchaseRequest[]>([]);
  const [deliveries, setDeliveries] = useState<PhysicalCardRequest[]>([]);
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('client');
  const [agencyName, setAgencyName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const canSupervise = currentUser?.role === 'admin_general' || currentUser?.role === 'chef_agence';
  const canEditRoles = currentUser?.role === 'admin_general';

  useEffect(() => { void loadUsers(); }, []);

  async function loadUsers() {
    try {
      const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
      setUsers(snap.docs.map(d => ({ ...d.data(), uid: d.id } as User)));
    } catch (error) {
      console.error('[ADMIN_LOAD_USERS_ERROR]', error);
      toast.error('Impossible de charger les clients.');
    } finally { setLoading(false); }
  }

  async function openClient(target: User) {
    if (!canSupervise) return;
    setSelectedUser(target);
    setTab('summary');
    setDetailLoading(true);
    logService.audit('CLIENT_PROFILE_VIEWED', 'Ouverture du dossier client', {
      targetType: 'user', targetId: target.uid, targetUserId: target.uid, targetRole: target.role
    });
    try {
      const [cardSnap, requestSnap, deliverySnap, logSnap] = await Promise.all([
        getDocs(collection(db, 'cards')),
        getDocs(collection(db, 'card_purchase_requests')),
        getDocs(collection(db, 'physical_card_requests')),
        getDocs(collection(db, 'appLogs'))
      ]);
      setCards(cardSnap.docs.map(d => ({ ...d.data(), id: d.id } as UserCard)).filter(c => c.userId === target.uid));
      setRequests(requestSnap.docs.map(d => ({ ...d.data(), id: d.id } as CardPurchaseRequest)).filter(r => r.userId === target.uid));
      setDeliveries(deliverySnap.docs.map(d => ({ ...d.data(), id: d.id } as PhysicalCardRequest)).filter(r => r.userId === target.uid));
      setLogs(logSnap.docs.map(d => ({ ...d.data(), id: d.id } as AppLog))
        .filter(l => l.userId === target.uid || l.metadata?.targetUserId === target.uid)
        .sort((a, b) => b.timestamp - a.timestamp));
    } catch (error) {
      console.error('[CLIENT_360_LOAD_ERROR]', error);
      toast.error('Certaines informations du dossier ne sont pas accessibles.');
    } finally { setDetailLoading(false); }
  }

  function handleOpenEdit(target: User) {
    if (!canEditRoles) return toast.error('Seul un Administrateur Général peut modifier les rôles.');
    setEditingUser(target);
    setSelectedRole(target.role || 'client');
    setAgencyName(target.agencyName || target.agencyId || '');
  }

  async function handleSaveRole(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser || !canEditRoles) return;
    if ((selectedRole === 'chef_agence' || selectedRole === 'livreur') && !agencyName.trim()) {
      return toast.error("L'agence est obligatoire pour ce rôle.");
    }
    setIsSaving(true);
    try {
      const updates: Record<string, unknown> = { role: selectedRole, updatedAt: Date.now() };
      if (selectedRole === 'chef_agence' || selectedRole === 'livreur' || (selectedRole === 'designer_graphique' && agencyName.trim())) {
        updates.agencyId = agencyName.trim(); updates.agencyName = agencyName.trim();
      } else { updates.agencyId = deleteField(); updates.agencyName = deleteField(); }
      await updateDoc(doc(db, 'users', editingUser.uid), updates);
      logService.audit('USER_ROLE_CHANGED', 'Rôle utilisateur modifié', {
        targetType: 'user', targetId: editingUser.uid, targetUserId: editingUser.uid,
        oldRole: editingUser.role, newRole: selectedRole, success: true
      });
      toast.success('Rôle mis à jour.');
      setEditingUser(null); await loadUsers();
    } catch (error) {
      logService.error('USER', 'USER_ROLE_CHANGE_FAILED', error, { operation: 'change_user_role', documentId: editingUser.uid });
      toast.error('La modification du rôle a échoué.');
    } finally { setIsSaving(false); }
  }

  const filteredUsers = useMemo(() => users.filter(u => {
    const q = searchQuery.trim().toLowerCase();
    return !q || [u.displayName, u.email, u.phone, u.role, u.agencyName].some(v => (v || '').toLowerCase().includes(q));
  }), [users, searchQuery]);

  if (loading) return <div className="p-10 text-center font-bold text-slate-500">Chargement des clients...</div>;

  return <div className="space-y-5 pb-24 max-w-7xl mx-auto">
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[.18em] text-amber-500">Supervision Market-Cash</p><h1 className="text-2xl font-black text-blue-950">Clients & Utilisateurs</h1><p className="text-sm text-slate-500">Dossier 360°, opérations et traçabilité métier.</p></div>
      <div className="relative w-full md:w-80"><Search size={16} className="absolute left-3 top-3 text-slate-400"/><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Nom, email, téléphone, rôle..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-blue-800"/></div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[['Utilisateurs', users.length], ['Clients', users.filter(u=>u.role==='client').length], ['Personnel', users.filter(u=>u.role!=='client').length], ['Agences', new Set(users.map(u=>u.agencyId).filter(Boolean)).size]].map(([label,value])=><div key={String(label)} className="bg-white rounded-2xl border border-slate-200 p-4"><div className="text-xs text-slate-500 font-bold">{label}</div><div className="text-2xl font-black text-blue-950">{value}</div></div>)}
    </div>

    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="p-3 text-left">Client</th><th className="p-3 text-left">Contact</th><th className="p-3 text-left">Rôle</th><th className="p-3 text-left">Agence</th><th className="p-3 text-left">Inscription</th><th className="p-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">
        {filteredUsers.map(u=><tr key={u.uid} className="hover:bg-blue-50/40 cursor-pointer" onClick={()=>void openClient(u)}><td className="p-3"><div className="font-black text-slate-900">{u.displayName||'Sans nom'}</div><div className="text-[10px] font-mono text-slate-400">{u.uid.slice(0,12)}…</div></td><td className="p-3"><div>{u.email}</div><div className="text-xs text-slate-500">{u.phone||'Non renseigné'}</div></td><td className="p-3 font-bold">{u.role}</td><td className="p-3">{u.agencyName||'—'}</td><td className="p-3">{new Date(u.createdAt).toLocaleDateString('fr-FR')}</td><td className="p-3 text-right"><button onClick={e=>{e.stopPropagation(); void openClient(u)}} className="px-3 py-2 rounded-lg bg-blue-950 text-white font-bold">Ouvrir dossier</button></td></tr>)}
      </tbody></table></div>
    </div>

    {selectedUser && <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm p-2 md:p-6 flex items-center justify-center" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedUser(null)}}><div className="bg-slate-50 w-full max-w-6xl max-h-[94vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col">
      <div className="bg-blue-950 text-white p-5 flex items-start justify-between"><div className="flex gap-3"><div className="w-12 h-12 rounded-2xl bg-amber-400 text-blue-950 flex items-center justify-center"><UserIcon/></div><div><h2 className="text-xl font-black">{selectedUser.displayName||'Client Market-Cash'}</h2><p className="text-xs text-blue-200">{selectedUser.email} · {selectedUser.role}</p><p className="text-[10px] font-mono text-blue-300 mt-1">UID {selectedUser.uid}</p></div></div><button onClick={()=>setSelectedUser(null)} className="p-2 rounded-full bg-white/10"><X/></button></div>
      <div className="flex gap-1 overflow-x-auto bg-white border-b p-2">{(['summary','cards','requests','deliveries','history','security'] as Tab[]).map(t=><button key={t} onClick={()=>setTab(t)} className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap ${tab===t?'bg-amber-400 text-blue-950':'text-slate-500 hover:bg-slate-100'}`}>{({summary:'Résumé',cards:'Cartes',requests:'Demandes',deliveries:'Livraisons',history:'Historique',security:'Sécurité'} as Record<Tab,string>)[t]}</button>)}</div>
      <div className="overflow-y-auto p-4 md:p-6 flex-1">{detailLoading ? <div className="p-12 text-center font-bold text-slate-500">Chargement du dossier 360°...</div> : <>
        {tab==='summary' && <div className="space-y-5"><div className="grid md:grid-cols-3 gap-3">{[[CreditCard,'Cartes',cards.length],[FileText,'Demandes',requests.length],[Truck,'Livraisons',deliveries.length]].map(([Icon,label,value]:any)=><div key={label} className="bg-white border rounded-2xl p-4 flex items-center gap-3"><Icon className="text-blue-900"/><div><div className="text-xs text-slate-500 font-bold">{label}</div><div className="text-2xl font-black">{value}</div></div></div>)}</div><div className="bg-white border rounded-2xl p-5 grid md:grid-cols-2 gap-4 text-sm"><Info label="Nom" value={selectedUser.displayName}/><Info label="Email" value={selectedUser.email}/><Info label="Téléphone" value={selectedUser.phone}/><Info label="Agence" value={selectedUser.agencyName}/><Info label="Créé le" value={fmt(selectedUser.createdAt)}/><Info label="Mis à jour" value={fmt(selectedUser.updatedAt)}/></div>{canEditRoles&&<button onClick={()=>handleOpenEdit(selectedUser)} className="px-4 py-2.5 bg-blue-950 text-white rounded-xl font-black flex gap-2"><Edit3 size={16}/>Modifier rôle & agence</button>}</div>}
        {tab==='cards' && <SectionEmpty items={cards} empty="Aucune carte attribuée">{cards.map(c=><RecordCard key={c.id||c.cardId} icon={<CreditCard/>} title={c.cardIdentifier||c.cardId} subtitle={`${c.status} · ${c.saleStatus||'—'} · ${c.printStatus||'—'}`} date={fmt(c.updatedAt)}/>)}</SectionEmpty>}
        {tab==='requests' && <SectionEmpty items={requests} empty="Aucune demande">{requests.map(r=><RecordCard key={r.id} icon={<FileText/>} title={`Demande ${r.id}`} subtitle={`${r.status} · ${r.amount} ${r.currency||'USD'}${r.isUrgent?' · URGENTE':''}`} date={fmt(r.createdAt)}/>)}</SectionEmpty>}
        {tab==='deliveries' && <SectionEmpty items={deliveries} empty="Aucune livraison">{deliveries.map(d=><RecordCard key={d.id} icon={<Truck/>} title={d.cardIdentifier||d.cardId} subtitle={`${d.status} · WhatsApp ${maskPhone(d.whatsapp)}`} date={fmt(d.createdAt)}/>)}</SectionEmpty>}
        {tab==='history' && <SectionEmpty items={logs} empty="Aucune activité enregistrée">{logs.map(l=><div key={l.id} className="relative pl-8 pb-5 border-l-2 border-slate-200 ml-2"><span className={`absolute -left-2 top-0 w-4 h-4 rounded-full ${l.success===false?'bg-red-500':l.level==='WARNING'?'bg-amber-400':'bg-blue-900'}`}/><div className="bg-white border rounded-2xl p-4"><div className="flex justify-between gap-3"><div className="font-black text-sm">{l.event}</div><div className="text-[10px] text-slate-400">{fmt(l.timestamp)}</div></div><div className="text-xs text-slate-600 mt-1">{l.message}</div><div className="text-[10px] text-slate-400 mt-2">{l.userEmail||l.userId||'Système'} · {l.operation||l.category} · {l.success===false?'Échec':'OK'}</div></div></div>)}</SectionEmpty>}
        {tab==='security' && <div className="grid md:grid-cols-2 gap-3"><Security label="Authentification" value="Compte Firebase lié"/><Security label="PIN" value={selectedUser.pinHash?'Configuré':'Non configuré'}/><Security label="Biométrie" value={selectedUser.useBiometrics?'Activée':'Désactivée'}/><Security label="Données sensibles" value="PIN, CVV et tokens jamais affichés dans ce dossier"/></div>}
      </>}</div>
    </div></div>}

    {editingUser && <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"><form onSubmit={handleSaveRole} className="bg-white rounded-3xl p-6 w-full max-w-md space-y-4"><div className="flex justify-between"><div><h3 className="font-black text-lg">Rôle & agence</h3><p className="text-xs text-slate-500">{editingUser.displayName}</p></div><button type="button" onClick={()=>setEditingUser(null)}><X/></button></div><select value={selectedRole} onChange={e=>setSelectedRole(e.target.value as UserRole)} className="w-full p-3 border rounded-xl font-bold"><option value="client">Client</option><option value="chef_agence">Chef d'Agence</option><option value="designer_graphique">Designer Graphique</option><option value="livreur">Livreur</option><option value="admin_general">Admin Général</option></select><input value={agencyName} onChange={e=>setAgencyName(e.target.value)} placeholder="Agence / secteur" className="w-full p-3 border rounded-xl"/><button disabled={isSaving} className="w-full p-3 rounded-xl bg-blue-950 text-white font-black">{isSaving?'Enregistrement...':'Confirmer la modification'}</button></form></div>}
  </div>;
}

function Info({label,value}:{label:string,value?:string}) { return <div><div className="text-[10px] uppercase font-black text-slate-400">{label}</div><div className="font-bold text-slate-800 break-all">{value||'—'}</div></div>; }
function Security({label,value}:{label:string,value:string}) { return <div className="bg-white border rounded-2xl p-4 flex gap-3"><Shield className="text-emerald-600"/><div><div className="text-xs font-black text-slate-500">{label}</div><div className="font-bold">{value}</div></div></div>; }
function RecordCard({icon,title,subtitle,date}:{icon:React.ReactNode,title:string,subtitle:string,date:string}) { return <div className="bg-white border rounded-2xl p-4 flex items-center gap-3"><div className="text-blue-900">{icon}</div><div className="min-w-0 flex-1"><div className="font-black truncate">{title}</div><div className="text-xs text-slate-500">{subtitle}</div></div><div className="text-[10px] text-slate-400">{date}</div></div>; }
function SectionEmpty({items,empty,children}:{items:unknown[],empty:string,children:React.ReactNode}) { return <div className="space-y-3">{items.length?children:<div className="p-12 text-center bg-white border rounded-2xl text-slate-400 font-bold"><Activity className="mx-auto mb-2"/>{empty}</div>}</div>; }
