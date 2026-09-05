import React,{useEffect,useState}from'react';
import{Building2,Code2,FileCheck2,IdCard,Layers3,MapPin,Store,UploadCloud}from'lucide-react';
import{doc,onSnapshot}from'firebase/firestore';
import{ref,uploadBytes}from'firebase/storage';
import toast from'react-hot-toast';
import{db,storage}from'../../firebase/config';
import{useAuthStore}from'../../store/authStore';
import{businessUpgradeService}from'../../services/businessUpgradeService';
import{AccountUpgradeType}from'../../types';

const options=[
 {id:'marchand' as AccountUpgradeType,title:'Marchand / Business',text:'Encaissez les paiements Market-Cash dans votre entreprise.',icon:Building2},
 {id:'agent' as AccountUpgradeType,title:'Agent Market-Cash',text:'Devenez un point de service Market-Cash.',icon:Store},
 {id:'developer_direct' as AccountUpgradeType,title:"Développeur d’application",text:'Intégrez Market-Cash dans vos propres applications.',icon:Code2},
 {id:'api_partner' as AccountUpgradeType,title:'Partenaire API',text:'Distribuez les services Market-Cash à vos développeurs.',icon:Layers3},
];
const label=(t:AccountUpgradeType)=>options.find(x=>x.id===t)?.title||t;
const safeName=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'-').replace(/-+/g,'-').slice(-80)||'document';
const maxIdentityBytes=12*1024*1024;
const maxCompanyBytes=15*1024*1024;

