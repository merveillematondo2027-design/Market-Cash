import React,{useEffect,useMemo,useState}from'react';
import{collection,deleteField,doc,getDocs,orderBy,query,updateDoc,where}from'firebase/firestore';
import{useNavigate,useSearchParams}from'react-router-dom';
import{db}from'../../firebase/config';
import{AccountStatus,AppLog,CardPurchaseRequest,PhysicalCardRequest,User,UserCard,UserRole}from'../../types';
import{useAuthStore}from'../../store/authStore';
import{logService}from'../../services/logService';
import{adminUserService,AdminUserControlSnapshot}from'../../services/adminUserService';
import toast from'react-hot-toast';
import{AlertTriangle,BadgeCheck,Ban,Building2,CreditCard,Edit3,FileText,Filter,Fingerprint,History,KeyRound,LockKeyhole,NotebookPen,RefreshCw,RotateCcw,Search,Shield,ShieldCheck,Snowflake,Trash2,Truck,User as UserIcon,WalletCards,X}from'lucide-react';
import{firestoreErrorMessage,firestoreNetwork}from'../../lib/firestoreNetwork';

type Tab='control'|'wallets'|'cards'|'requests'|'deliveries'|'history'|'security';
type RoleFilter='all'|UserRole;
type ProfileFilter='all'|'complete'|'incomplete'|'with_phone'|'without_phone';
type PeriodFilter='all'|'today'|'7d'|'30d';
type SortFilter='newest'|'oldest'|'name_asc'|'name_desc';

const fmt=(value?:number)=>value?new Date(value).toLocaleString('fr-FR'):'—';
const safeDate=(value?:number)=>value&&!Number.isNaN(new Date(value).getTime())?new Date(value).toLocaleDateString('fr-FR'):'—';
const roleLabel=(role:UserRole)=>({client:'Client',agent:'Agent point de vente',marchand:'Marchand',agent_administratif:'Agent administratif',chef_agence:"Chef d'agence",designer_graphique:'Designer graphique',livreur:'Livreur',admin_general:'Admin général'}[role]||role);
const statusLabel=(status?:AccountStatus)=>status==='banned'?'Banni':status==='deleted'?'Supprimé':status==='blocked'?'Bloqué':status==='suspended'?'Suspendu':'Actif';
const statusClass=(status?:AccountStatus)=>status==='banned'?'bg-red-700 text-white':status==='deleted'?'bg-slate-700 text-white':status==='blocked'?'bg-red-100 text-red-700':status==='suspended'?'bg-amber-100 text-amber-800':'bg-emerald-100 text-emerald-700';
const money=(value:number,currency:string)=>currency==='CDF'?`${Number(value||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(value||0).toFixed(2)} USD`;

