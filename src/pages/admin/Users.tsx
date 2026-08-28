import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteField, doc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../firebase/config';
import { AppLog, CardPurchaseRequest, PhysicalCardRequest, User, UserCard, UserRole } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { logService } from '../../services/logService';
import toast from 'react-hot-toast';
import {
  Activity, Building, CreditCard, Edit3, FileText, History, Mail, Phone,
  Search, Shield, Truck, User as UserIcon, X
} from 'lucide-react';

type Tab = 'summary'|'cards'|'requests'|'deliveries'|'history'|'security';
const fmt = (n?:number) => n ? new Date(n).toLocaleString('fr-FR') : '—';

export default function AdminUsers(){
  const { user: currentUser } = useAuthStore();
  const [params, setParams] = useSearchParams();
  const [users,setUsers] = useState<User[]>([]);
  const [loading,setLoading] = useState(true);
  const [searchQuery,setSearchQuery] = useState('');
  const [selectedUser,setSelectedUser] = useState<User|null>(null);
  const [tab,setTab] = useState<Tab>('summary');
  const [detailLoading,setDetailLoading] = useState(false);
  const [cards,setCards] = useState<UserCard[]>([]);
  const [requests,setRequests] = useState<CardPurchaseRequest[]>([]);
  const [deliveries,setDeliveries] = useState<PhysicalCardRequest[]>([]);
  const [logs,setLogs] = useState<AppLog[]>([]);
  const [editingUser,setEditingUser] = useState<User|null>(null);
  const [selectedRole,setSelectedRole] = useState<UserRole>('client');
  const [agencyName,setAgencyName] = useState('');
  const [isSaving,setIsSaving] = useState(false);

  useEffect(()=>{ void loadUsers(); },[]);

  async function loadUsers(){
    setLoading(true);
    try{
      const snap = await getDocs(query(collection(db,'users'), orderBy('createdAt','desc')));
      const list = snap.docs.map(d=>({ ...d.data(), uid:d.id } as User));
      setUsers(list);
      const requestedUid = params.get('uid');
      if(requestedUid){ const found=list.find(u=>u.uid===requestedUid); if(found) void openUser(found,false); }
    }catch(error){ console.error('[ADMIN_LOAD_USERS_ERROR]',error); toast.error('Impossible de charger les utilisateurs.'); }
    finally{setLoading(false)}
  }

  async function openUser(target:User, updateUrl=true){
    setSelectedUser(target); setTab('summary'); setDetailLoading(true);
    if(updateUrl) setParams({uid:target.uid},{replace:true});
    logService.audit('CLIENT_PROFILE_VIEWED','Dossier client consulté',{targetType:'user',targetId:target.uid,targetUserId:target.uid,targetRole:target.role});
    try{
      const [cs,rs,ds,ls,ts] = await Promise.all([
        getDocs(query(collection(db,'cards'),where('userId','==',target.uid))),
        getDocs(query(collection(db,'card_purchase_requests'),where('userId','==',target.uid))),
        getDocs(query(collection(db,'physical_card_requests'),where('userId','==',target.uid))),
        getDocs(query(collection(db,'appLogs'),where('userId','==',target.uid))),
        getDocs(query(collection(db,'appLogs'),where('metadata.targetUserId','==',target.uid)))
      ]);
      setCards(cs.docs.map(d=>({...d.data(),id:d.id} as UserCard)));
      setRequests(rs.docs.map(d=>({...d.data(),id:d.id} as CardPurchaseRequest)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)));
      setDeliveries(ds.docs.map(d=>({...d.data(),id:d.id} as PhysicalCardRequest)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)));
      const merged=[...ls.docs,...ts.docs].map(d=>({id:d.id,...d.data()} as AppLog));
      const unique=[...new Map(merged.map(l=>[l.id,l])).values()].sort((a,b)=>b.timestamp-a.timestamp);
      setLogs(unique);
    }catch(error){console.error('[CLIENT_DOSSIER_LOAD_ERROR]',error);toast.error('Le dossier a été ouvert, mais certaines données ne sont pas accessibles.');}
    finally{setDetailLoading(false)}
  }

  function closeUser(){setSelectedUser(null);setParams({}, {replace:true});}
  function editRole(target:User){ if(currentUser?.role!=='admin_general') return toast.error('Seul l’Administrateur Général peut modifier les rôles.'); setEditingUser(target);setSelectedRole(target.role);setAgencyName(target.agencyName||target.agencyId||''); }

  async function saveRole(e:React.FormEvent){
    e.preventDefault(); if(!editingUser||currentUser?.role!=='admin_general'||isSaving)return;
    if((selectedRole==='chef_agence'||selectedRole==='livreur')&&!agencyName.trim())return toast.error('L’agence est obligatoire pour ce rôle.');
    setIsSaving(true);
    try{
      const updates:Record<string,unknown>={role:selectedRole,updatedAt:Date.now()};
      if(selectedRole==='chef_agence'||selectedRole==='livreur'||(selectedRole==='designer_graphique'&&agencyName.trim())){updates.agencyId=agencyName.trim();updates.agencyName=agencyName.trim();}
      else{updates.agencyId=deleteField();updates.agencyName=deleteField();}
      await updateDoc(doc(db,'users',editingUser.uid),updates);
      logService.audit('USER_ROLE_CHANGED','Rôle utilisateur modifié',{targetType:'user',targetId:editingUser.uid,targetUserId:editingUser.uid,oldRole:editingUser.role,newRole:selectedRole,success:true});
      toast.success('Rôle mis à jour.');setEditingUser(null);await loadUsers();
    }catch(error){console.error('[UPDATE_ROLE_ERROR]',error);toast.error('Modification du rôle impossible.');}
    finally{setIsSaving(false)}
  }

  const filtered=useMemo(()=>users.filter(u=>{const q=searchQuery.trim().toLowerCase();return !q||[u.displayName,u.email,u.phone,u.role,u.agencyName].some(v=>String(v||'').toLowerCase().includes(q));}),[users,searchQuery]);

  if(loading)return <div className="p-8 text-center font-bold text-slate-500">Chargement des utilisateurs...</div>;

  return <div className="max-w-7xl mx-auto space-y-4 pb-24 px-1 sm:px-0">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3"><div><h1 className="text-xl sm:text-2xl font-black text-blue-950">Clients & Utilisateurs</h1><p className="text-xs text-slate-500">Cliquez sur un nom pour ouvrir son dossier complet.</p></div><div className="relative sm:w-80"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Nom, email, téléphone, rôle..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border bg-white text-sm outline-none focus:border-blue-500"/></div></div>

    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"><Stat label="Utilisateurs" value={users.length}/><Stat label="Clients" value={users.filter(u=>u.role==='client').length}/><Stat label="Personnel" value={users.filter(u=>u.role!=='client').length}/><Stat label="Agences" value={new Set(users.map(u=>u.agencyId).filter(Boolean)).size}/></div>

    <div className="sm:hidden space-y-2.5">{filtered.map(u=><button key={u.uid} onClick={()=>void openUser(u)} className="w-full text-left bg-white border border-slate-200 rounded-2xl p-4 shadow-sm"><div className="flex items-start gap-3"><Avatar u={u}/><div className="min-w-0 flex-1"><div className="font-black text-blue-800 text-sm break-words">{u.displayName||'Sans nom'}</div><div className="text-xs text-slate-500 truncate mt-0.5">{u.email}</div><div className="text-[11px] text-slate-400 mt-1">{u.phone||'Téléphone non renseigné'}</div></div><RoleBadge role={u.role}/></div><div className="mt-3 flex justify-between items-center text-[10px] text-slate-400"><span>Inscrit {new Date(u.createdAt).toLocaleDateString('fr-FR')}</span><span className="font-bold text-blue-700">Ouvrir dossier →</span></div></button>)}</div>

    <div className="hidden sm:block bg-white border border-slate-200 rounded-2xl overflow-hidden"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500 uppercase"><tr><th className="p-3">Utilisateur</th><th className="p-3">Contact</th><th className="p-3">Rôle</th><th className="p-3">Agence</th><th className="p-3">Inscription</th><th className="p-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map(u=><tr key={u.uid} className="hover:bg-slate-50"><td className="p-3"><button onClick={()=>void openUser(u)} className="flex items-center gap-3 text-left"><Avatar u={u}/><div><div className="font-black text-blue-800 hover:underline">{u.displayName||'Sans nom'}</div><div className="text-[9px] font-mono text-slate-400">{u.uid.slice(0,10)}…</div></div></button></td><td className="p-3"><div>{u.email}</div><div className="text-slate-400">{u.phone||'—'}</div></td><td className="p-3"><RoleBadge role={u.role}/></td><td className="p-3">{u.agencyName||u.agencyId||'—'}</td><td className="p-3">{new Date(u.createdAt).toLocaleDateString('fr-FR')}</td><td className="p-3 text-right"><button onClick={()=>void openUser(u)} className="px-3 py-2 rounded-lg bg-blue-950 text-white font-black">Ouvrir</button></td></tr>)}</tbody></table></div>

    {selectedUser&&<div className="fixed inset-0 z-50 bg-slate-950/70 p-2 sm:p-5 flex items-center justify-center" onMouseDown={e=>{if(e.target===e.currentTarget)closeUser()}}><div className="w-full max-w-5xl max-h-[94vh] bg-slate-50 rounded-3xl shadow-2xl overflow-hidden flex flex-col"><div className="bg-blue-950 text-white p-4 flex justify-between gap-3"><div className="flex gap-3 min-w-0"><Avatar u={selectedUser} large/><div className="min-w-0"><h2 className="text-lg font-black truncate">{selectedUser.displayName||'Client Market-Cash'}</h2><div className="text-xs text-blue-200 truncate">{selectedUser.email}</div><div className="text-[9px] text-blue-300 font-mono mt-1 truncate">UID {selectedUser.uid}</div></div></div><button onClick={closeUser} className="p-2 rounded-full bg-white/10 shrink-0"><X size={18}/></button></div><div className="bg-white border-b p-2 flex gap-1 overflow-x-auto">{(['summary','cards','requests','deliveries','history','security'] as Tab[]).map(t=><button key={t} onClick={()=>setTab(t)} className={`px-3 py-2 rounded-xl text-[11px] font-black whitespace-nowrap ${tab===t?'bg-amber-400 text-blue-950':'text-slate-500'}`}>{({summary:'Résumé',cards:'Cartes',requests:'Demandes',deliveries:'Livraisons',history:'Historique',security:'Sécurité'} as Record<Tab,string>)[t]}</button>)}</div><div className="overflow-y-auto p-3 sm:p-5 flex-1">{detailLoading?<div className="p-12 text-center font-bold text-slate-500">Chargement du dossier...</div>:<>
      {tab==='summary'&&<div className="space-y-3"><div className="grid grid-cols-3 gap-2"><Mini label="Cartes" value={cards.length}/><Mini label="Demandes" value={requests.length}/><Mini label="Livraisons" value={deliveries.length}/></div><div className="bg-white border rounded-2xl p-4 grid sm:grid-cols-2 gap-3"><Info label="Nom" value={selectedUser.displayName}/><Info label="Email" value={selectedUser.email}/><Info label="Téléphone" value={selectedUser.phone}/><Info label="Rôle" value={selectedUser.role}/><Info label="Agence" value={selectedUser.agencyName||selectedUser.agencyId}/><Info label="Inscription" value={fmt(selectedUser.createdAt)}/></div>{currentUser?.role==='admin_general'&&<button onClick={()=>editRole(selectedUser)} className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-950 text-white font-black text-xs flex items-center justify-center gap-2"><Edit3 size={15}/>Modifier rôle & agence</button>}</div>}
      {tab==='cards'&&<ListEmpty count={cards.length} text="Aucune carte attribuée">{cards.map(c=><Item key={c.id||c.cardId} icon={<CreditCard/>} title={c.cardIdentifier||c.cardId} subtitle={`${c.status} · ${c.saleStatus||'—'} · ${c.printStatus||'—'}`}/>)}</ListEmpty>}
      {tab==='requests'&&<ListEmpty count={requests.length} text="Aucune demande">{requests.map(r=><Item key={r.id} icon={<FileText/>} title={`${r.amount} ${r.currency||'USD'} · ${r.status}`} subtitle={`${r.cardName||'Carte Market-Cash'}${r.isUrgent||r.urgentProcessing?' · Urgente':''} · ${fmt(r.createdAt)}`}/>)}</ListEmpty>}
      {tab==='deliveries'&&<ListEmpty count={deliveries.length} text="Aucune livraison">{deliveries.map(d=><Item key={d.id} icon={<Truck/>} title={`${d.cardIdentifier||d.cardId} · ${d.status}`} subtitle={`${d.deliveryAddress} · ${fmt(d.createdAt)}`}/>)}</ListEmpty>}
      {tab==='history'&&<ListEmpty count={logs.length} text="Aucune activité enregistrée">{logs.map(l=><div key={l.id} className="bg-white border rounded-2xl p-3"><div className="flex justify-between gap-2"><div className="font-black text-sm">{l.event}</div><div className="text-[9px] text-slate-400 whitespace-nowrap">{fmt(l.timestamp)}</div></div><div className="text-xs text-slate-500 mt-1">{l.message}</div><div className="text-[10px] mt-2 font-bold text-slate-400">{l.operation||l.category} · {l.success===false?'Échec':'OK'}</div></div>)}</ListEmpty>}
      {tab==='security'&&<div className="grid sm:grid-cols-2 gap-2"><Security label="PIN" value={selectedUser.pinHash?'Configuré':'Non configuré'}/><Security label="Biométrie" value={selectedUser.useBiometrics?'Activée':'Désactivée'}/><Security label="Rôle" value={selectedUser.role}/><Security label="Protection" value="PIN, CVV et tokens ne sont jamais affichés ici"/></div>}
    </>}</div></div></div>}

    {editingUser&&<div className="fixed inset-0 z-[60] bg-slate-950/70 p-3 flex items-center justify-center"><form onSubmit={saveRole} className="w-full max-w-md bg-white rounded-3xl p-5 space-y-3"><div className="flex justify-between"><div><div className="font-black text-lg">Rôle & agence</div><div className="text-xs text-slate-500">{editingUser.displayName}</div></div><button type="button" onClick={()=>setEditingUser(null)} className="p-2 rounded-full bg-slate-100"><X size={17}/></button></div><select value={selectedRole} onChange={e=>setSelectedRole(e.target.value as UserRole)} className="w-full p-3 rounded-xl border font-bold"><option value="client">Client</option><option value="chef_agence">Chef d'Agence</option><option value="designer_graphique">Designer Graphique</option><option value="livreur">Livreur</option><option value="admin_general">Admin Général</option></select><input value={agencyName} onChange={e=>setAgencyName(e.target.value)} placeholder="Agence / secteur" className="w-full p-3 rounded-xl border"/><button disabled={isSaving} className="w-full p-3 rounded-xl bg-blue-950 text-white font-black disabled:opacity-50">{isSaving?'Enregistrement...':'Enregistrer'}</button></form></div>}
  </div>
}

function Avatar({u,large=false}:{u:User,large?:boolean}){return <div className={`${large?'w-12 h-12':'w-10 h-10'} shrink-0 rounded-xl bg-amber-400 text-blue-950 overflow-hidden flex items-center justify-center`}>{u.avatar?<img src={u.avatar} className="w-full h-full object-cover" alt=""/>:<UserIcon size={large?22:18}/>}</div>}
function RoleBadge({role}:{role:UserRole}){return <span className="shrink-0 px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[9px] font-black uppercase">{role.replaceAll('_',' ')}</span>}
function Stat({label,value}:{label:string,value:number}){return <div className="bg-white border rounded-2xl p-3"><div className="text-[9px] uppercase text-slate-400 font-black">{label}</div><div className="text-xl font-black text-blue-950">{value}</div></div>}
function Mini({label,value}:{label:string,value:number}){return <div className="bg-white border rounded-xl p-3 text-center"><div className="text-xl font-black text-blue-950">{value}</div><div className="text-[9px] uppercase font-black text-slate-400">{label}</div></div>}
function Info({label,value}:{label:string,value?:string}){return <div><div className="text-[9px] uppercase font-black text-slate-400">{label}</div><div className="font-bold text-sm break-words">{value||'—'}</div></div>}
function Security({label,value}:{label:string,value:string}){return <div className="bg-white border rounded-2xl p-4 flex gap-3"><Shield className="text-emerald-600" size={18}/><div><div className="text-[9px] uppercase font-black text-slate-400">{label}</div><div className="font-bold text-sm">{value}</div></div></div>}
function Item({icon,title,subtitle}:{icon:React.ReactNode,title:string,subtitle:string}){return <div className="bg-white border rounded-2xl p-3 flex gap-3"><div className="text-blue-900 [&>svg]:w-5 [&>svg]:h-5">{icon}</div><div className="min-w-0"><div className="font-black text-sm break-words">{title}</div><div className="text-xs text-slate-500 break-words mt-0.5">{subtitle}</div></div></div>}
function ListEmpty({count,text,children}:{count:number,text:string,children:React.ReactNode}){return <div className="space-y-2">{count?children:<div className="p-10 text-center bg-white border rounded-2xl text-slate-400"><Activity className="mx-auto mb-2"/><div className="font-bold text-sm">{text}</div></div>}</div>}
