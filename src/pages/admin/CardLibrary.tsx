import React,{useEffect,useMemo,useRef,useState}from'react';
import{collection,onSnapshot}from'firebase/firestore';
import{httpsCallable}from'firebase/functions';
import{db,functions}from'../../firebase/config';
import{User,UserCard}from'../../types';
import{downloadPvcCardImage}from'../../lib/pvcCardGenerator';
import toast from'react-hot-toast';
import{CreditCard,Download,Eye,Filter,Layers,Printer,RefreshCw,Search,X}from'lucide-react';

type LibraryCard=UserCard&{source?:'cards'|'local_cards';clientPhone?:string;clientName?:string;clientEmail?:string;program?:string;currency?:string};
type StatusFilter='ALL'|'ACTIVE'|'BLOCKED'|'TO_PRINT'|'PRINTED';
type TypeFilter='ALL'|'LOCAL'|'VISA'|'PHYSICAL'|'VIRTUAL';

type ProvisionResult={ok:boolean;scannedUsers:number;eligibleUsers:number;provisionedUsers:number;cardsReady:number;errors?:Array<{uid:string;message:string}>};

const clean=(value:any)=>String(value??'').trim();
const fmtDate=(value?:number)=>value?new Date(value).toLocaleString('fr-FR'):'—';
const mask=(value:string)=>{const digits=clean(value).replace(/\s/g,'');return digits?digits.match(/.{1,4}/g)?.join(' ')||digits:'—'};