export default function AdminUsers(){
  const{user:currentUser}=useAuthStore();
  const navigate=useNavigate();
  const[params,setParams]=useSearchParams();
  const[users,setUsers]=useState<User[]>([]);
  const[loading,setLoading]=useState(true);
  const[searchQuery,setSearchQuery]=useState('');
  const[roleFilter,setRoleFilter]=useState<RoleFilter>('all');
  const[agencyFilter,setAgencyFilter]=useState('all');
  const[profileFilter,setProfileFilter]=useState<ProfileFilter>('all');
  const[periodFilter,setPeriodFilter]=useState<PeriodFilter>('all');
  const[sortFilter,setSortFilter]=useState<SortFilter>('newest');
  const[selectedUser,setSelectedUser]=useState<User|null>(null);
  const[tab,setTab]=useState<Tab>('control');
  const[detailLoading,setDetailLoading]=useState(false);
  const[cards,setCards]=useState<UserCard[]>([]);
  const[requests,setRequests]=useState<CardPurchaseRequest[]>([]);
  const[deliveries,setDeliveries]=useState<PhysicalCardRequest[]>([]);
  const[logs,setLogs]=useState<AppLog[]>([]);
  const[control,setControl]=useState<AdminUserControlSnapshot|null>(null);
  const[controlLoading,setControlLoading]=useState(false);
  const[actionLoading,setActionLoading]=useState('');
  const[adminNote,setAdminNote]=useState('');
  const[editingUser,setEditingUser]=useState<User|null>(null);
  const[selectedRole,setSelectedRole]=useState<UserRole>('client');
  const[agencyName,setAgencyName]=useState('');
  const[profileName,setProfileName]=useState('');
  const[profilePhone,setProfilePhone]=useState('');
  const[isSaving,setIsSaving]=useState(false);

  useEffect(()=>{void loadUsers()},[]);

  async function loadUsers(){
    setLoading(true);
    try{
      const snap=await firestoreNetwork.guard('admin.users.list',()=>getDocs(query(collection(db,'users'),orderBy('createdAt','desc'))));
      const list=snap.docs.map(d=>({...d.data(),uid:d.id}as User));
      setUsers(list);
      const requestedUid=params.get('uid');
      if(requestedUid&&!selectedUser){const found=list.find(u=>u.uid===requestedUid);if(found)void openUser(found,false)}
    }catch(error){console.error('[ADMIN_LOAD_USERS_ERROR]',error);toast.error(firestoreErrorMessage(error,'Impossible de charger les utilisateurs.'))}
    finally{setLoading(false)}
  }

  async function loadControl(uid:string){
    if(currentUser?.role!=='admin_general')return;
    setControlLoading(true);
    try{const data=await adminUserService.getControl(uid);setControl(data);setAdminNote(data.adminNote||'')}
    catch(error){console.warn('[ADMIN_USER_CONTROL_UNAVAILABLE]',error);setControl(null)}
    finally{setControlLoading(false)}
  }

  async function openUser(target:User,updateUrl=true){
    setSelectedUser(target);setTab('control');setDetailLoading(true);setControl(null);setAdminNote(target.adminNote||'');setProfileName(target.displayName||'');setProfilePhone(target.phone||'');
    if(updateUrl)setParams({uid:target.uid},{replace:true});
    logService.audit('CLIENT_PROFILE_VIEWED','Dossier utilisateur consulté',{targetType:'user',targetId:target.uid,targetUserId:target.uid,targetRole:target.role});
    try{
      const[cardSnap,requestSnap,deliverySnap,ownLogsSnap]=await firestoreNetwork.guard('admin.user_dossier.load',()=>Promise.all([
        getDocs(query(collection(db,'cards'),where('userId','==',target.uid))),
        getDocs(query(collection(db,'card_purchase_requests'),where('userId','==',target.uid))),
        getDocs(query(collection(db,'physical_card_requests'),where('userId','==',target.uid))),
        getDocs(query(collection(db,'appLogs'),where('userId','==',target.uid)))
      ]));
      setCards(cardSnap.docs.map(d=>({...d.data(),id:d.id}as UserCard)));
      setRequests(requestSnap.docs.map(d=>({...d.data(),id:d.id}as CardPurchaseRequest)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)));
      setDeliveries(deliverySnap.docs.map(d=>({...d.data(),id:d.id}as PhysicalCardRequest)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)));
      setLogs(ownLogsSnap.docs.map(d=>({...d.data(),id:d.id}as AppLog)).sort((a,b)=>b.timestamp-a.timestamp));
      void loadControl(target.uid);
    }catch(error){console.error('[CLIENT_DOSSIER_LOAD_ERROR]',error);toast.error(firestoreErrorMessage(error,'Le dossier est ouvert, mais certaines données ne sont pas accessibles.'))}
    finally{setDetailLoading(false)}
  }

  function closeUser(){setSelectedUser(null);setParams({},{replace:true})}

  function editRole(target:User){
    if(currentUser?.role!=='admin_general')return toast.error('Seul l’Administrateur Général peut modifier les rôles.');
    if(target.uid===currentUser.uid)return toast.error('Votre propre rôle ne peut pas être modifié ici.');
    setEditingUser(target);setSelectedRole(target.role);setAgencyName(target.agencyName||target.agencyId||'');
  }

  async function saveRole(e:React.FormEvent){
    e.preventDefault();if(!editingUser||currentUser?.role!=='admin_general'||isSaving)return;
    if((selectedRole==='chef_agence'||selectedRole==='livreur'||selectedRole==='designer_graphique')&&!agencyName.trim())return toast.error('L’agence ou le secteur est obligatoire pour ce rôle.');
    setIsSaving(true);
    try{
      const updates:Record<string,unknown>={role:selectedRole,updatedAt:Date.now()};
      if(['chef_agence','livreur','designer_graphique'].includes(selectedRole)&&agencyName.trim()){updates.agencyId=agencyName.trim();updates.agencyName=agencyName.trim()}else{updates.agencyId=deleteField();updates.agencyName=deleteField()}
      await firestoreNetwork.guard('admin.user_role.update',()=>updateDoc(doc(db,'users',editingUser.uid),updates));
      logService.audit('USER_ROLE_CHANGED','Rôle utilisateur modifié',{targetType:'user',targetId:editingUser.uid,targetUserId:editingUser.uid,oldRole:editingUser.role,newRole:selectedRole,success:true});
      toast.success('Rôle et accès mis à jour.');setEditingUser(null);await refreshSelected(editingUser.uid);
    }catch(error){toast.error(firestoreErrorMessage(error,'Modification du rôle impossible.'))}
    finally{setIsSaving(false)}
  }

  async function saveIdentity(){
    if(!selectedUser||currentUser?.role!=='admin_general'||isSaving)return;
    if(!profileName.trim())return toast.error('Le nom ne peut pas être vide.');
    setIsSaving(true);
    try{
      await updateDoc(doc(db,'users',selectedUser.uid),{displayName:profileName.trim(),phone:profilePhone.trim(),updatedAt:Date.now()});
      logService.audit('USER_PROFILE_ADMIN_UPDATED','Informations utilisateur modifiées',{targetType:'user',targetId:selectedUser.uid,targetUserId:selectedUser.uid,success:true});
      toast.success('Informations du compte enregistrées.');await refreshSelected(selectedUser.uid);
    }catch(error){toast.error(firestoreErrorMessage(error,'Impossible de modifier le profil.'))}
    finally{setIsSaving(false)}
  }

  async function refreshSelected(uid:string){
    await loadUsers();
    const snap=await getDocs(query(collection(db,'users'),where('uid','==',uid)));
    const data=snap.docs[0]?.data();
    if(data){const fresh={...data,uid}as User;setSelectedUser(fresh);setProfileName(fresh.displayName||'');setProfilePhone(fresh.phone||'')}
    await loadControl(uid);
  }

  async function accountAction(status:'active'|'suspended'|'blocked'){
    if(!selectedUser||currentUser?.role!=='admin_general'||actionLoading)return;
    if(selectedUser.uid===currentUser.uid)return toast.error('Vous ne pouvez pas modifier votre propre accès ici.');
    let durationMinutes: number|undefined;
    if(status==='suspended'){
      const value=window.prompt('Durée de suspension en heures (ex. 1, 24, 72, 168) :','24');
      if(value===null)return;
      const hours=Number(value.replace(',','.'));
      if(!Number.isFinite(hours)||hours<=0||hours>8760)return toast.error('Durée invalide. Utilisez un nombre d’heures entre 0 et 8760.');
      durationMinutes=Math.round(hours*60);
    }
    const text=status==='active'?'réactiver':status==='suspended'?'suspendre temporairement':'bloquer';
    if(!window.confirm(`Confirmer : ${text} le compte de ${selectedUser.displayName||selectedUser.email} ?`))return;
    setActionLoading(`account:${status}`);
    try{const result=await adminUserService.setAccountStatus(selectedUser.uid,status,durationMinutes);const suspendedUntil=result.suspendedUntil||0;toast.success(status==='active'?'Compte réactivé.':status==='suspended'?`Compte suspendu jusqu’au ${fmt(suspendedUntil)}.`:'Compte bloqué et wallets gelés.');await loadControl(selectedUser.uid);await loadUsers();setSelectedUser(prev=>prev?{...prev,accountStatus:status,suspendedUntil}:prev)}
    catch(error:any){toast.error(error?.message||'Action impossible.')}
    finally{setActionLoading('')}
  }

  async function deleteAccount(){
    if(!selectedUser||currentUser?.role!=='admin_general'||actionLoading)return;
    if(selectedUser.uid===currentUser.uid)return toast.error('Votre propre compte ne peut pas être supprimé ici.');
    const token=window.prompt(`SUPPRESSION DU COMPTE\n\nL’utilisateur pourra recréer un nouveau compte plus tard avec la même adresse e-mail.\nTapez SUPPRIMER pour confirmer :`,'');
    if(token!=='SUPPRIMER')return;
    setActionLoading('delete-account');
    try{await adminUserService.deleteAccount(selectedUser.uid);toast.success('Compte supprimé. Cette adresse e-mail pourra se réinscrire plus tard.');setSelectedUser(prev=>prev?{...prev,accountStatus:'deleted',deletedAt:Date.now()}:prev);await loadUsers();await loadControl(selectedUser.uid)}
    catch(error:any){toast.error(error?.message||'Suppression impossible.')}
    finally{setActionLoading('')}
  }

  async function banAccount(){
    if(!selectedUser||currentUser?.role!=='admin_general'||actionLoading)return;
    if(selectedUser.uid===currentUser.uid)return toast.error('Votre propre compte ne peut pas être banni ici.');
    const reason=window.prompt(`BANNISSEMENT DÉFINITIF\n\nL’adresse ${selectedUser.email} ne pourra plus créer ni utiliser un compte Market-Cash.\nIndiquez le motif :`,'Fraude / violation des conditions Market-Cash')?.trim();
    if(!reason)return;
    const token=window.prompt('Tapez BANNIR pour confirmer définitivement :','');
    if(token!=='BANNIR')return;
    setActionLoading('ban-account');
    try{await adminUserService.banAccount(selectedUser.uid,reason);toast.success('Compte et adresse e-mail bannis définitivement.');setSelectedUser(prev=>prev?{...prev,accountStatus:'banned',bannedAt:Date.now()}:prev);await loadUsers();await loadControl(selectedUser.uid)}
    catch(error:any){toast.error(error?.message||'Bannissement impossible.')}
    finally{setActionLoading('')}
  }

  async function walletAction(currency:'USD'|'CDF'|'ALL',status:'active'|'frozen'){
    if(!selectedUser||actionLoading)return;
    setActionLoading(`wallet:${currency}:${status}`);
    try{await adminUserService.setWalletStatus(selectedUser.uid,currency,status);toast.success(status==='active'?'Wallet réactivé.':'Wallet gelé.');await loadControl(selectedUser.uid)}
    catch(error:any){toast.error(error?.message||'Action wallet impossible.')}
    finally{setActionLoading('')}
  }

  async function resetPin(){
    if(!selectedUser||actionLoading)return;
    if(!window.confirm('Réinitialiser le PIN de cet utilisateur ? Le PIN actuel sera supprimé et la biométrie désactivée.'))return;
    setActionLoading('reset-pin');
    try{await adminUserService.resetPin(selectedUser.uid);toast.success('PIN réinitialisé. Le client devra en créer un nouveau.');await loadControl(selectedUser.uid);setSelectedUser(prev=>prev?{...prev,pinHash:'',useBiometrics:false}:prev)}
    catch(error:any){toast.error(error?.message||'Réinitialisation impossible.')}
    finally{setActionLoading('')}
  }

  async function disableBiometrics(){
    if(!selectedUser||actionLoading)return;setActionLoading('biometrics');
    try{await adminUserService.disableBiometrics(selectedUser.uid);toast.success('Biométrie désactivée.');setSelectedUser(prev=>prev?{...prev,useBiometrics:false}:prev)}
    catch(error:any){toast.error(error?.message||'Action impossible.')}
    finally{setActionLoading('')}
  }

  async function saveNote(){
    if(!selectedUser||actionLoading)return;setActionLoading('note');
    try{await adminUserService.setNote(selectedUser.uid,adminNote);toast.success('Note administrative enregistrée.');await loadControl(selectedUser.uid)}
    catch(error:any){toast.error(error?.message||'Impossible d’enregistrer la note.')}
    finally{setActionLoading('')}
  }

  const agencies=useMemo(()=>Array.from(new Set(users.map(u=>u.agencyName||u.agencyId).filter(Boolean)as string[])).sort((a,b)=>a.localeCompare(b,'fr')),[users]);
  const resetFilters=()=>{setSearchQuery('');setRoleFilter('all');setAgencyFilter('all');setProfileFilter('all');setPeriodFilter('all');setSortFilter('newest')};
  const filtered=useMemo(()=>{
    const now=Date.now(),day=86400000;
    const result=users.filter(u=>{const q=searchQuery.trim().toLowerCase();const search=!q||[u.displayName,u.email,u.phone,u.role,u.agencyName,u.agencyId,u.accountStatus].some(v=>String(v||'').toLowerCase().includes(q));const complete=Boolean(u.displayName?.trim()&&u.email?.trim()&&u.phone?.trim());const created=Number(u.createdAt||0);return search&&(roleFilter==='all'||u.role===roleFilter)&&(agencyFilter==='all'||(u.agencyName||u.agencyId||'')===agencyFilter)&&(profileFilter==='all'||(profileFilter==='complete'&&complete)||(profileFilter==='incomplete'&&!complete)||(profileFilter==='with_phone'&&!!u.phone?.trim())||(profileFilter==='without_phone'&&!u.phone?.trim()))&&(periodFilter==='all'||(periodFilter==='today'&&created>=now-day)||(periodFilter==='7d'&&created>=now-7*day)||(periodFilter==='30d'&&created>=now-30*day))});
    return [...result].sort((a,b)=>sortFilter==='oldest'?Number(a.createdAt||0)-Number(b.createdAt||0):sortFilter==='name_asc'?String(a.displayName||'').localeCompare(String(b.displayName||''),'fr'):sortFilter==='name_desc'?String(b.displayName||'').localeCompare(String(a.displayName||''),'fr'):Number(b.createdAt||0)-Number(a.createdAt||0));
  },[users,searchQuery,roleFilter,agencyFilter,profileFilter,periodFilter,sortFilter]);
  const activeFilterCount=[roleFilter!=='all',agencyFilter!=='all',profileFilter!=='all',periodFilter!=='all',sortFilter!=='newest',Boolean(searchQuery.trim())].filter(Boolean).length;

  if(loading)return <div className="p-8 text-center font-bold text-slate-500">Chargement des utilisateurs...</div>;

  return <div className="mx-auto max-w-7xl space-y-4 pb-24 px-1 sm:px-0">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-xl font-black text-blue-950 sm:text-2xl">Clients & Wallets</h1><p className="text-xs text-slate-500">Gestion complète des comptes, accès, sécurité, wallets et activités.</p></div><div className="relative sm:w-80"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Nom, email, téléphone, rôle, statut..." className="w-full rounded-xl border bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500"/></div></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5"><Stat label="Utilisateurs" value={users.length}/><Stat label="Clients" value={users.filter(u=>u.role==='client').length}/><Stat label="Agents" value={users.filter(u=>u.role==='agent').length}/><Stat label="Marchands" value={users.filter(u=>u.role==='marchand').length}/><Stat label="Personnel" value={users.filter(u=>!['client','agent','marchand'].includes(u.role)).length}/></div>

    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-blue-950"><Filter size={16}/><span className="text-sm font-black">Filtrer & trier</span>{activeFilterCount>0&&<span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">{activeFilterCount}</span>}</div><button onClick={resetFilters} className="flex items-center gap-1 text-[11px] font-black text-slate-500"><RotateCcw size={13}/>Réinitialiser</button></div>
      <div className="flex gap-2 overflow-x-auto pb-1">{[['all','Tous'],['client','Clients'],['agent','Agents'],['marchand','Marchands'],['admin_general','Admins'],['chef_agence','Chefs agence'],['agent_administratif','Agents admin'],['designer_graphique','Designers'],['livreur','Livreurs']].map(([value,label])=><button key={value} onClick={()=>setRoleFilter(value as RoleFilter)} className={`shrink-0 rounded-xl border px-3 py-2 text-[11px] font-black ${roleFilter===value?'border-blue-950 bg-blue-950 text-white':'border-slate-200 bg-slate-50 text-slate-600'}`}>{label}</button>)}</div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4"><Select label="Agence" value={agencyFilter} onChange={setAgencyFilter}><option value="all">Toutes</option>{agencies.map(a=><option key={a} value={a}>{a}</option>)}</Select><Select label="Profil" value={profileFilter} onChange={v=>setProfileFilter(v as ProfileFilter)}><option value="all">Tous profils</option><option value="complete">Profil complet</option><option value="incomplete">Profil incomplet</option><option value="with_phone">Avec téléphone</option><option value="without_phone">Sans téléphone</option></Select><Select label="Inscription" value={periodFilter} onChange={v=>setPeriodFilter(v as PeriodFilter)}><option value="all">Toutes dates</option><option value="today">24 heures</option><option value="7d">7 jours</option><option value="30d">30 jours</option></Select><Select label="Trier par" value={sortFilter} onChange={v=>setSortFilter(v as SortFilter)}><option value="newest">Plus récents</option><option value="oldest">Plus anciens</option><option value="name_asc">Nom A → Z</option><option value="name_desc">Nom Z → A</option></Select></div>
      <div className="text-[10px] font-bold text-slate-400">{filtered.length} résultat(s) sur {users.length}</div>
    </section>

    <div className="space-y-2.5 sm:hidden">{filtered.map(u=><button key={u.uid} onClick={()=>void openUser(u)} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm"><div className="flex items-start gap-3"><Avatar user={u}/><div className="min-w-0 flex-1"><div className="text-sm font-black text-blue-800">{u.displayName||'Sans nom'}</div><div className="mt-0.5 truncate text-xs text-slate-500">{u.email}</div><div className="mt-2 flex flex-wrap gap-1"><RoleBadge role={u.role}/><StatusBadge status={u.accountStatus}/><KycBadge status={u.kycStatus}/></div></div></div><div className="mt-3 flex justify-between text-[10px] text-slate-400"><span>{safeDate(u.createdAt)}</span><span className="font-black text-blue-700">Gérer →</span></div></button>)}</div>
    <div className="hidden overflow-hidden rounded-2xl border bg-white sm:block"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500 uppercase"><tr><th className="p-3">Utilisateur</th><th className="p-3">Contact</th><th className="p-3">Rôle</th><th className="p-3">État</th><th className="p-3">KYC</th><th className="p-3 text-right">Action</th></tr></thead><tbody className="divide-y">{filtered.map(u=><tr key={u.uid}><td className="p-3"><button onClick={()=>void openUser(u)} className="flex items-center gap-2 text-left"><Avatar user={u}/><div><div className="font-black text-blue-800">{u.displayName||'Sans nom'}</div><div className="text-[10px] text-slate-400">{u.agencyName||u.agencyId||'Sans agence'}</div></div></button></td><td className="p-3"><div>{u.email}</div><div className="text-slate-400">{u.phone||'—'}</div></td><td className="p-3"><RoleBadge role={u.role}/></td><td className="p-3"><StatusBadge status={u.accountStatus}/></td><td className="p-3"><KycBadge status={u.kycStatus}/></td><td className="p-3 text-right"><button onClick={()=>void openUser(u)} className="rounded-lg bg-blue-950 px-3 py-2 font-black text-white">Gérer</button></td></tr>)}</tbody></table></div>

    {selectedUser&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-2 sm:p-5" onMouseDown={e=>{if(e.target===e.currentTarget)closeUser()}}><div className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-slate-50 shadow-2xl">
      <div className="flex justify-between gap-3 bg-blue-950 p-4 text-white"><div className="flex min-w-0 gap-3"><Avatar user={selectedUser} large/><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-black">{selectedUser.displayName||'Utilisateur Market-Cash'}</h2><StatusBadge status={(control?.accountStatus||selectedUser.accountStatus)as AccountStatus}/></div><div className="truncate text-xs text-blue-200">{selectedUser.email}</div><div className="mt-1 truncate font-mono text-[9px] text-blue-300">UID {selectedUser.uid}</div></div></div><button onClick={closeUser} className="shrink-0 rounded-full bg-white/10 p-2"><X size={18}/></button></div>
      <div className="flex gap-1 overflow-x-auto border-b bg-white p-2">{(['control','wallets','cards','requests','deliveries','history','security']as Tab[]).map(t=><button key={t} onClick={()=>setTab(t)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-[11px] font-black ${tab===t?'bg-amber-400 text-blue-950':'text-slate-500'}`}>{({control:'Contrôle',wallets:'Wallets',cards:'Cartes',requests:'Demandes',deliveries:'Livraisons',history:'Historique',security:'Sécurité'}as Record<Tab,string>)[t]}</button>)}</div>
      <div className="flex-1 overflow-y-auto p-3 sm:p-5">{detailLoading?<div className="p-12 text-center font-bold text-slate-500">Chargement du dossier...</div>:<>
        {tab==='control'&&<div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5"><Mini label="Cartes" value={cards.length}/><Mini label="Demandes" value={requests.length}/><Mini label="Livraisons" value={deliveries.length}/><Mini label="KYC" text={selectedUser.kycStatus||'not_started'}/><Mini label="Rôle" text={roleLabel(selectedUser.role)}/></div>
          <section className="rounded-2xl border bg-white p-4"><div className="mb-3 flex items-center gap-2"><Edit3 size={17} className="text-blue-800"/><h3 className="font-black text-slate-900">Informations du compte</h3></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Nom complet"><input value={profileName} onChange={e=>setProfileName(e.target.value)} className="w-full rounded-xl border p-3 text-sm"/></Field><Field label="Téléphone"><input value={profilePhone} onChange={e=>setProfilePhone(e.target.value)} className="w-full rounded-xl border p-3 text-sm"/></Field><Info label="Email" value={selectedUser.email}/><Info label="Inscription" value={fmt(selectedUser.createdAt)}/><Info label="Agence" value={selectedUser.agencyName||selectedUser.agencyId}/><Info label="Dernière mise à jour" value={fmt(selectedUser.updatedAt)}/></div>{currentUser?.role==='admin_general'&&<div className="mt-4 flex flex-wrap gap-2"><button disabled={isSaving} onClick={saveIdentity} className="rounded-xl bg-blue-950 px-4 py-2.5 text-xs font-black text-white">Enregistrer identité</button><button onClick={()=>editRole(selectedUser)} className="rounded-xl border border-blue-950 px-4 py-2.5 text-xs font-black text-blue-950">Rôle & agence</button></div>}</section>
          <section className="rounded-2xl border bg-white p-4"><div className="mb-3 flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-600"/><div><h3 className="font-black">État & conformité</h3><p className="text-xs text-slate-500">Les décisions KYC restent traitées dans le module KYC & Comptes.</p></div></div><div className="grid gap-2 sm:grid-cols-4"><ControlInfo label="Compte" value={statusLabel(control?.accountStatus||selectedUser.accountStatus)}/><ControlInfo label="KYC" value={selectedUser.kycStatus||'not_started'}/><ControlInfo label="Accès" value={roleLabel(selectedUser.role)}/><ControlInfo label="Suspension jusqu’au" value={control?.suspendedUntil?fmt(control.suspendedUntil):'—'}/></div><div className="mt-3 flex flex-wrap gap-2"><button onClick={()=>navigate('/admin/account-requests')} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Ouvrir KYC & Comptes</button>{currentUser?.role==='admin_general'&&<><button disabled={!!actionLoading} onClick={()=>accountAction('active')} className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Réactiver</button><button disabled={!!actionLoading} onClick={()=>accountAction('suspended')} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">Suspendre avec durée</button><button disabled={!!actionLoading} onClick={()=>accountAction('blocked')} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700">Bloquer</button></>}</div></section>
          {currentUser?.role==='admin_general'&&<section className="rounded-2xl border border-red-200 bg-white p-4"><div className="mb-3 flex items-center gap-2 text-red-700"><AlertTriangle size={18}/><div><h3 className="font-black">Suppression & bannissement</h3><p className="text-xs font-medium text-slate-500">Supprimer permet une nouvelle inscription plus tard. Bannir interdit définitivement cette adresse e-mail.</p></div></div><div className="flex flex-wrap gap-2"><button disabled={!!actionLoading} onClick={deleteAccount} className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-black text-white"><Trash2 size={14}/>Supprimer le compte</button><button disabled={!!actionLoading} onClick={banAccount} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-xs font-black text-white"><Ban size={14}/>Bannir définitivement</button></div></section>}
          {currentUser?.role==='admin_general'&&<section className="rounded-2xl border bg-white p-4"><div className="mb-3 flex items-center gap-2"><NotebookPen size={17} className="text-blue-800"/><div><h3 className="font-black">Note administrative privée</h3><p className="text-xs text-slate-500">Visible uniquement par l’administration. Maximum 2 000 caractères.</p></div></div><textarea value={adminNote} maxLength={2000} onChange={e=>setAdminNote(e.target.value)} placeholder="Ex. client vérifié au siège, suivi nécessaire, incident résolu..." className="min-h-28 w-full rounded-2xl border p-3 text-sm outline-none focus:border-blue-500"/><div className="mt-2 flex justify-end"><button disabled={actionLoading==='note'} onClick={saveNote} className="rounded-xl bg-blue-950 px-4 py-2.5 text-xs font-black text-white">Enregistrer la note</button></div></section>}
        </div>}

        {tab==='wallets'&&<div className="space-y-4"><div className="flex items-center justify-between"><div><h3 className="font-black text-blue-950">Portefeuilles financiers</h3><p className="text-xs text-slate-500">Solde, réserve et état technique. Le gel empêche les opérations financières.</p></div><button onClick={()=>loadControl(selectedUser.uid)} className="rounded-xl border p-2"><RefreshCw size={16}/></button></div>{controlLoading?<div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">Lecture sécurisée des wallets...</div>:control?<div className="grid gap-3 md:grid-cols-2">{(['USD','CDF']as const).map(currency=><WalletPanel key={currency} currency={currency} wallet={control.wallets?.[currency]} busy={!!actionLoading} onFreeze={()=>walletAction(currency,'frozen')} onActivate={()=>walletAction(currency,'active')}/>)}</div>:<div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><b>Contrôle backend indisponible.</b><br/>Le dossier client reste consultable, mais les commandes wallet exigent le déploiement des nouvelles Cloud Functions.</div>}<div className="flex flex-wrap gap-2"><button disabled={!!actionLoading} onClick={()=>walletAction('ALL','frozen')} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white"><Snowflake size={14} className="mr-1 inline"/>Geler tous les wallets</button><button disabled={!!actionLoading} onClick={()=>walletAction('ALL','active')} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white">Réactiver tous les wallets</button></div></div>}
        {tab==='cards'&&<List count={cards.length} empty="Aucune carte attribuée">{cards.map(c=><Item key={c.id||c.cardId} icon={<CreditCard size={17}/>} title={c.cardIdentifier||c.cardId} subtitle={`${c.status} · vente ${c.saleStatus||'—'} · impression ${c.printStatus||'—'}`}/>)}</List>}
        {tab==='requests'&&<List count={requests.length} empty="Aucune demande">{requests.map(r=><Item key={r.id} icon={<FileText size={17}/>} title={`${r.amount} ${r.currency||'USD'} · ${r.status}`} subtitle={`${r.cardName||'Carte Market-Cash'}${r.isUrgent||r.urgentProcessing?' · Urgente':''} · ${fmt(r.createdAt)}`}/>)}</List>}
        {tab==='deliveries'&&<List count={deliveries.length} empty="Aucune livraison">{deliveries.map(d=><Item key={d.id} icon={<Truck size={17}/>} title={`${d.cardIdentifier||d.cardId} · ${d.status}`} subtitle={`${d.deliveryAddress||'Adresse non renseignée'} · ${fmt(d.createdAt)}`}/>)}</List>}
        {tab==='history'&&<List count={logs.length} empty="Aucune activité enregistrée">{logs.map(l=><div key={l.id} className="rounded-2xl border bg-white p-3"><div className="flex justify-between gap-2"><div className="text-sm font-black">{l.event}</div><div className="whitespace-nowrap text-[9px] text-slate-400">{fmt(l.timestamp)}</div></div><div className="mt-1 text-xs text-slate-500">{l.message}</div><div className="mt-2 text-[10px] font-bold text-slate-400">{l.operation||l.category} · {l.success===false?'Échec':'OK'}</div></div>)}</List>}
        {tab==='security'&&<div className="space-y-4"><div className="grid gap-2 sm:grid-cols-2"><Security icon={<KeyRound/>} label="PIN" value={selectedUser.pinHash?'Configuré':'À définir'}/><Security icon={<Fingerprint/>} label="Biométrie" value={selectedUser.useBiometrics?'Activée':'Désactivée'}/><Security icon={<Shield/>} label="Rôle" value={roleLabel(selectedUser.role)}/><Security icon={<History/>} label="Dernière réinitialisation" value={fmt(control?.securityResetAt||selectedUser.securityResetAt)}/></div>{currentUser?.role==='admin_general'&&<section className="rounded-2xl border border-red-200 bg-white p-4"><div className="mb-3 flex items-center gap-2 text-red-700"><AlertTriangle size={18}/><h3 className="font-black">Actions de sécurité</h3></div><div className="flex flex-wrap gap-2"><button disabled={!!actionLoading} onClick={resetPin} className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-black text-white">Réinitialiser le PIN</button><button disabled={!!actionLoading||!selectedUser.useBiometrics} onClick={disableBiometrics} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">Désactiver biométrie</button></div><p className="mt-3 text-xs text-slate-500">Les PIN, CVV, mots de passe et tokens ne sont jamais affichés à l’administration.</p></section>}</div>}
      </>}</div>
    </div></div>}

    {editingUser&&<div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-3"><form onSubmit={saveRole} className="w-full max-w-lg space-y-4 rounded-3xl bg-white p-5"><div className="flex justify-between"><div><div className="text-lg font-black">Rôle & accès</div><div className="text-xs text-slate-500">{editingUser.displayName}</div></div><button type="button" onClick={()=>setEditingUser(null)} className="rounded-full bg-slate-100 p-2"><X size={17}/></button></div><Field label="Rôle officiel"><select value={selectedRole} onChange={e=>setSelectedRole(e.target.value as UserRole)} className="w-full rounded-xl border p-3 font-bold"><option value="client">Client</option><option value="agent">Agent point de vente</option><option value="marchand">Marchand / Business</option><option value="agent_administratif">Agent administratif</option><option value="chef_agence">Chef d'Agence</option><option value="designer_graphique">Designer Graphique</option><option value="livreur">Livreur</option><option value="admin_general">Admin Général</option></select></Field><Field label="Agence / secteur"><input value={agencyName} onChange={e=>setAgencyName(e.target.value)} placeholder="Ex. Gombe / Siège Central" className="w-full rounded-xl border p-3"/></Field><div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900"><b>Attention :</b> changer le rôle modifie l’espace accessible à l’utilisateur. Pour Agent ou Marchand, privilégiez normalement le processus KYC & Comptes.</div><button disabled={isSaving} className="w-full rounded-xl bg-blue-950 p-3 font-black text-white">{isSaving?'Enregistrement...':'Confirmer les accès'}</button></form></div>}
  </div>
}

function Avatar({user,large=false}:{user:User,large?:boolean}){return <div className={`${large?'h-12 w-12':'h-9 w-9'} flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-blue-100 text-blue-700`}>{user.avatar?<img src={user.avatar} alt="" className="h-full w-full object-cover"/>:<UserIcon size={large?22:17}/>}</div>}
function RoleBadge({role}:{role:UserRole}){return <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600">{roleLabel(role)}</span>}
function StatusBadge({status}:{status?:AccountStatus}){return <span className={`shrink-0 rounded-lg px-2 py-1 text-[9px] font-black ${statusClass(status)}`}>{statusLabel(status)}</span>}
function KycBadge({status}:{status?:string}){const cls=status==='approved'?'bg-emerald-100 text-emerald-700':status==='rejected'?'bg-red-100 text-red-700':status==='pending'?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-500';return <span className={`rounded-lg px-2 py-1 text-[9px] font-black ${cls}`}>KYC {status||'not_started'}</span>}
function Stat({label,value}:{label:string,value:number}){return <div className="rounded-2xl border bg-white p-3"><div className="text-[10px] font-bold text-slate-400">{label}</div><div className="text-xl font-black text-blue-950">{value}</div></div>}
function Mini({label,value,text}:{label:string,value?:number,text?:string}){return <div className="rounded-xl border bg-white p-3 text-center"><div className="truncate text-base font-black text-blue-950">{text??value??'—'}</div><div className="text-[9px] font-bold text-slate-400">{label}</div></div>}
function Info({label,value}:{label:string,value?:string}){return <div><div className="text-[10px] font-black uppercase text-slate-400">{label}</div><div className="break-words text-sm font-bold text-slate-800">{value||'—'}</div></div>}
function ControlInfo({label,value}:{label:string,value:string}){return <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase text-slate-400">{label}</div><div className="mt-1 text-sm font-black text-slate-800">{value}</div></div>}
function Item({icon,title,subtitle}:{icon:React.ReactNode,title:string,subtitle:string}){return <div className="flex gap-3 rounded-2xl border bg-white p-3"><div className="pt-0.5 text-blue-800">{icon}</div><div className="min-w-0"><div className="break-words text-sm font-black">{title}</div><div className="mt-0.5 break-words text-xs text-slate-500">{subtitle}</div></div></div>}
function List({count,empty,children}:{count:number,empty:string,children:React.ReactNode}){return <div className="space-y-2">{count?children:<div className="rounded-2xl border bg-white p-10 text-center text-slate-400">{empty}</div>}</div>}
function Security({icon,label,value}:{icon:React.ReactNode,label:string,value:string}){return <div className="flex gap-3 rounded-2xl border bg-white p-4"><div className="text-emerald-600 [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</div><div><div className="text-[10px] font-black text-slate-400">{label}</div><div className="text-sm font-bold">{value}</div></div></div>}
function Field({label,children}:{label:string,children:React.ReactNode}){return <label className="block"><span className="mb-1 block text-[10px] font-black uppercase text-slate-400">{label}</span>{children}</label>}
function Select({label,value,onChange,children}:{label:string,value:string,onChange:(v:string)=>void,children:React.ReactNode}){return <label className="text-[10px] font-black uppercase text-slate-400">{label}<select value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 outline-none">{children}</select></label>}
function WalletPanel({currency,wallet,busy,onFreeze,onActivate}:{currency:'USD'|'CDF';wallet:any;busy:boolean;onFreeze:()=>void;onActivate:()=>void}){if(!wallet)return <div className="rounded-2xl border bg-white p-5"><div className="font-black text-blue-950">Wallet {currency}</div><p className="mt-2 text-sm text-slate-500">Pas encore initialisé.</p></div>;return <div className="rounded-2xl border bg-white p-5"><div className="flex items-start justify-between"><div><div className="flex items-center gap-2"><WalletCards size={19} className="text-blue-800"/><h4 className="font-black text-blue-950">Wallet {currency}</h4></div><div className="mt-1 text-[10px] font-bold uppercase text-slate-400">{wallet.status||'active'}</div></div><span className={`rounded-lg px-2 py-1 text-[9px] font-black ${wallet.status==='active'?'bg-emerald-100 text-emerald-700':'bg-blue-100 text-blue-800'}`}>{wallet.status==='active'?'ACTIF':'GELÉ'}</span></div><div className="mt-4 text-3xl font-black text-slate-950">{money(wallet.availableBalance||0,currency)}</div><div className="mt-3 grid grid-cols-2 gap-2"><ControlInfo label="Comptable" value={money(wallet.ledgerBalance||0,currency)}/><ControlInfo label="Réservé" value={money(wallet.heldBalance||0,currency)}/></div>{wallet.marketCashId&&<div className="mt-3 rounded-xl bg-slate-50 p-3 font-mono text-xs">{wallet.marketCashId}</div>}<div className="mt-4 flex gap-2"><button disabled={busy||wallet.status!=='active'} onClick={onFreeze} className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white disabled:opacity-30"><LockKeyhole size={13} className="mr-1 inline"/>Geler</button><button disabled={busy||wallet.status==='active'} onClick={onActivate} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-30"><BadgeCheck size={13} className="mr-1 inline"/>Activer</button></div></div>}