export default function ProfessionalAccount(){
 const{user}=useAuthStore();
 const[type,setType]=useState<AccountUpgradeType>('marchand');
 const[companyName,setCompanyName]=useState('');
 const[address,setAddress]=useState('');
 const[identityFile,setIdentityFile]=useState<File|null>(null);
 const[companyFile,setCompanyFile]=useState<File|null>(null);
 const[status,setStatus]=useState('');
 const[reason,setReason]=useState('');
 const[busy,setBusy]=useState(false);

 useEffect(()=>{if(!user)return;return onSnapshot(doc(db,'account_upgrade_requests',user.uid),s=>{if(!s.exists()){setStatus('');return}const d=s.data();setStatus(String(d.status||'pending'));setReason(String(d.rejectionReason||''));if(d.requestedType)setType(d.requestedType as AccountUpgradeType);if(d.companyName)setCompanyName(String(d.companyName));if(d.address)setAddress(String(d.address))},()=>{})},[user?.uid]);
 if(!user)return null;

 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();
  if(!companyName.trim()||!address.trim())return toast.error("Indiquez le nom et l’adresse de l’entreprise.");
  if(!identityFile)return toast.error("Ajoutez votre pièce d’identité.");
  if(!companyFile)return toast.error("Ajoutez le document PDF de l’entreprise.");
  const identityType=identityFile.type.toLowerCase();
  if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(identityType))return toast.error("La pièce d’identité doit être une image ou un PDF.");
  if(identityFile.size>maxIdentityBytes)return toast.error("La pièce d’identité dépasse 12 Mo.");
  if(companyFile.type!=='application/pdf')return toast.error("Le document de l’entreprise doit être au format PDF.");
  if(companyFile.size>maxCompanyBytes)return toast.error("Le document de l’entreprise dépasse 15 Mo.");
  setBusy(true);
  try{
   const now=Date.now();
   const identityRef=ref(storage,`business-upgrades/${user.uid}/identity/${now}-${safeName(identityFile.name)}`);
   const companyRef=ref(storage,`business-upgrades/${user.uid}/company/${now}-${safeName(companyFile.name.endsWith('.pdf')?companyFile.name:`${companyFile.name}.pdf`)}`);
   await uploadBytes(identityRef,identityFile,{contentType:identityFile.type});
   await uploadBytes(companyRef,companyFile,{contentType:'application/pdf'});
   await businessUpgradeService.submit({
    requestedType:type,
    companyName:companyName.trim(),
    address:address.trim(),
    identityDocumentPath:identityRef.fullPath,
    identityDocumentName:identityFile.name,
    companyDocumentPath:companyRef.fullPath,
    companyDocumentName:companyFile.name,
   });
   setStatus('pending');
   toast.success(`Demande ${label(type)} envoyée.`);
  }catch(error:any){toast.error(error?.message||"Impossible d'envoyer la demande.")}finally{setBusy(false)}
 };

 if(status==='pending')return <div className="mx-auto max-w-2xl p-4 pb-28 md:p-8"><div className="rounded-[2rem] border border-blue-200 bg-blue-50 p-6"><p className="text-xs font-black uppercase tracking-widest text-blue-700">Vérification professionnelle</p><h1 className="mt-2 text-2xl font-black">Demande {label(type)} en cours</h1><p className="mt-2 text-sm text-slate-600">Vos documents sont en cours de vérification. Votre compte changera automatiquement après approbation.</p></div></div>;

 return <div className="mx-auto max-w-3xl space-y-5 p-4 pb-28 md:p-8">
  <header><p className="text-sm font-semibold text-slate-500">Évolution du compte</p><h1 className="mt-1 text-3xl font-black">Passer au compte professionnel</h1><p className="mt-2 text-sm text-slate-500">Votre compte client reste utilisable sans KYC. Une vérification documentaire est demandée uniquement pour le passage au compte professionnel.</p></header>
  {status==='rejected'&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><b>Demande précédente rejetée.</b> {reason}</div>}
  <section className="grid gap-3 sm:grid-cols-2">{options.map(o=>{const I=o.icon;const active=type===o.id;return <button key={o.id} type="button" onClick={()=>setType(o.id)} className={`rounded-[1.75rem] border p-5 text-left transition ${active?'border-blue-950 bg-blue-50 ring-2 ring-blue-100':'bg-white hover:border-slate-300'}`}><I className="text-blue-900"/><h2 className="mt-3 font-black">{o.title}</h2><p className="mt-2 text-xs leading-5 text-slate-500">{o.text}</p></button>})}</section>
  <form onSubmit={submit} className="rounded-[2rem] border bg-white p-5 shadow-sm">
   <div className="mb-5"><p className="text-xs font-black uppercase tracking-wider text-blue-700">{label(type)}</p><h2 className="mt-1 text-xl font-black">Documents de vérification</h2><p className="mt-1 text-sm text-slate-500">Seulement quatre éléments sont demandés.</p></div>
   <div className="space-y-3">
    <label className="block"><span className="mb-2 flex items-center gap-2 text-sm font-black"><Building2 size={16}/>Nom de l’entreprise</span><input value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="Nom de l’entreprise *" className="w-full rounded-2xl border p-4 outline-none focus:border-blue-500"/></label>
    <label className="block"><span className="mb-2 flex items-center gap-2 text-sm font-black"><MapPin size={16}/>Adresse</span><input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Adresse de l’entreprise *" className="w-full rounded-2xl border p-4 outline-none focus:border-blue-500"/></label>
    <FileField icon={<IdCard size={18}/>} title="Pièce d’identité" hint="JPG, PNG, WebP ou PDF · 12 Mo max" accept="image/jpeg,image/png,image/webp,application/pdf" file={identityFile} onChange={setIdentityFile}/>
    <FileField icon={<FileCheck2 size={18}/>} title="Document de l’entreprise" hint="PDF uniquement · 15 Mo max" accept="application/pdf" file={companyFile} onChange={setCompanyFile}/>
   </div>
   <button disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-950 p-4 font-black text-white disabled:opacity-40"><UploadCloud size={19}/>{busy?'Envoi des documents…':`Envoyer la demande ${label(type)}`}</button>
  </form>
 </div>;
}

function FileField({icon,title,hint,accept,file,onChange}:{icon:React.ReactNode;title:string;hint:string;accept:string;file:File|null;onChange:(file:File|null)=>void}){
 return <label className="block cursor-pointer rounded-2xl border border-dashed p-4 transition hover:border-blue-400 hover:bg-blue-50/40"><span className="flex items-center gap-2 font-black">{icon}{title}</span><span className="mt-1 block text-xs text-slate-500">{hint}</span><input type="file" accept={accept} onChange={e=>onChange(e.target.files?.[0]||null)} className="mt-3 block w-full text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-blue-950 file:px-4 file:py-2 file:font-bold file:text-white"/>{file&&<span className="mt-2 block truncate text-xs font-semibold text-emerald-700">Sélectionné : {file.name}</span>}</label>
}
