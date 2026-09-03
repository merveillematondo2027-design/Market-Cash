import React,{useEffect,useMemo,useState}from'react';
import{collection,doc,getDocs,onSnapshot,query,setDoc,updateDoc,where}from'firebase/firestore';
import{Edit3,Fingerprint,Key,LogOut,Shield,ShieldCheck,Store,User,X}from'lucide-react';
import{Link}from'react-router-dom';
import toast from'react-hot-toast';
import{useAuthStore}from'../../store/authStore';
import{db}from'../../firebase/config';
import LogoutModal from'../../components/LogoutModal';
import{AccountUpgradeType}from'../../types';

type UpgradeForm={
  legalName:string;tradeName:string;activity:string;phone:string;email:string;city:string;address:string;
  businessType:string;registrationNumber:string;taxNumber:string;estimatedMonthlyVolume:string;
  pointName:string;floatEstimate:string;openingHours:string;reason:string;
};

const roleLabel=(role:string)=>role==='marchand'?'Marchand / Business':role==='agent'?'Agent point de vente':role==='agent_administratif'?'Agent administratif':role==='admin_general'?'Administrateur général':'Client';

export default function ClientProfile(){
  const{user,setUser}=useAuthStore();
  const[cardCount,setCardCount]=useState(0);
  const[showLogout,setShowLogout]=useState(false);
  const[kycStatus,setKycStatus]=useState('not_started');
  const[upgradeStatus,setUpgradeStatus]=useState('');
  const[upgradeReason,setUpgradeReason]=useState('');
  const[showUpgrade,setShowUpgrade]=useState(false);
  const[accountType,setAccountType]=useState<AccountUpgradeType>('marchand');
  const[busy,setBusy]=useState(false);
  const[showEdit,setShowEdit]=useState(false);
  const[name,setName]=useState(user?.displayName||'');
  const[phone,setPhone]=useState(user?.phone||'');
  const[useBiometrics,setUseBiometrics]=useState(!!user?.useBiometrics);
  const[accepted,setAccepted]=useState(false);
  const[upgrade,setUpgrade]=useState<UpgradeForm>({
    legalName:user?.displayName||'',tradeName:'',activity:'',phone:user?.phone||'',email:user?.email||'',city:'',address:'',
    businessType:'commerce',registrationNumber:'',taxNumber:'',estimatedMonthlyVolume:'',pointName:'',floatEstimate:'',openingHours:'',reason:''
  });

  useEffect(()=>{
    if(!user)return;
    setName(user.displayName||'');setPhone(user.phone||'');setUseBiometrics(!!user.useBiometrics);
    setUpgrade(current=>({...current,legalName:current.legalName||user.displayName||'',phone:current.phone||user.phone||'',email:current.email||user.email||''}));
    void getDocs(query(collection(db,'cards'),where('userId','==',user.uid))).then(s=>setCardCount(s.size)).catch(()=>{});
    const stopKyc=onSnapshot(doc(db,'kyc_requests',user.uid),snap=>{
      const status=snap.exists()?String(snap.data().status||'pending'):'not_started';
      setKycStatus(status);
      if(status==='approved'&&user.kycStatus!=='approved')setUser({...user,kycStatus:'approved',updatedAt:Date.now()});
    },()=>{});
    const stopUpgrade=onSnapshot(doc(db,'account_upgrade_requests',user.uid),snap=>{
      if(!snap.exists()){setUpgradeStatus('');setUpgradeReason('');return;}
      const data=snap.data();setUpgradeStatus(String(data.status||'pending'));setUpgradeReason(String(data.rejectionReason||''));
    },()=>{});
    return()=>{stopKyc();stopUpgrade();};
  },[user?.uid]);

  const since=useMemo(()=>user?.createdAt&&!Number.isNaN(new Date(user.createdAt).getTime())?new Date(user.createdAt).toLocaleDateString('fr-FR'):'Date non disponible',[user?.createdAt]);
  if(!user)return null;

  const saveProfile=async(e:React.FormEvent)=>{
    e.preventDefault();setBusy(true);
    try{await updateDoc(doc(db,'users',user.uid),{displayName:name.trim(),phone:phone.trim(),updatedAt:Date.now()});setUser({...user,displayName:name.trim(),phone:phone.trim()});setShowEdit(false);toast.success('Profil mis à jour.');}
    catch{toast.error('Modification impossible.');}finally{setBusy(false)}
  };

  const toggleBio=async()=>{
    const next=!useBiometrics;
    try{await updateDoc(doc(db,'users',user.uid),{useBiometrics:next,updatedAt:Date.now()});setUseBiometrics(next);setUser({...user,useBiometrics:next});}
    catch{toast.error('Modification impossible.');}
  };

  const openUpgrade=()=>{
    if(kycStatus!=='approved')return toast.error("Votre identité doit d'abord être approuvée.");
    setAccepted(false);setShowUpgrade(true);
  };

  const submitUpgrade=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(kycStatus!=='approved')return toast.error("Complétez d'abord votre identité KYC.");
    if(!accepted)return toast.error('Confirmez les informations et les conditions de la demande.');
    if(!upgrade.legalName.trim()||!upgrade.activity.trim()||!upgrade.city.trim()||!upgrade.address.trim())return toast.error('Complétez les informations obligatoires.');
    if(accountType==='agent'&&!upgrade.pointName.trim())return toast.error('Indiquez le nom du point de vente.');
    if(accountType==='marchand'&&!upgrade.tradeName.trim())return toast.error("Indiquez le nom commercial de l'activité.");
    setBusy(true);
    try{
      const now=Date.now();
      await setDoc(doc(db,'account_upgrade_requests',user.uid),{
        userId:user.uid,requestedType:accountType,legalName:upgrade.legalName.trim(),tradeName:upgrade.tradeName.trim(),activity:upgrade.activity.trim(),
        phone:upgrade.phone.trim()||user.phone||'',email:upgrade.email.trim()||user.email||'',city:upgrade.city.trim(),address:upgrade.address.trim(),
        businessType:accountType==='marchand'?upgrade.businessType:'',registrationNumber:accountType==='marchand'?upgrade.registrationNumber.trim():'',
        taxNumber:accountType==='marchand'?upgrade.taxNumber.trim():'',estimatedMonthlyVolume:accountType==='marchand'?upgrade.estimatedMonthlyVolume.trim():'',
        pointName:accountType==='agent'?upgrade.pointName.trim():'',floatEstimate:accountType==='agent'?upgrade.floatEstimate.trim():'',openingHours:accountType==='agent'?upgrade.openingHours.trim():'',
        reason:upgrade.reason.trim(),status:'pending',termsAcceptedAt:now,createdAt:now,updatedAt:now
      },{merge:true});
      setUpgradeStatus('pending');setShowUpgrade(false);toast.success('Demande envoyée à l’administration Market-Cash.');
    }catch(e){console.error('[ACCOUNT_UPGRADE_SUBMIT_ERROR]',e);toast.error("Impossible d'envoyer la demande.");}
    finally{setBusy(false)}
  };

  const field=(key:keyof UpgradeForm,placeholder:string,type='text')=><input required={['legalName','activity','city','address'].includes(key)} type={type} value={upgrade[key]} onChange={e=>setUpgrade({...upgrade,[key]:e.target.value})} placeholder={placeholder} className="w-full rounded-2xl border border-slate-200 p-4 outline-none focus:border-blue-500"/>;

  return <div className="mx-auto max-w-2xl space-y-5 p-4 pb-28 md:p-8">
    <header><p className="text-sm font-semibold text-slate-500">Compte Market-Cash</p><h1 className="mt-1 text-3xl font-black text-slate-950">Mon profil</h1></header>

    <section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-4"><div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-blue-950 text-white">{user.avatar?<img src={user.avatar} alt="Profil" className="h-full w-full object-cover"/>:<User/>}</div><div className="min-w-0"><h2 className="truncate text-xl font-black">{user.displayName}</h2><p className="truncate text-sm text-slate-500">{user.email}</p><span className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase text-slate-600">{roleLabel(user.role)}</span></div></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-slate-50 p-4"><b className="text-2xl text-blue-950">{cardCount}</b><p className="text-xs text-slate-500">Cartes</p></div><div className="rounded-2xl bg-slate-50 p-4"><b className="text-sm">{since}</b><p className="text-xs text-slate-500">Membre depuis</p></div></div></section>

    <section className={`rounded-3xl border p-5 shadow-sm ${kycStatus==='approved'?'border-emerald-200 bg-emerald-50':kycStatus==='rejected'?'border-red-200 bg-red-50':'border-amber-200 bg-amber-50'}`}><div className="flex gap-3"><ShieldCheck className={kycStatus==='approved'?'text-emerald-700':kycStatus==='rejected'?'text-red-700':'text-amber-700'}/><div><h2 className="font-black">Identité KYC</h2><p className="text-sm text-slate-600">{kycStatus==='approved'?'Votre identité est vérifiée. La page KYC est désormais fermée.':kycStatus==='pending'?'Votre dossier est en cours de vérification par l’administration.':kycStatus==='rejected'?'Votre dossier doit être corrigé puis renvoyé.':'Complétez votre identité pour utiliser les services financiers sensibles.'}</p></div></div>{kycStatus!=='approved'&&<Link to="/client/kyc" className="mt-4 inline-flex rounded-2xl bg-blue-950 px-4 py-3 text-sm font-black text-white">{kycStatus==='pending'?'Consulter mon dossier':'Compléter mon identité'}</Link>}</section>

    {user.role==='client'&&<section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex gap-3"><Store className="text-blue-800"/><div><h2 className="font-black">Compte professionnel</h2><p className="text-sm text-slate-500">Après vérification KYC, demandez un rôle Agent point de vente ou Marchand / Business. L’administration étudie chaque dossier.</p></div></div>{upgradeStatus&&<div className={`mt-4 rounded-2xl p-3 text-sm font-bold ${upgradeStatus==='approved'?'bg-emerald-50 text-emerald-700':upgradeStatus==='rejected'?'bg-red-50 text-red-700':'bg-amber-50 text-amber-800'}`}>Demande actuelle : {upgradeStatus==='pending'?'en cours d’examen':upgradeStatus==='approved'?'approuvée':'rejetée'}{upgradeReason&&<span className="mt-1 block text-xs font-medium">Motif : {upgradeReason}</span>}</div>}<button disabled={kycStatus!=='approved'||upgradeStatus==='pending'||upgradeStatus==='approved'} onClick={openUpgrade} className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-900 disabled:cursor-not-allowed disabled:opacity-40">{upgradeStatus==='rejected'?'Corriger et renvoyer ma demande':'Créer un compte Agent / Business'}</button>{kycStatus!=='approved'&&<p className="mt-2 text-xs font-bold text-amber-700">Disponible après approbation de votre identité.</p>}</section>}

    <section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex gap-3"><Shield className="text-blue-900"/><div><h2 className="font-black">Sécurité du compte</h2><p className="text-xs text-slate-500">La connexion protège votre compte. Le PIN confirme les opérations sensibles.</p></div></div><button onClick={toggleBio} className="mt-4 flex w-full items-center justify-between rounded-2xl bg-slate-50 p-4"><span className="flex items-center gap-3"><Fingerprint className="text-blue-800"/><span className="text-sm font-bold">Empreinte digitale</span></span><span className={`h-7 w-12 rounded-full p-1 ${useBiometrics?'bg-blue-950':'bg-slate-300'}`}><span className={`block h-5 w-5 rounded-full bg-white transition ${useBiometrics?'translate-x-5':''}`}/></span></button></section>

    <section className="divide-y overflow-hidden rounded-3xl border bg-white shadow-sm"><button onClick={()=>setShowEdit(true)} className="flex w-full gap-3 p-5 text-left"><Edit3 className="text-blue-800"/><span><b>Modifier mon profil</b><small className="block text-slate-500">Nom et téléphone</small></span></button><button className="flex w-full gap-3 p-5 text-left"><Key className="text-amber-700"/><span><b>Code PIN</b><small className="block text-slate-500">Utilisé uniquement pour confirmer les opérations sensibles</small></span></button><button onClick={()=>setShowLogout(true)} className="flex w-full gap-3 p-5 text-left text-red-600"><LogOut/><b>Se déconnecter</b></button></section>

    {showEdit&&<div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4"><form onSubmit={saveProfile} className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6"><div className="flex justify-between"><h3 className="text-xl font-black">Modifier mon profil</h3><button type="button" onClick={()=>setShowEdit(false)}><X/></button></div><input required value={name} onChange={e=>setName(e.target.value)} placeholder="Nom complet" className="w-full rounded-2xl border p-4"/><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Téléphone" className="w-full rounded-2xl border p-4"/><button disabled={busy} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-50">Enregistrer</button></form></div>}

    {showUpgrade&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3"><form onSubmit={submitUpgrade} className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 md:p-6"><div className="sticky top-0 z-10 flex justify-between bg-white pb-4"><div><h3 className="text-xl font-black">Demande de compte professionnel</h3><p className="text-xs text-slate-500">KYC approuvé · validation administrative obligatoire.</p></div><button type="button" onClick={()=>setShowUpgrade(false)} className="rounded-full bg-slate-100 p-2"><X/></button></div>
      <div className="space-y-3">
        <label className="block text-xs font-black uppercase text-slate-500">Type de compte<select value={accountType} onChange={e=>setAccountType(e.target.value as AccountUpgradeType)} className="mt-1 w-full rounded-2xl border p-4 text-sm normal-case"><option value="marchand">Marchand / Business</option><option value="agent">Agent point de vente Market-Cash</option></select></label>
        <div className="rounded-2xl bg-blue-50 p-3 text-xs leading-5 text-blue-950">{accountType==='marchand'?'Le compte marchand sert à recevoir les paiements de clients Market-Cash et à suivre les encaissements.':'Le compte agent point de vente sert aux dépôts et retraits clients avec un float agent contrôlé par Market-Cash.'}</div>
        {field('legalName',accountType==='marchand'?'Nom légal / responsable':'Nom complet du responsable')}
        {accountType==='marchand'&&field('tradeName','Nom commercial / enseigne')}
        {accountType==='agent'&&field('pointName','Nom du point de vente / agence')}
        {field('activity','Activité / secteur')}
        <div className="grid gap-3 sm:grid-cols-2">{field('phone','Téléphone')}{field('email','E-mail','email')}</div>
        <div className="grid gap-3 sm:grid-cols-2">{field('city','Ville')}{field('address','Adresse complète')}</div>
        {accountType==='marchand'&&<><label className="block text-xs font-black uppercase text-slate-500">Type d'activité<select value={upgrade.businessType} onChange={e=>setUpgrade({...upgrade,businessType:e.target.value})} className="mt-1 w-full rounded-2xl border p-4 text-sm normal-case"><option value="commerce">Commerce / boutique</option><option value="services">Services</option><option value="restaurant">Restaurant / hôtel</option><option value="ecommerce">E-commerce</option><option value="company">Société / entreprise</option><option value="other">Autre</option></select></label><div className="grid gap-3 sm:grid-cols-2">{field('registrationNumber','RCCM / registre (si disponible)')}{field('taxNumber','N° impôt / ID fiscal (si disponible)')}</div>{field('estimatedMonthlyVolume','Volume mensuel estimé (USD ou CDF)')}</>}
        {accountType==='agent'&&<><div className="grid gap-3 sm:grid-cols-2">{field('floatEstimate','Float initial estimé')}{field('openingHours','Horaires d’ouverture')}</div></>}
        <textarea value={upgrade.reason} onChange={e=>setUpgrade({...upgrade,reason:e.target.value})} placeholder="Pourquoi souhaitez-vous ce compte ? Informations complémentaires…" className="min-h-24 w-full rounded-2xl border p-4"/>
        <label className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-600"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} className="mt-1"/><span>Je confirme que les informations fournies sont exactes et j'accepte qu'elles soient vérifiées par l'administration Market-Cash avant activation du rôle professionnel.</span></label>
        <button disabled={busy||!accepted} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">{busy?'Envoi…':'Envoyer la demande'}</button>
      </div>
    </form></div>}

    <LogoutModal isOpen={showLogout} onClose={()=>setShowLogout(false)}/>
  </div>;
}
