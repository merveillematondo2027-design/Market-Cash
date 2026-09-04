import React,{useCallback,useEffect,useState}from'react';
import{doc,updateDoc}from'firebase/firestore';
import{Activity,ArrowLeft,Ban,KeyRound,MapPin,Power,RefreshCw,Save,ShieldCheck,WalletCards}from'lucide-react';
import{useNavigate,useParams}from'react-router-dom';
import toast from'react-hot-toast';
import{db}from'../../firebase/config';
import{WalletCurrency}from'../../types/wallet';
import{agentAdminService,AgentAdminDetails}from'../../services/agentAdminService';
import{adminUserService,AdminUserControlSnapshot,AccountStatus,WalletAdminStatus}from'../../services/adminUserService';

const money=(value:number,currency:WalletCurrency)=>currency==='CDF'?`${Number(value||0).toLocaleString('fr-FR')} CDF`:`${Number(value||0).toFixed(2)} USD`;
const date=(value?:number)=>value?new Date(value).toLocaleString('fr-FR'):'—';

interface ProfileForm{pointName:string;activity:string;city:string;address:string;openingHours:string;}
const emptyProfile:ProfileForm={pointName:'',activity:'',city:'',address:'',openingHours:''};

export default function AdminAgentDetails(){
  const{agentUid=''}=useParams();
  const navigate=useNavigate();
  const[details,setDetails]=useState<AgentAdminDetails|null>(null);
  const[control,setControl]=useState<AdminUserControlSnapshot|null>(null);
  const[loading,setLoading]=useState(true);
  const[busy,setBusy]=useState('');
  const[currency,setCurrency]=useState<WalletCurrency>('CDF');
  const[amount,setAmount]=useState('');
  const[reason,setReason]=useState('Dépôt cash reçu par la direction');
  const[note,setNote]=useState('');
  const[profile,setProfile]=useState<ProfileForm>(emptyProfile);

  const load=useCallback(async()=>{
    if(!agentUid)return;
    setLoading(true);
    try{
      const[d,c]=await Promise.all([
        agentAdminService.getDetails(agentUid),
        adminUserService.getControl(agentUid),
      ]);
      setDetails(d);
      setControl(c);
      setNote(c.adminNote||'');
      setProfile({
        pointName:d.agent.pointName||'',
        activity:d.agent.activity||'',
        city:d.agent.city||'',
        address:d.agent.address||'',
        openingHours:d.agent.openingHours||'',
      });
    }catch(e:any){
      console.error('[ADMIN_AGENT_DETAILS_LOAD_ERROR]',e);
      toast.error(e?.message||'Compte agent indisponible.');
    }finally{setLoading(false)}
  },[agentUid]);

  useEffect(()=>{void load()},[load]);

  const fund=async()=>{
    if(!details)return;
    const n=Number(String(amount).replace(/\s/g,'').replace(',','.'));
    if(!Number.isFinite(n)||n<=0)return toast.error('Montant invalide.');
    if(reason.trim().length<5)return toast.error('Motif obligatoire.');
    setBusy('fund');
    try{
      await agentAdminService.fund({agentUid,currency,amount:n,reason:reason.trim()});
      setAmount('');
      toast.success(`${money(n,currency)} crédités.`);
      await load();
    }catch(e:any){toast.error(e?.message||'Crédit du float impossible.')}finally{setBusy('')}
  };

  const changeAccount=async(status:AccountStatus)=>{
    if(!details)return;
    const label=status==='active'?'réactiver':status==='suspended'?'suspendre':'bloquer';
    if(status!=='active'&&!window.confirm(`Confirmer : ${label} le compte de ${details.agent.displayName} ?`))return;
    setBusy(`account:${status}`);
    try{
      await adminUserService.setAccountStatus(agentUid,status);
      if(status==='active'){
        try{await adminUserService.setWalletStatus(agentUid,'ALL','active')}catch(error){console.warn('[AGENT_WALLETS_REACTIVATE_WARNING]',error)}
      }
      toast.success(status==='active'?'Compte réactivé.':status==='suspended'?'Compte suspendu.':'Compte bloqué.');
      await load();
    }catch(e:any){toast.error(e?.message||'Modification impossible.')}finally{setBusy('')}
  };

  const changeWallet=async(c:WalletCurrency,status:WalletAdminStatus)=>{
    setBusy(`wallet:${c}`);
    try{await adminUserService.setWalletStatus(agentUid,c,status);toast.success(`${c} ${status==='active'?'réactivé':'gelé'}.`);await load()}
    catch(e:any){toast.error(e?.message||'Contrôle du wallet impossible.')}finally{setBusy('')}
  };

  const resetPin=async()=>{
    if(!details||!window.confirm(`Réinitialiser le PIN de ${details.agent.displayName} ? Le code temporaire sera 1234.`))return;
    setBusy('pin');
    try{await adminUserService.resetPin(agentUid);toast.success('PIN temporaire 1234 activé.');await load()}
    catch(e:any){toast.error(e?.message||'Réinitialisation impossible.')}finally{setBusy('')}
  };

  const disableBiometrics=async()=>{
    setBusy('biometrics');
    try{await adminUserService.disableBiometrics(agentUid);toast.success('Biométrie désactivée.');await load()}
    catch(e:any){toast.error(e?.message||'Action impossible.')}finally{setBusy('')}
  };

  const saveProfile=async()=>{
    setBusy('profile');
    try{
      await updateDoc(doc(db,'agent_profiles',agentUid),{
        pointName:profile.pointName.trim(),
        activity:profile.activity.trim(),
        city:profile.city.trim(),
        address:profile.address.trim(),
        openingHours:profile.openingHours.trim(),
        updatedAt:Date.now(),
      });
      toast.success('Informations Agent mises à jour.');
      await load();
    }catch(e:any){toast.error(e?.message||'Modification du profil impossible.')}finally{setBusy('')}
  };

  const saveNote=async()=>{
    setBusy('note');
    try{await adminUserService.setNote(agentUid,note);toast.success('Note administrative enregistrée.');await load()}
    catch(e:any){toast.error(e?.message||'Note impossible à enregistrer.')}finally{setBusy('')}
  };

  if(!agentUid)return <div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-500">Agent invalide.</div>;
  if(loading&&!details)return <div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-500">Chargement du compte Agent…</div>;
  if(!details)return <div className="space-y-4"><button onClick={()=>navigate('/admin/agents')} className="inline-flex items-center gap-2 text-sm font-black text-blue-950"><ArrowLeft size={17}/>Retour aux agents</button><div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-500">Impossible d’ouvrir ce compte Agent.</div></div>;

  const accountStatus=(control?.accountStatus||details.agent.accountStatus||'active')as AccountStatus;
  const cdf=details.wallets.CDF;
  const usd=details.wallets.USD;

  return <div className="mx-auto max-w-6xl space-y-4 pb-24">
    <header className="flex items-center gap-3">
      <button onClick={()=>navigate('/admin/agents')} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border bg-white text-blue-950 shadow-sm" aria-label="Retour"><ArrowLeft size={20}/></button>
      <div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-wider text-amber-600">Gestion Agent</p><h1 className="truncate text-2xl font-black text-blue-950">{details.agent.displayName}</h1><p className="truncate text-xs text-slate-500">{details.agent.pointName||'Point de vente Market-Cash'}</p></div>
      <button onClick={()=>void load()} disabled={loading} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border bg-white text-blue-950 shadow-sm disabled:opacity-40" aria-label="Actualiser"><RefreshCw size={18} className={loading?'animate-spin':''}/></button>
    </header>

    <section className="grid grid-cols-2 gap-3">
      <Balance title="Float CDF" value={money(cdf?.availableBalance||0,'CDF')} status={cdf?.status}/>
      <Balance title="Float USD" value={money(usd?.availableBalance||0,'USD')} status={usd?.status}/>
    </section>

    <div className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
      <div className="space-y-4">
        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Compte</p><h2 className="mt-1 text-xl font-black text-slate-950">Identité & statut</h2></div><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${accountStatus==='active'?'bg-emerald-100 text-emerald-700':accountStatus==='blocked'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-800'}`}>{accountStatus}</span></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2"><Info label="Téléphone" value={details.agent.phone||'—'}/><Info label="E-mail" value={details.agent.email||'—'}/><Info label="ID Market-Cash" value={details.agent.marketCashId||'—'} mono/><Info label="Numéro interne" value={details.agent.rechargeNumber||'—'} mono/><Info label="KYC" value={details.agent.kycStatus}/><Info label="PIN" value={details.agent.mustChangePin?'Changement obligatoire':'Configuré'}/><Info label="Approbation" value={date(details.agent.approvedAt)}/><Info label="UID" value={details.agent.uid} mono/></div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <button disabled={!!busy||accountStatus==='active'} onClick={()=>changeAccount('active')} className="rounded-2xl bg-emerald-50 px-3 py-3 text-xs font-black text-emerald-700 disabled:opacity-35"><Power size={15} className="mx-auto mb-1"/>Activer</button>
            <button disabled={!!busy||accountStatus==='suspended'} onClick={()=>changeAccount('suspended')} className="rounded-2xl bg-amber-50 px-3 py-3 text-xs font-black text-amber-800 disabled:opacity-35"><ShieldCheck size={15} className="mx-auto mb-1"/>Suspendre</button>
            <button disabled={!!busy||accountStatus==='blocked'} onClick={()=>changeAccount('blocked')} className="rounded-2xl bg-red-50 px-3 py-3 text-xs font-black text-red-700 disabled:opacity-35"><Ban size={15} className="mx-auto mb-1"/>Bloquer</button>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><MapPin size={18} className="text-blue-900"/><h2 className="font-black text-slate-950">Point de vente</h2></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Nom du point" value={profile.pointName} onChange={value=>setProfile(p=>({...p,pointName:value}))}/>
            <Field label="Activité" value={profile.activity} onChange={value=>setProfile(p=>({...p,activity:value}))}/>
            <Field label="Ville" value={profile.city} onChange={value=>setProfile(p=>({...p,city:value}))}/>
            <Field label="Horaires" value={profile.openingHours} onChange={value=>setProfile(p=>({...p,openingHours:value}))}/>
            <div className="sm:col-span-2"><Field label="Adresse" value={profile.address} onChange={value=>setProfile(p=>({...p,address:value}))}/></div>
          </div>
          <button disabled={!!busy} onClick={saveProfile} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40"><Save size={16}/>{busy==='profile'?'Enregistrement…':'Enregistrer les informations'}</button>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><Activity size={18} className="text-blue-900"/><h2 className="font-black text-slate-950">Activité récente</h2></div>
          <div className="mt-3 space-y-2">{details.transactions.length===0?<div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Aucune transaction Agent.</div>:details.transactions.slice(0,12).map((t:any)=><div key={t.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{transactionLabel(t.type)}</p><p className="mt-1 text-[10px] text-slate-400">{date(Number(t.createdAt||0))} · {t.reference||t.id}</p></div><p className="shrink-0 text-sm font-black text-blue-950">{money(Number(t.amount||0),(t.currency||'CDF')as WalletCurrency)}</p></div>)}</div>
        </section>
      </div>

      <div className="space-y-4">
        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><WalletCards/></div><div><h2 className="font-black text-slate-950">Créditer le float</h2><p className="text-xs text-slate-500">Même wallet affiché côté Agent et Administration.</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={()=>setCurrency('CDF')} className={`rounded-2xl py-3 font-black ${currency==='CDF'?'bg-blue-950 text-white':'bg-slate-100 text-slate-700'}`}>CDF</button><button onClick={()=>setCurrency('USD')} className={`rounded-2xl py-3 font-black ${currency==='USD'?'bg-blue-950 text-white':'bg-slate-100 text-slate-700'}`}>USD</button></div>
          <label className="mt-4 block"><span className="text-xs font-black text-slate-500">Montant</span><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={currency==='CDF'?'50 000':'100'} className="mt-1 w-full rounded-2xl border p-4 text-xl font-black outline-none focus:border-blue-500"/></label>
          <label className="mt-3 block"><span className="text-xs font-black text-slate-500">Motif</span><textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} className="mt-1 w-full rounded-2xl border p-3 text-sm outline-none focus:border-blue-500"/></label>
          <button disabled={!!busy} onClick={fund} className="mt-4 w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-40">{busy==='fund'?'Crédit en cours…':'Créditer le float'}</button>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <h2 className="font-black text-slate-950">Contrôle des wallets</h2><p className="mt-1 text-xs text-slate-500">Geler une devise bloque les opérations sur ce float sans supprimer le solde.</p>
          <div className="mt-4 space-y-2">{(['CDF','USD']as WalletCurrency[]).map(c=>{const wallet=details.wallets[c];const active=(wallet?.status||'active')==='active';return <div key={c} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3"><div><p className="text-sm font-black text-slate-900">Wallet {c}</p><p className="text-xs text-slate-500">{money(wallet?.availableBalance||0,c)} · {active?'actif':'gelé'}</p></div><button disabled={!!busy} onClick={()=>changeWallet(c,active?'frozen':'active')} className={`rounded-xl px-3 py-2 text-xs font-black ${active?'bg-amber-100 text-amber-800':'bg-emerald-100 text-emerald-700'} disabled:opacity-40`}>{active?'Geler':'Réactiver'}</button></div>})}</div>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <h2 className="font-black text-slate-950">Sécurité</h2>
          <div className="mt-4 grid gap-2"><button disabled={!!busy} onClick={resetPin} className="flex items-center justify-between rounded-2xl bg-amber-50 p-3 text-left text-sm font-black text-amber-900 disabled:opacity-40"><span className="inline-flex items-center gap-2"><KeyRound size={17}/>Réinitialiser le PIN</span><span>1234</span></button><button disabled={!!busy} onClick={disableBiometrics} className="rounded-2xl bg-slate-100 p-3 text-left text-sm font-black text-slate-700 disabled:opacity-40">Désactiver la biométrie de ce compte</button></div>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm">
          <h2 className="font-black text-slate-950">Note administrative</h2><p className="mt-1 text-xs text-slate-500">Visible uniquement dans l’administration.</p>
          <textarea value={note} onChange={e=>setNote(e.target.value)} rows={4} placeholder="Observation, contrôle, incident, suivi…" className="mt-3 w-full rounded-2xl border p-3 text-sm outline-none focus:border-blue-500"/>
          <button disabled={!!busy} onClick={saveNote} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-40"><Save size={16}/>{busy==='note'?'Enregistrement…':'Enregistrer la note'}</button>
        </section>
      </div>
    </div>
  </div>;
}

function Info({label,value,mono=false}:{label:string;value:string;mono?:boolean}){return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-1 break-words text-sm font-black text-slate-800 ${mono?'font-mono':''}`}>{value}</p></div>}
function Field({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}){return <label className="block"><span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</span><input value={value} onChange={e=>onChange(e.target.value)} className="mt-1 w-full rounded-2xl border bg-slate-50 p-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500"/></label>}
function Balance({title,value,status}:{title:string;value:string;status?:string}){const active=(status||'active')==='active';return <div className="rounded-3xl bg-blue-950 p-5 text-white shadow-sm"><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-wider text-blue-200">{title}</p><WalletCards size={17} className="text-amber-400"/></div><p className="mt-3 text-xl font-black">{value}</p><p className={`mt-2 text-[10px] font-black uppercase ${active?'text-emerald-300':'text-amber-300'}`}>{active?'Actif':'Gelé'}</p></div>}
function transactionLabel(type:string){const map:Record<string,string>={agent_float_funding:'Crédit float',cash_in:'Dépôt client',cash_out:'Retrait client',agent_card_cash_out:'Retrait carte locale'};return map[String(type||'')]||String(type||'Transaction').replaceAll('_',' ')}
