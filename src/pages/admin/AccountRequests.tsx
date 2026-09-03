import React,{useEffect,useState}from'react';
import{addDoc,collection,doc,getDocs,query,setDoc,updateDoc,where}from'firebase/firestore';
import{BadgeCheck,Building2,ExternalLink,MapPin,ShieldCheck,Store,UserCog}from'lucide-react';
import toast from'react-hot-toast';
import{db}from'../../firebase/config';
import{useAuthStore}from'../../store/authStore';

const fmt=(value?:number)=>value?new Date(value).toLocaleString('fr-FR'):'—';

export default function AccountRequests(){
  const{user}=useAuthStore();
  const[kyc,setKyc]=useState<any[]>([]);
  const[upgrades,setUpgrades]=useState<any[]>([]);
  const[loading,setLoading]=useState(true);
  const[actionId,setActionId]=useState('');

  const load=async()=>{
    setLoading(true);
    try{
      const[k,u]=await Promise.all([
        getDocs(query(collection(db,'kyc_requests'),where('status','==','pending'))),
        getDocs(query(collection(db,'account_upgrade_requests'),where('status','==','pending')))
      ]);
      setKyc(k.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>Number(a.createdAt||0)-Number(b.createdAt||0)));
      setUpgrades(u.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>Number(a.createdAt||0)-Number(b.createdAt||0)));
    }catch(e){console.error('[ACCOUNT_REQUESTS_LOAD_ERROR]',e);toast.error('Impossible de charger les demandes.');}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[]);

  const notify=async(userId:string,title:string,message:string,type:'success'|'error'|'info')=>{
    try{await addDoc(collection(db,'notifications'),{userId,title,message,type,category:'general',read:false,createdAt:Date.now()});}
    catch(e){console.warn('[ACCOUNT_REQUEST_NOTIFICATION_ERROR]',e)}
  };

  const reviewKyc=async(r:any,status:'approved'|'rejected')=>{
    if(actionId)return;
    let rejectionReason='';
    if(status==='rejected'){
      rejectionReason=window.prompt('Motif du rejet KYC (visible par le client) :','Photo ou document à corriger.')?.trim()||'';
      if(!rejectionReason)return;
    }
    setActionId(`kyc:${r.id}`);
    try{
      const now=Date.now();
      await updateDoc(doc(db,'kyc_requests',r.id),{status,rejectionReason,reviewedAt:now,reviewedBy:user?.uid||'',updatedAt:now});
      await updateDoc(doc(db,'users',r.userId),{kycStatus:status,updatedAt:now});
      await notify(r.userId,status==='approved'?'Identité vérifiée':'Dossier KYC à corriger',status==='approved'?'Votre identité Market-Cash a été approuvée. Vous pouvez utiliser les services soumis au KYC.':`Votre dossier KYC a été rejeté. Motif : ${rejectionReason}` ,status==='approved'?'success':'error');
      toast.success(status==='approved'?'KYC approuvé.':'KYC rejeté.');
      await load();
    }catch(e){console.error('[KYC_REVIEW_ERROR]',e);toast.error('Action impossible.');}
    finally{setActionId('')}
  };

  const reviewUpgrade=async(r:any,status:'approved'|'rejected')=>{
    if(actionId)return;
    let rejectionReason='';
    if(status==='rejected'){
      rejectionReason=window.prompt('Motif du rejet (visible par le demandeur) :','Informations professionnelles insuffisantes.')?.trim()||'';
      if(!rejectionReason)return;
    }
    setActionId(`upgrade:${r.id}`);
    try{
      const now=Date.now();
      const nextRole=r.requestedType==='marchand'?'marchand':'agent';
      await updateDoc(doc(db,'account_upgrade_requests',r.id),{status,rejectionReason,reviewedAt:now,reviewedBy:user?.uid||'',updatedAt:now});

      if(status==='approved'){
        await updateDoc(doc(db,'users',r.userId),{role:nextRole,updatedAt:now});
        if(nextRole==='agent'){
          await setDoc(doc(db,'agent_profiles',r.userId),{
            userId:r.userId,status:'active',legalName:r.legalName||'',pointName:r.pointName||'',activity:r.activity||'',phone:r.phone||'',email:r.email||'',city:r.city||'',address:r.address||'',floatEstimate:r.floatEstimate||'',openingHours:r.openingHours||'',approvedBy:user?.uid||'',approvedAt:now,createdAt:now,updatedAt:now
          },{merge:true});
        }else{
          await setDoc(doc(db,'merchant_profiles',r.userId),{
            userId:r.userId,status:'active',legalName:r.legalName||'',tradeName:r.tradeName||'',activity:r.activity||'',businessType:r.businessType||'',phone:r.phone||'',email:r.email||'',city:r.city||'',address:r.address||'',registrationNumber:r.registrationNumber||'',taxNumber:r.taxNumber||'',estimatedMonthlyVolume:r.estimatedMonthlyVolume||'',approvedBy:user?.uid||'',approvedAt:now,createdAt:now,updatedAt:now
          },{merge:true});
        }
        await notify(r.userId,nextRole==='agent'?'Compte Agent activé':'Compte Marchand activé',nextRole==='agent'?'Votre compte Agent point de vente Market-Cash est approuvé. Vous pouvez accéder au terminal dépôt/retrait.':'Votre compte Marchand / Business Market-Cash est approuvé. Vous pouvez recevoir les paiements clients.','success');
      }else{
        await notify(r.userId,'Demande de compte professionnel rejetée',`Votre demande a été rejetée. Motif : ${rejectionReason}`,'error');
      }

      toast.success(status==='approved'?'Type de compte approuvé.':'Demande rejetée.');
      await load();
    }catch(e){console.error('[ACCOUNT_UPGRADE_REVIEW_ERROR]',e);toast.error('Action impossible.');}
    finally{setActionId('')}
  };

  return <div className="space-y-6 pb-20">
    <header><p className="text-sm font-semibold text-slate-500">Conformité et comptes</p><h1 className="text-2xl font-black text-blue-950">KYC & comptes professionnels</h1><p className="mt-1 text-sm text-slate-500">Validez l’identité, puis autorisez les comptes Agent point de vente ou Marchand / Business.</p></header>
    {loading?<div className="rounded-2xl bg-white p-6">Chargement...</div>:<>
      <section className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3"><ShieldCheck className="text-blue-800"/><div><h2 className="font-black">KYC en attente</h2><p className="text-xs text-slate-500">{kyc.length} dossier(s)</p></div></div>
        <div className="mt-4 space-y-3">{kyc.length===0?<Empty/>:kyc.map(r=><article key={r.id} className="rounded-2xl border p-4"><div className="flex flex-col gap-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-black">{r.fullName}</h3><p className="text-sm text-slate-500">{r.phone} · {r.city}, {r.country}</p><p className="mt-2 text-xs text-slate-500">{r.documentType} · {r.documentNumber}</p><p className="mt-1 text-[11px] text-slate-400">Envoyé : {fmt(r.createdAt)}</p></div><div className="flex gap-2"><button disabled={!!actionId} onClick={()=>reviewKyc(r,'rejected')} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-40">Rejeter</button><button disabled={!!actionId} onClick={()=>reviewKyc(r,'approved')} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Approuver</button></div></div><div className="grid gap-3 sm:grid-cols-2"><Evidence title="Pièce d'identité" url={r.documentFrontUrl}/><Evidence title="Portrait" url={r.selfieUrl}/></div></div></article>)}</div>
      </section>

      <section className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3"><UserCog className="text-blue-800"/><div><h2 className="font-black">Demandes Agent / Marchand</h2><p className="text-xs text-slate-500">{upgrades.length} demande(s)</p></div></div>
        <div className="mt-4 space-y-3">{upgrades.length===0?<Empty/>:upgrades.map(r=><article key={r.id} className="rounded-2xl border p-4"><div className="flex flex-col gap-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2">{r.requestedType==='marchand'?<Building2 size={17}/>:<Store size={17}/>}<h3 className="font-black">{r.tradeName||r.pointName||r.legalName}</h3></div><p className="text-sm text-slate-500">Demande : <b>{r.requestedType==='marchand'?'Marchand / Business':'Agent point de vente'}</b></p><p className="mt-1 text-xs text-slate-500">Responsable : {r.legalName} · {r.phone||'Téléphone non renseigné'}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12}/>{r.city} · {r.address}</p></div><div className="flex gap-2"><button disabled={!!actionId} onClick={()=>reviewUpgrade(r,'rejected')} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-40">Rejeter</button><button disabled={!!actionId} onClick={()=>reviewUpgrade(r,'approved')} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Approuver</button></div></div>
          <div className="grid gap-2 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600 sm:grid-cols-2"><Info label="Activité" value={r.activity}/><Info label="E-mail" value={r.email}/>{r.requestedType==='marchand'?<><Info label="Type d'activité" value={r.businessType}/><Info label="RCCM / registre" value={r.registrationNumber}/><Info label="Identifiant fiscal" value={r.taxNumber}/><Info label="Volume estimé" value={r.estimatedMonthlyVolume}/></>:<><Info label="Point de vente" value={r.pointName}/><Info label="Float estimé" value={r.floatEstimate}/><Info label="Horaires" value={r.openingHours}/></>}<Info label="Motif" value={r.reason}/><Info label="Envoyé" value={fmt(r.createdAt)}/></div>
        </div></article>)}</div>
      </section>
    </>}
  </div>
}

function Evidence({title,url}:{title:string;url?:string}){return <div className="rounded-2xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>{url&&<a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-blue-800">Ouvrir <ExternalLink size={13}/></a>}</div>{url?<img src={url} alt={title} className="mt-3 h-48 w-full rounded-xl border bg-white object-contain"/>:<p className="mt-3 text-xs font-bold text-red-600">Image manquante</p>}</div>}
function Empty(){return <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500"><BadgeCheck className="mx-auto mb-2 text-slate-400"/>Aucune demande en attente.</div>}
function Info({label,value}:{label:string;value?:string}){return <div><span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</span><span className="font-semibold text-slate-700">{value||'—'}</span></div>}
