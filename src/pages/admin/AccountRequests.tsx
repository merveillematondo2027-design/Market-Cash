import React,{useEffect,useState}from'react';
import{addDoc,collection,doc,getDocs,query,setDoc,updateDoc,where}from'firebase/firestore';
import{Building2,ExternalLink,MapPin,ShieldCheck,Store,UserCog,Users}from'lucide-react';
import toast from'react-hot-toast';
import{db}from'../../firebase/config';
import{useAuthStore}from'../../store/authStore';

const fmt=(value?:number)=>value?new Date(value).toLocaleString('fr-FR'):'—';
async function hashPin(value:string){const encoded=new TextEncoder().encode(value);const buffer=await crypto.subtle.digest('SHA-256',encoded);return Array.from(new Uint8Array(buffer)).map(b=>b.toString(16).padStart(2,'0')).join('')}

export default function AccountRequests(){
  const{user}=useAuthStore();
  const[kyc,setKyc]=useState<any[]>([]);
  const[upgrades,setUpgrades]=useState<any[]>([]);
  const[staff,setStaff]=useState<any[]>([]);
  const[staffEmail,setStaffEmail]=useState('');
  const[loading,setLoading]=useState(true);
  const[actionId,setActionId]=useState('');

  const load=async()=>{
    setLoading(true);
    try{
      const[k,u,s]=await Promise.all([
        getDocs(query(collection(db,'kyc_requests'),where('status','==','pending'))),
        getDocs(query(collection(db,'account_upgrade_requests'),where('status','==','pending'))),
        getDocs(query(collection(db,'users'),where('role','==','agent_administratif'))),
      ]);
      setKyc(k.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>Number(a.createdAt||0)-Number(b.createdAt||0)));
      setUpgrades(u.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>Number(a.createdAt||0)-Number(b.createdAt||0)));
      setStaff(s.docs.map(d=>({id:d.id,...d.data()})).sort((a:any,b:any)=>String(a.displayName||'').localeCompare(String(b.displayName||''),'fr')));
    }catch(e){console.error('[ACCOUNT_REQUESTS_LOAD_ERROR]',e);toast.error('Impossible de charger les demandes.');}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[]);

  const notify=async(userId:string,title:string,message:string,type:'success'|'error'|'info')=>{
    try{await addDoc(collection(db,'notifications'),{userId,title,message,type,category:'general',read:false,createdAt:Date.now()})}catch{}
  };

  const reviewKyc=async(r:any,status:'approved'|'rejected')=>{
    if(actionId)return;
    let rejectionReason='';
    if(status==='rejected'){
      rejectionReason=window.prompt('Motif du rejet KYC :','Photo ou document à corriger.')?.trim()||'';
      if(!rejectionReason)return;
    }
    setActionId(`kyc:${r.id}`);
    try{
      const now=Date.now();
      await updateDoc(doc(db,'kyc_requests',r.id),{status,rejectionReason,reviewedAt:now,reviewedBy:user?.uid||'',updatedAt:now});
      await updateDoc(doc(db,'users',r.userId),{kycStatus:status,updatedAt:now});
      await notify(r.userId,status==='approved'?'Identité vérifiée':'Dossier KYC à corriger',status==='approved'?'Votre identité Market-Cash a été approuvée.':`Votre dossier KYC a été rejeté. Motif : ${rejectionReason}`,status==='approved'?'success':'error');
      toast.success(status==='approved'?'KYC approuvé.':'KYC rejeté.');await load();
    }catch(e){console.error('[KYC_REVIEW_ERROR]',e);toast.error('Action impossible.');}
    finally{setActionId('')}
  };

  const reviewUpgrade=async(r:any,status:'approved'|'rejected')=>{
    if(actionId)return;
    let rejectionReason='';
    if(status==='rejected'){
      rejectionReason=window.prompt('Motif du rejet :','Informations professionnelles insuffisantes.')?.trim()||'';
      if(!rejectionReason)return;
    }
    setActionId(`upgrade:${r.id}`);
    try{
      const now=Date.now();
      const nextRole=r.requestedType==='marchand'?'marchand':'agent';
      await updateDoc(doc(db,'account_upgrade_requests',r.id),{status,rejectionReason,reviewedAt:now,reviewedBy:user?.uid||'',updatedAt:now});
      if(status==='approved'){
        if(nextRole==='agent'){
          const temporaryPinHash=await hashPin('1234');
          await updateDoc(doc(db,'users',r.userId),{role:'agent',pinHash:'',temporaryPinHash,mustChangePin:true,pinChangedAt:0,updatedAt:now});
          await setDoc(doc(db,'agent_profiles',r.userId),{userId:r.userId,status:'active',legalName:r.legalName||'',pointName:r.pointName||'',activity:r.activity||'',phone:r.phone||'',email:r.email||'',city:r.city||'',address:r.address||'',floatEstimate:r.floatEstimate||'',openingHours:r.openingHours||'',approvedBy:user?.uid||'',approvedAt:now,createdAt:now,updatedAt:now},{merge:true});
          await notify(r.userId,'Compte Agent activé','Votre compte Agent est approuvé. Code temporaire : 1234. Vous devez créer un nouveau code avant d’utiliser le terminal.','success');
        }else{
          await updateDoc(doc(db,'users',r.userId),{role:'marchand',updatedAt:now});
          await setDoc(doc(db,'merchant_profiles',r.userId),{userId:r.userId,status:'active',legalName:r.legalName||'',tradeName:r.tradeName||'',activity:r.activity||'',businessType:r.businessType||'',phone:r.phone||'',email:r.email||'',city:r.city||'',address:r.address||'',registrationNumber:r.registrationNumber||'',taxNumber:r.taxNumber||'',estimatedMonthlyVolume:r.estimatedMonthlyVolume||'',approvedBy:user?.uid||'',approvedAt:now,createdAt:now,updatedAt:now},{merge:true});
          await notify(r.userId,'Compte Marchand activé','Votre compte Marchand / Business Market-Cash est approuvé.','success');
        }
      }else await notify(r.userId,'Demande de compte professionnel rejetée',`Votre demande a été rejetée. Motif : ${rejectionReason}`,'error');
      toast.success(status==='approved'?'Compte professionnel approuvé.':'Demande rejetée.');await load();
    }catch(e){console.error('[ACCOUNT_UPGRADE_REVIEW_ERROR]',e);toast.error('Action impossible.');}
    finally{setActionId('')}
  };

  const promoteAdministrativeAgent=async()=>{
    if(user?.role!=='admin_general')return toast.error('Réservé à l’Administrateur Général.');
    const email=staffEmail.trim().toLowerCase();if(!email)return toast.error('Saisissez un e-mail.');
    setActionId('staff:promote');
    try{
      const snap=await getDocs(query(collection(db,'users'),where('email','==',email)));
      if(snap.empty)throw new Error('Compte introuvable.');
      const target=snap.docs[0],data=target.data();
      if(data.role==='admin_general')throw new Error('Compte Administrateur Général non modifiable.');
      if(data.role!=='client'&&data.role!=='agent_administratif')throw new Error('Choisissez un compte Client.');
      await updateDoc(doc(db,'users',target.id),{role:'agent_administratif',updatedAt:Date.now()});
      await notify(target.id,'Accès administratif activé','Votre espace opérationnel administratif Market-Cash est actif.','success');
      setStaffEmail('');toast.success('Agent administratif activé.');await load();
    }catch(e:any){toast.error(e?.message||'Action impossible.');}
    finally{setActionId('')}
  };

  const demoteAdministrativeAgent=async(target:any)=>{
    if(user?.role!=='admin_general'||!window.confirm(`Retirer l'accès à ${target.displayName||target.email} ?`))return;
    setActionId(`staff:${target.id}`);
    try{await updateDoc(doc(db,'users',target.id),{role:'client',updatedAt:Date.now()});await notify(target.id,'Accès administratif retiré','Votre compte redevient Client Market-Cash.','info');toast.success('Accès retiré.');await load()}
    catch(e:any){toast.error(e?.message||'Modification impossible.')}finally{setActionId('')}
  };

  return <div className="space-y-5 pb-20">
    <header><p className="text-xs font-black uppercase tracking-wider text-amber-600">Conformité</p><h1 className="text-2xl font-black text-blue-950">KYC & comptes</h1></header>
    {loading?<div className="rounded-2xl bg-white p-6">Chargement…</div>:<>
      <section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><ShieldCheck className="text-blue-800"/><div><h2 className="font-black">KYC en attente</h2><p className="text-xs text-slate-500">{kyc.length} dossier(s)</p></div></div><div className="mt-4 space-y-3">{kyc.length===0?<Empty/>:kyc.map(r=><article key={r.id} className="rounded-2xl border p-4"><div className="flex flex-col gap-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-black">{r.fullName}</h3><p className="text-sm text-slate-500">{r.phone} · {r.city}, {r.country}</p><p className="mt-1 text-xs text-slate-400">{r.documentType} · {r.documentNumber} · {fmt(r.createdAt)}</p></div><div className="flex gap-2"><button disabled={!!actionId} onClick={()=>reviewKyc(r,'rejected')} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-40">Rejeter</button><button disabled={!!actionId} onClick={()=>reviewKyc(r,'approved')} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Approuver</button></div></div><div className="grid gap-3 sm:grid-cols-2"><Evidence title="Pièce d'identité" url={r.documentFrontUrl}/><Evidence title="Portrait" url={r.selfieUrl}/></div></div></article>)}</div></section>

      <section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><UserCog className="text-blue-800"/><div><h2 className="font-black">Agent / Marchand</h2><p className="text-xs text-slate-500">{upgrades.length} demande(s)</p></div></div><div className="mt-4 space-y-3">{upgrades.length===0?<Empty/>:upgrades.map(r=><article key={r.id} className="rounded-2xl border p-4"><div className="flex flex-col gap-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2">{r.requestedType==='marchand'?<Building2 size={17}/>:<Store size={17}/>}<h3 className="font-black">{r.tradeName||r.pointName||r.legalName}</h3></div><p className="mt-1 text-sm text-slate-500">{r.requestedType==='marchand'?'Marchand / Business':'Agent point de vente'} · {r.phone}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12}/>{r.city} · {r.address}</p></div><div className="flex gap-2"><button disabled={!!actionId} onClick={()=>reviewUpgrade(r,'rejected')} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-40">Rejeter</button><button disabled={!!actionId} onClick={()=>reviewUpgrade(r,'approved')} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Approuver</button></div></div><div className="grid gap-2 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600 sm:grid-cols-2"><Info label="Responsable" value={r.legalName}/><Info label="Activité" value={r.activity}/><Info label="E-mail" value={r.email}/>{r.requestedType==='marchand'?<><Info label="RCCM / registre" value={r.registrationNumber}/><Info label="Volume estimé" value={r.estimatedMonthlyVolume}/></>:<><Info label="Float estimé" value={r.floatEstimate}/><Info label="Horaires" value={r.openingHours}/></>}</div></div></article>)}</div></section>

      {user?.role==='admin_general'&&<section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><Users className="text-blue-800"/><div><h2 className="font-black">Agents administratifs</h2><p className="text-xs text-slate-500">Accès KYC et validations.</p></div></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={staffEmail} onChange={e=>setStaffEmail(e.target.value)} type="email" placeholder="E-mail d'un compte Client" className="min-w-0 flex-1 rounded-2xl border p-3"/><button disabled={!!actionId} onClick={promoteAdministrativeAgent} className="rounded-2xl bg-blue-950 px-5 py-3 text-sm font-black text-white disabled:opacity-40">Ajouter</button></div><div className="mt-4 space-y-2">{staff.map(member=><div key={member.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"><div className="min-w-0"><p className="truncate text-sm font-black">{member.displayName||'Agent administratif'}</p><p className="truncate text-xs text-slate-500">{member.email}</p></div><button disabled={!!actionId} onClick={()=>demoteAdministrativeAgent(member)} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700">Retirer</button></div>)}</div></section>}
    </>}
  </div>
}

function Evidence({title,url}:{title:string;url?:string}){return <div className="rounded-2xl bg-slate-50 p-3"><div className="flex items-center justify-between"><p className="text-xs font-black text-slate-500">{title}</p>{url&&<a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-blue-800">Ouvrir <ExternalLink size={13}/></a>}</div>{url?<img src={url} alt={title} className="mt-3 h-44 w-full rounded-xl border bg-white object-contain"/>:<p className="mt-3 text-xs text-red-600">Image manquante</p>}</div>}
function Empty(){return <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Aucune demande en attente.</div>}
function Info({label,value}:{label:string;value:any}){return <div><b>{label} :</b> {String(value||'—')}</div>}
