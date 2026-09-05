import React,{useEffect,useMemo,useState}from'react';
import{Code2,KeyRound,RefreshCw,ServerCog,Settings2,ShieldCheck,Users,WalletCards}from'lucide-react';
import toast from'react-hot-toast';
import{developerBusinessService,DeveloperDashboard}from'../../services/developerBusinessService';
import{useAuthStore}from'../../store/authStore';

const money=(n:any,c:string)=>`${Number(n||0).toLocaleString('fr-FR',{maximumFractionDigits:2})} ${c}`;
const FEATURE_LABELS:Record<string,string>={
 'payments.create':'Créer des paiements',
 'transactions.read':'Lire les transactions',
 'balance.read':'Lire les soldes',
 'developers.create':'Créer des sous-développeurs',
 'developers.read':'Lire les sous-développeurs',
};
const DEFAULT_DIRECT=['payments.create','transactions.read','balance.read'];
const DEFAULT_PROVIDER=[...DEFAULT_DIRECT,'developers.create','developers.read'];

export default function BusinessDeveloper(){
 const{user}=useAuthStore();
 const[data,setData]=useState<DeveloperDashboard|null>(null);
 const[subDevelopers,setSubDevelopers]=useState<any[]>([]);
 const[loading,setLoading]=useState(true);
 const[appName,setAppName]=useState('');
 const[newKey,setNewKey]=useState('');
 const[busy,setBusy]=useState(false);
 const[busyAppId,setBusyAppId]=useState('');
 const[subCompany,setSubCompany]=useState('');
 const[subEmail,setSubEmail]=useState('');
 const[settingsOpen,setSettingsOpen]=useState<string>('');
 const[draftSettings,setDraftSettings]=useState<Record<string,{apiEnabled:boolean;enabledFeatures:string[];allowedCurrencies:string[]}>>({});

 const load=async()=>{
  setLoading(true);
  try{
   const d=await developerBusinessService.dashboard();
   setData(d);
   const drafts:Record<string,{apiEnabled:boolean;enabledFeatures:string[];allowedCurrencies:string[]}>={};
   (d.apps||[]).forEach((a:any)=>{
    const providerApp=a.businessType==='api_provider';
    drafts[a.appId]={
     apiEnabled:a.apiEnabled!==false&&a.status!=='disabled',
     enabledFeatures:Array.isArray(a.enabledFeatures)&&a.enabledFeatures.length?a.enabledFeatures:(Array.isArray(a.scopes)&&a.scopes.length?a.scopes:(providerApp?DEFAULT_PROVIDER:DEFAULT_DIRECT)),
     allowedCurrencies:Array.isArray(a.allowedCurrencies)&&a.allowedCurrencies.length?a.allowedCurrencies:['USD','CDF'],
    };
   });
   setDraftSettings(drafts);
   if(d.developer?.businessType==='api_provider'){
    const s=await developerBusinessService.listSubDevelopers();
    setSubDevelopers(s.developers||[]);
   }else setSubDevelopers([]);
  }catch(e:any){
   setData(null);
   toast.error(e?.message||'Impossible de charger la console Developer.');
  }finally{setLoading(false)}
 };
 useEffect(()=>{void load()},[user?.uid]);

 const createApp=async(e?:React.FormEvent)=>{
  e?.preventDefault();
  const name=appName.trim();
  if(name.length<2){toast.error('Entrez un nom d’application.');return}
  if(busy)return;
  setBusy(true);
  setNewKey('');
  const waiting=toast.loading('Création de l’application et de la clé API…');
  try{
   const r=await developerBusinessService.registerApp(name);
   setNewKey(r.apiKey);
   setAppName('');
   toast.success('Application et clé API créées.',{id:waiting});
   await load();
  }catch(e:any){
   console.error('[DEVELOPER_APP_CREATE_FAILED]',e);
   toast.error(e?.message||'Création impossible. Vérifiez que les Functions Developer sont déployées.',{id:waiting});
  }finally{setBusy(false)}
 };

 const createSub=async(e:React.FormEvent)=>{e.preventDefault();if(!subCompany.trim()||!subEmail.trim())return;setBusy(true);try{await developerBusinessService.createSubDeveloper({companyName:subCompany.trim(),contactEmail:subEmail.trim()});setSubCompany('');setSubEmail('');toast.success('Sous-compte développeur créé.');void load()}catch(e:any){toast.error(e?.message||'Création impossible.')}finally{setBusy(false)}};

 const toggleFeature=(appId:string,feature:string)=>setDraftSettings(prev=>{
  const current=prev[appId];if(!current)return prev;
  const exists=current.enabledFeatures.includes(feature);
  return{...prev,[appId]:{...current,enabledFeatures:exists?current.enabledFeatures.filter(f=>f!==feature):[...current.enabledFeatures,feature]}};
 });
 const toggleCurrency=(appId:string,currency:string)=>setDraftSettings(prev=>{
  const current=prev[appId];if(!current)return prev;
  const exists=current.allowedCurrencies.includes(currency);
  return{...prev,[appId]:{...current,allowedCurrencies:exists?current.allowedCurrencies.filter(c=>c!==currency):[...current.allowedCurrencies,currency]}};
 });
 const saveSettings=async(appId:string)=>{
  const settings=draftSettings[appId];if(!settings)return;
  setBusyAppId(appId);
  const waiting=toast.loading('Enregistrement des paramètres API…');
  try{
   await developerBusinessService.updateAppSettings({appId,...settings});
   toast.success('Paramètres API enregistrés.',{id:waiting});
   setSettingsOpen('');
   await load();
  }catch(e:any){toast.error(e?.message||'Impossible d’enregistrer les paramètres.',{id:waiting})}finally{setBusyAppId('')}
 };

 if(loading)return <div className="mx-auto max-w-3xl p-6"><div className="h-40 animate-pulse rounded-[2rem] bg-slate-200"/></div>;
 const dev=data?.developer;const active=dev?.status==='active';const provider=dev?.businessType==='api_provider';
 if(!dev)return <div className="mx-auto max-w-2xl p-5"><div className="rounded-[2rem] border bg-white p-6"><ShieldCheck className="text-blue-900"/><h1 className="mt-4 text-2xl font-black">Profil Developer en synchronisation</h1><p className="mt-2 text-sm text-slate-500">Votre type de compte est déjà validé. Actualisez pour récupérer votre espace Market-Cash Developer.</p><button onClick={load} className="mt-5 flex items-center gap-2 rounded-xl bg-blue-950 px-4 py-3 text-sm font-black text-white"><RefreshCw size={16}/>Actualiser</button></div></div>;
 if(!active)return <div className="mx-auto max-w-2xl p-5 pb-28"><div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6"><ShieldCheck className="text-amber-700"/><h1 className="mt-4 text-2xl font-black">Vérification Business en cours</h1><p className="mt-2 text-sm leading-6 text-slate-600">Les clés Production, soldes développeur et fonctions financières restent masqués jusqu’à validation.</p><p className="mt-4 font-mono text-xs font-bold">{dev.developerId}</p></div></div>;

 return <div className="mx-auto max-w-4xl space-y-5 p-4 pb-28 md:p-8">
 <header className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-widest text-blue-700">{provider?'Partner Console':'Developer Console'}</p><h1 className="text-3xl font-black">{dev.companyName}</h1><p className="mt-1 font-mono text-xs text-slate-500">{dev.developerId}</p></div><span className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800">ACTIF</span></header>

 <section className="grid grid-cols-2 gap-3">{['USD','CDF'].map(c=><div key={c} className="rounded-[2rem] border bg-white p-5 shadow-sm"><WalletCards className="text-blue-800"/><p className="mt-4 text-xs font-black text-slate-400">SOLDE REÇU {c}</p><p className="mt-1 text-2xl font-black">{money(data?.wallets?.[c]?.availableBalance,c)}</p></div>)}</section>

 <section className={`rounded-[2rem] p-5 ${provider?'bg-blue-950 text-white':'border bg-white'}`}>{provider?<ServerCog/>:<Code2 className="text-blue-800"/>}<h2 className="mt-3 text-xl font-black">{provider?'Partenaire API Market-Cash':'Accès API direct Market-Cash'}</h2><p className={`mt-2 text-sm ${provider?'text-blue-200':'text-slate-500'}`}>{provider?'Tarification wholesale, sous-comptes développeurs et distribution des paiements Market-Cash à vos propres clients.':'Pour vos propres applications. Les clés et paiements sont facturés au tarif direct Market-Cash.'}</p><div className={`mt-4 rounded-2xl p-3 text-xs font-black ${provider?'bg-white/10':'bg-blue-50 text-blue-900'}`}>Tarif paiement API indicatif : {provider?'1,5 % wholesale':'2,5 % direct'} · minimums selon devise configurables par l’admin.</div></section>

 <section className="rounded-[2rem] border bg-white p-5">
  <div className="flex items-center gap-2"><KeyRound className="text-blue-800"/><h2 className="font-black">Applications & clés API</h2></div>
  <p className="mt-1 text-xs text-slate-500">Créez une application, récupérez sa clé une seule fois, puis configurez les fonctionnalités autorisées.</p>
  <form onSubmit={createApp} className="mt-4 flex gap-2">
   <input value={appName} onChange={e=>setAppName(e.target.value)} minLength={2} required placeholder={provider?'Nom de l’intégration / passerelle':'Nom de l’application'} className="min-w-0 flex-1 rounded-2xl border p-3"/>
   <button type="submit" disabled={busy||appName.trim().length<2} className="rounded-2xl bg-blue-950 px-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy?'Création…':'Créer'}</button>
  </form>
  {newKey&&<div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black text-amber-800">COPIEZ CETTE CLÉ MAINTENANT</p><p className="mt-2 break-all font-mono text-xs">{newKey}</p><button type="button" onClick={async()=>{await navigator.clipboard?.writeText(newKey);toast.success('Clé copiée.')}} className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-black">Copier</button></div>}

  <div className="mt-4 space-y-3">{(data?.apps||[]).map((a:any)=>{
   const draft=draftSettings[a.appId]||{apiEnabled:a.status==='active',enabledFeatures:a.scopes||DEFAULT_DIRECT,allowedCurrencies:a.allowedCurrencies||['USD','CDF']};
   const available=a.businessType==='api_provider'?DEFAULT_PROVIDER:DEFAULT_DIRECT;
   const open=settingsOpen===a.appId;
   return <div key={a.appId} className="rounded-2xl border p-4">
    <div className="flex items-start justify-between gap-3"><div><b className="text-sm">{a.appName}</b><p className="mt-1 font-mono text-[10px] text-slate-500">{a.appId}</p><p className="mt-1 text-[11px] font-bold text-slate-500">{draft.apiEnabled?'API active':'API désactivée'} · {a.pricingTier||dev.pricingTier}</p></div><button type="button" onClick={()=>setSettingsOpen(open?'':a.appId)} className="flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"><Settings2 size={15}/>Paramètres</button></div>
    {open&&<div className="mt-4 space-y-4 border-t pt-4">
     <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3"><div><p className="text-sm font-black">Activer cette API</p><p className="text-xs text-slate-500">Coupe ou réactive l’accès de cette application.</p></div><button type="button" onClick={()=>setDraftSettings(prev=>({...prev,[a.appId]:{...draft,apiEnabled:!draft.apiEnabled}}))} className={`h-7 w-12 rounded-full p-1 transition ${draft.apiEnabled?'bg-emerald-500':'bg-slate-300'}`}><span className={`block h-5 w-5 rounded-full bg-white transition ${draft.apiEnabled?'translate-x-5':'translate-x-0'}`}/></button></div>
     <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Fonctionnalités</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{available.map(feature=><label key={feature} className="flex items-center gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={draft.enabledFeatures.includes(feature)} onChange={()=>toggleFeature(a.appId,feature)}/><span>{FEATURE_LABELS[feature]||feature}</span></label>)}</div></div>
     <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Devises autorisées</p><div className="mt-2 flex gap-2">{['USD','CDF'].map(currency=><label key={currency} className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold"><input type="checkbox" checked={draft.allowedCurrencies.includes(currency)} onChange={()=>toggleCurrency(a.appId,currency)}/>{currency}</label>)}</div></div>
     <button type="button" disabled={busyAppId===a.appId} onClick={()=>saveSettings(a.appId)} className="w-full rounded-2xl bg-blue-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busyAppId===a.appId?'Enregistrement…':'Enregistrer les paramètres API'}</button>
    </div>}
   </div>})}
   {!data?.apps?.length&&<p className="py-4 text-sm text-slate-400">Aucune application API. Entrez un nom puis appuyez sur « Créer ».</p>}
  </div>
 </section>

 {provider&&<section className="rounded-[2rem] border bg-white p-5"><div className="flex items-center gap-2"><Users className="text-blue-800"/><h2 className="font-black">Développeurs distribués</h2></div><p className="mt-1 text-xs text-slate-500">Ces sous-comptes appartiennent uniquement à votre activité de distribution API.</p><form onSubmit={createSub} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input value={subCompany} onChange={e=>setSubCompany(e.target.value)} placeholder="Entreprise développeur" className="rounded-2xl border p-3"/><input value={subEmail} onChange={e=>setSubEmail(e.target.value)} type="email" placeholder="Email" className="rounded-2xl border p-3"/><button type="submit" disabled={busy} className="rounded-2xl bg-blue-950 px-4 py-3 font-black text-white">Ajouter</button></form><div className="mt-4 divide-y">{subDevelopers.map((s:any)=><div key={s.subDeveloperId} className="py-3"><b className="text-sm">{s.companyName}</b><p className="text-xs text-slate-500">{s.contactEmail}</p><p className="font-mono text-[10px] text-slate-400">{s.subDeveloperId} · {s.status}</p></div>)}{!subDevelopers.length&&<p className="py-4 text-sm text-slate-400">Aucun sous-développeur.</p>}</div></section>}

 <section className="rounded-[2rem] border bg-white p-5"><h2 className="font-black">Transactions</h2><div className="mt-3 divide-y">{(data?.transactions||[]).slice(0,30).map((t:any)=><div key={t.id||t.reference} className="py-3"><div className="flex justify-between gap-3"><b className="text-sm">{t.reason||t.type||'Paiement Market-Cash'}</b><b className="text-sm">{money(t.amount,t.currency||'USD')}</b></div><p className="mt-1 text-[11px] text-slate-500">Frais {money(t.feeAmount||0,t.currency||'USD')} · Solde après {t.developerBalanceAfter!==undefined?money(t.developerBalanceAfter,t.currency||'USD'):'—'}</p><p className="mt-1 font-mono text-[10px] text-slate-400">{t.reference||t.id} · {t.externalReference||''} · {t.status||'completed'}</p></div>)}{!data?.transactions?.length&&<p className="py-4 text-sm text-slate-400">Aucune transaction.</p>}</div></section>
 </div>;
}