export default function CardLibrary(){
 const[cards,setCards]=useState<LibraryCard[]>([]);
 const[localCards,setLocalCards]=useState<LibraryCard[]>([]);
 const[users,setUsers]=useState<Record<string,User>>({});
 const[loading,setLoading]=useState(true);
 const[queryText,setQueryText]=useState('');
 const[statusFilter,setStatusFilter]=useState<StatusFilter>('ALL');
 const[typeFilter,setTypeFilter]=useState<TypeFilter>('ALL');
 const[selected,setSelected]=useState<LibraryCard|null>(null);
 const[downloading,setDownloading]=useState('');
 const[syncingLocal,setSyncingLocal]=useState(false);
 const autoSyncAttempted=useRef(false);

 useEffect(()=>{
  let readyCards=false,readyUsers=false;
  const done=()=>{if(readyCards&&readyUsers)setLoading(false)};
  const unsubUsers=onSnapshot(collection(db,'users'),snap=>{const map:Record<string,User>={};snap.docs.forEach(d=>{map[d.id]={...(d.data()as User),uid:d.id}});setUsers(map);readyUsers=true;done()},err=>{console.error('[CARD_LIBRARY_USERS]',err);readyUsers=true;done()});
  const unsubCards=onSnapshot(collection(db,'cards'),snap=>{setCards(snap.docs.map(d=>({...d.data(),id:d.id,cardId:(d.data()as any).cardId||d.id,source:'cards'}as LibraryCard)));readyCards=true;done()},err=>{console.error('[CARD_LIBRARY_CARDS]',err);readyCards=true;done()});
  const unsubLocal=onSnapshot(collection(db,'local_cards'),snap=>{setLocalCards(snap.docs.map(d=>{const raw:any=d.data();return{...raw,id:d.id,cardId:raw.cardId||d.id,cardIdentifier:raw.cardIdentifier||`LOCAL-${d.id.slice(-8).toUpperCase()}`,network:'other',type:'virtual',status:raw.status||'active',createdAt:Number(raw.createdAt||0),updatedAt:Number(raw.updatedAt||raw.createdAt||0),source:'local_cards',program:raw.program||'market_cash_local',currency:raw.currency||''}as LibraryCard}));},err=>console.warn('[CARD_LIBRARY_LOCAL]',err));
  return()=>{unsubUsers();unsubCards();unsubLocal()};
 },[]);

 async function syncLocalCards(silent=false){
  if(syncingLocal)return;
  setSyncingLocal(true);
  try{
   const call=httpsCallable<Record<string,never>,ProvisionResult>(functions,'adminProvisionLocalCardPairsV3');
   const result=(await call({})).data;
   if(!silent)toast.success(`${result.cardsReady} cartes locales USD/CDF prêtes pour ${result.provisionedUsers} utilisateurs.`);
   if(result.errors?.length)toast.error(`${result.errors.length} compte(s) n’ont pas pu être provisionnés.`);
  }catch(error:any){
   console.error('[LOCAL_CARD_BULK_PROVISION]',error);
   if(!silent)toast.error(error?.message||'Impossible de synchroniser les cartes locales.');
  }finally{setSyncingLocal(false)}
 }

 useEffect(()=>{
  if(loading||autoSyncAttempted.current||Object.keys(users).length===0||localCards.length>0)return;
  autoSyncAttempted.current=true;
  void syncLocalCards(true);
 },[loading,users,localCards.length]);

 const allCards=useMemo(()=>[...cards,...localCards].map(card=>{const u=users[card.userId];return{...card,clientName:clean(card.userName||card.cardHolder||u?.displayName),clientEmail:clean(card.userEmail||u?.email),clientPhone:clean(u?.phone)}}).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)),[cards,localCards,users]);

 const filtered=useMemo(()=>allCards.filter(card=>{
  const isLocal=card.source==='local_cards'||card.program==='market_cash_local';
  if(typeFilter==='LOCAL'&&!isLocal)return false;
  if(typeFilter==='VISA'&&(isLocal||clean(card.network).toLowerCase()!=='visa'))return false;
  if(typeFilter==='PHYSICAL'&&card.type!=='physical')return false;
  if(typeFilter==='VIRTUAL'&&card.type!=='virtual')return false;
  if(statusFilter==='ACTIVE'&&card.status!=='active')return false;
  if(statusFilter==='BLOCKED'&&!['blocked','disabled'].includes(card.status))return false;
  if(statusFilter==='TO_PRINT'&&(card.type!=='physical'||card.printStatus==='printed'))return false;
  if(statusFilter==='PRINTED'&&card.printStatus!=='printed')return false;
  const q=queryText.trim().toLowerCase();if(!q)return true;
  return[card.cardIdentifier,card.cardId,card.cardNumber,card.cardHolder,card.clientName,card.clientEmail,card.clientPhone,card.userId,card.network,card.type,card.status,card.currency,card.agencyName,card.agencyId].some(v=>clean(v).toLowerCase().includes(q));
 }),[allCards,queryText,statusFilter,typeFilter]);

 const counts=useMemo(()=>({all:allCards.length,local:allCards.filter(c=>c.source==='local_cards'||c.program==='market_cash_local').length,visa:allCards.filter(c=>clean(c.network).toLowerCase()==='visa').length,toPrint:allCards.filter(c=>c.type==='physical'&&c.printStatus!=='printed').length,printed:allCards.filter(c=>c.printStatus==='printed').length}),[allCards]);

 async function download(card:LibraryCard){
  const id=clean(card.cardIdentifier||card.cardId||card.id||'MARKET-CASH-CARD');setDownloading(id);
  try{
   if(!card.cardNumber||!card.cardHolder)throw new Error('Cette carte ne contient pas encore toutes les données nécessaires à l’impression PVC.');
   await downloadPvcCardImage(card,`${id}-PVC-CR80.png`);toast.success(`Fichier PVC ${id} téléchargé.`)
  }catch(error:any){toast.error(error?.message||'Impossible de générer le fichier PVC.')}finally{setDownloading('')}
 }

 if(loading)return <div className="flex min-h-[420px] items-center justify-center"><div className="flex items-center gap-3 font-black text-slate-500"><Layers className="animate-spin"/>Chargement de toutes les cartes…</div></div>;

 return <div className="mx-auto max-w-7xl space-y-6 pb-20">
  <header className="rounded-[2.4rem] bg-blue-950 p-7 text-white shadow-xl"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400/20 text-amber-400"><Layers/></div><div><h1 className="text-2xl font-black uppercase sm:text-3xl">Bibliothèque des cartes</h1><p className="text-xs font-semibold text-blue-200">Toutes les cartes utilisateurs • recherche • impression PVC</p></div></div><button onClick={()=>void syncLocalCards(false)} disabled={syncingLocal} className="flex items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-blue-950 disabled:opacity-50"><RefreshCw size={17} className={syncingLocal?'animate-spin':''}/>{syncingLocal?'Synchronisation…':'Synchroniser cartes locales'}</button></div></header>

  <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
   {[['Toutes',counts.all],['Locales',counts.local],['Visa',counts.visa],['À imprimer',counts.toPrint],['Imprimées',counts.printed]].map(([label,value])=><div key={String(label)} className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-blue-950">{value}</p></div>)}
  </section>

  <section className="rounded-[2rem] border bg-white p-4 shadow-sm"><div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
   <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input value={queryText} onChange={e=>setQueryText(e.target.value)} placeholder="Nom, email, téléphone, ID carte, numéro de carte…" className="w-full rounded-2xl border bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-500"/></div>
   <div className="flex items-center gap-2 rounded-2xl border px-3"><Filter size={16} className="text-slate-400"/><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value as TypeFilter)} className="bg-transparent py-3 text-sm font-bold outline-none"><option value="ALL">Tous types</option><option value="LOCAL">Market-Cash locale</option><option value="VISA">Visa</option><option value="PHYSICAL">Physiques</option><option value="VIRTUAL">Virtuelles</option></select></div>
   <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as StatusFilter)} className="rounded-2xl border bg-white px-4 py-3 text-sm font-bold outline-none"><option value="ALL">Tous statuts</option><option value="ACTIVE">Actives</option><option value="BLOCKED">Bloquées</option><option value="TO_PRINT">À imprimer</option><option value="PRINTED">Imprimées</option></select>
  </div></section>

  {filtered.length===0?<div className="rounded-[2rem] border bg-white p-14 text-center shadow-sm"><CreditCard className="mx-auto text-slate-300" size={52}/><h2 className="mt-4 text-xl font-black">Aucune carte trouvée</h2><p className="mt-2 text-sm text-slate-500">{typeFilter==='LOCAL'?'Cliquez sur « Synchroniser cartes locales » pour provisionner les cartes USD/CDF manquantes.':'Modifiez les filtres ou la recherche.'}</p></div>:<div className="overflow-hidden rounded-[2rem] border bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full text-left"><thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500"><tr><th className="px-5 py-4">Carte</th><th className="px-5 py-4">Utilisateur</th><th className="px-5 py-4">Numéro</th><th className="px-5 py-4">Type</th><th className="px-5 py-4">Statut</th><th className="px-5 py-4">Impression</th><th className="px-5 py-4 text-right">Actions</th></tr></thead><tbody className="divide-y">{filtered.map(card=>{const id=clean(card.cardIdentifier||card.cardId||card.id);const isLocal=card.source==='local_cards'||card.program==='market_cash_local';return <tr key={`${card.source}-${card.id||card.cardId}`} className="hover:bg-slate-50"><td className="px-5 py-4"><b className="block text-sm text-blue-950">{id||'Sans ID'}</b><small className="text-slate-400">{fmtDate(card.createdAt)}</small></td><td className="px-5 py-4"><b className="block text-sm">{card.clientName||'Utilisateur'}</b><small className="block text-slate-500">{card.clientEmail||'—'}</small><small className="text-slate-400">{card.clientPhone||'—'}</small></td><td className="px-5 py-4 font-mono text-xs font-bold">{mask(card.cardNumber)}</td><td className="px-5 py-4"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-900">{isLocal?`LOCALE ${clean(card.currency).toUpperCase()}`:`${clean(card.network).toUpperCase()} ${clean(card.type).toUpperCase()}`}</span></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${card.status==='active'?'bg-emerald-50 text-emerald-700':'bg-red-50 text-red-700'}`}>{clean(card.status).toUpperCase()}</span></td><td className="px-5 py-4"><span className={`text-xs font-black ${card.printStatus==='printed'?'text-emerald-700':'text-amber-700'}`}>{card.printStatus==='printed'?'IMPRIMÉE':card.type==='physical'?'À IMPRIMER':'—'}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><button onClick={()=>setSelected(card)} className="rounded-xl border p-2 text-blue-900" title="Détails"><Eye size={17}/></button><button onClick={()=>void download(card)} disabled={downloading===id} className="flex items-center gap-2 rounded-xl bg-blue-950 px-3 py-2 text-xs font-black text-white disabled:opacity-40" title="Télécharger PVC"><Download size={16}/>{downloading===id?'…':'PVC'}</button></div></td></tr>})}</tbody></table></div></div>}

  {selected&&<div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/55 p-4"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase text-blue-700">Détail carte</p><h2 className="mt-1 text-2xl font-black text-blue-950">{selected.cardIdentifier||selected.cardId}</h2></div><button onClick={()=>setSelected(null)} className="rounded-full bg-slate-100 p-2"><X/></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{[['Titulaire',selected.clientName||selected.cardHolder],['Email',selected.clientEmail],['Téléphone',selected.clientPhone],['Numéro',mask(selected.cardNumber)],['Réseau',selected.source==='local_cards'?`Market-Cash Locale ${clean(selected.currency).toUpperCase()}`:clean(selected.network).toUpperCase()],['Type',clean(selected.type).toUpperCase()],['Statut',clean(selected.status).toUpperCase()],['Créée le',fmtDate(selected.createdAt)]].map(([k,v])=><div key={k} className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase text-slate-400">{k}</p><p className="mt-1 break-all text-sm font-black text-slate-800">{v||'—'}</p></div>)}</div><button onClick={()=>void download(selected)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-950 py-4 font-black text-white"><Printer size={18}/>Télécharger le fichier PVC prêt à imprimer</button><p className="mt-3 text-center text-[11px] text-slate-500">Export haute définition au ratio carte bancaire CR80.</p></div></div>}
 </div>
}