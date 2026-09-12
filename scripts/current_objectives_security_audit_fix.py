from pathlib import Path


def replace(path, old, new):
    p=Path(path); text=p.read_text(encoding='utf-8')
    if old not in text: raise SystemExit(f'Pattern not found in {path}: {old[:100]}')
    p.write_text(text.replace(old,new),encoding='utf-8')

# Device security: fix the wrong callable used for auto-lock preferences.
replace('src/services/deviceSecurityService.ts',
"const updatePreferences=httpsCallable(functions,'getClientSecurityOverview');",
"const updatePreferences=httpsCallable(functions,'updateSecurityPreferences');")

# One shared security modal: automatically launch biometric verification when the protected zone opens,
# while leaving PIN entry available. The modal owns verification; callbacks only perform the protected action.
Path('src/components/SecurityConfirmModal.tsx').write_text("""import React,{useEffect,useRef,useState}from'react';
import{Fingerprint,KeyRound,X}from'lucide-react';
import{useAuthStore}from'../store/authStore';
import{deviceSecurityService}from'../services/deviceSecurityService';

interface Props{
  open:boolean;
  title?:string;
  subtitle?:string;
  busy?:boolean;
  onClose:()=>void;
  onConfirm:(pin:string)=>Promise<void>|void;
  onBiometric?:()=>Promise<void>|void;
}

export default function SecurityConfirmModal({open,title='Confirmer avec votre code secret',subtitle='Ce code protège les actions sensibles de votre application Market-Cash.',busy=false,onClose,onConfirm,onBiometric}:Props){
  const{user}=useAuthStore();
  const[pin,setPin]=useState('');
  const[bioBusy,setBioBusy]=useState(false);
  const[bioAvailable,setBioAvailable]=useState(false);
  const autoAttempted=useRef(false);

  const runBiometric=async(manual=false)=>{
    if(!user?.uid||!onBiometric||bioBusy||busy)return;
    setBioBusy(true);
    try{
      await deviceSecurityService.verify(user.uid);
      await onBiometric();
    }catch(error:any){
      if(manual){
        const message=String(error?.message||'');
        if(!/cancel|abort|annul/i.test(message)) console.warn('[BIOMETRIC_VERIFY_FAILED]',error);
      }
    }finally{setBioBusy(false)}
  };

  useEffect(()=>{
    if(!open){setPin('');setBioAvailable(false);autoAttempted.current=false;return}
    if(!user?.useBiometrics||!onBiometric)return;
    let active=true;
    void deviceSecurityService.platformAvailable().then(ok=>{
      if(!active)return;
      setBioAvailable(ok);
      if(ok&&!autoAttempted.current){autoAttempted.current=true;setTimeout(()=>void runBiometric(false),80)}
    });
    return()=>{active=false};
  },[open,user?.uid,user?.useBiometrics,onBiometric]);

  if(!open)return null;
  const valid=/^\\d{4,10}$/.test(pin);
  const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!valid||busy||bioBusy)return;await onConfirm(pin)};
  return <div className=\"fixed inset-0 z-[120] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm\">
    <form onSubmit={submit} className=\"w-full max-w-sm rounded-[2rem] border border-white/20 bg-white p-6 shadow-2xl\">
      <div className=\"flex items-start justify-between gap-4\"><div className=\"grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-950\"><KeyRound size={23}/></div><button type=\"button\" onClick={onClose} disabled={busy||bioBusy} className=\"grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600\"><X size={18}/></button></div>
      <h2 className=\"mt-5 text-xl font-black text-slate-950\">{title}</h2><p className=\"mt-2 text-sm leading-6 text-slate-500\">{subtitle}</p>
      {bioAvailable&&<p className=\"mt-2 text-xs font-bold text-emerald-700\">Biométrie lancée automatiquement. Vous pouvez aussi saisir votre PIN ci-dessous.</p>}
      <p className=\"mt-2 text-xs font-semibold text-slate-400\">PIN de 4 à 10 chiffres.</p>
      <input value={pin} onChange={e=>setPin(e.target.value.replace(/\\D/g,'').slice(0,10))} type=\"password\" inputMode=\"numeric\" autoComplete=\"off\" minLength={4} maxLength={10} placeholder=\"Votre PIN\" className=\"mt-5 w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-5 py-4 text-center text-2xl font-black tracking-[.3em] outline-none transition focus:border-blue-600 focus:bg-white\"/>
      <button disabled={busy||bioBusy||!valid} className=\"mt-4 w-full rounded-2xl bg-blue-950 py-4 font-black text-white shadow-sm disabled:opacity-40\">{busy?'Vérification…':'Confirmer avec le PIN'}</button>
      {user?.useBiometrics&&onBiometric&&bioAvailable&&<><div className=\"my-3 flex items-center gap-3 text-[10px] font-black uppercase text-slate-300\"><span className=\"h-px flex-1 bg-slate-200\"/>ou<span className=\"h-px flex-1 bg-slate-200\"/></div><button type=\"button\" disabled={busy||bioBusy} onClick={()=>void runBiometric(true)} className=\"flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-blue-200 bg-blue-50 py-4 font-black text-blue-950 disabled:opacity-40\"><Fingerprint size={20}/>{bioBusy?'Vérification biométrique…':'Relancer la biométrie'}</button></>}
    </form>
  </div>;
}
""",encoding='utf-8')

# Shared reveal hook callback now only performs the protected action after the modal verified WebAuthn.
Path('src/hooks/useSensitiveReveal.ts').write_text("""import {useEffect,useState} from 'react';
import toast from 'react-hot-toast';
import {agentWalletService} from '../services/agentWalletService';

export function useSensitiveReveal(autoHideMs=90000){
  const[revealed,setRevealed]=useState(false);const[open,setOpen]=useState(false);const[busy,setBusy]=useState(false);
  useEffect(()=>{if(!revealed||autoHideMs<=0)return;const timer=window.setTimeout(()=>setRevealed(false),autoHideMs);return()=>window.clearTimeout(timer)},[revealed,autoHideMs]);
  const request=()=>{if(revealed){setRevealed(false);return}setOpen(true)};
  const confirm=async(pin:string)=>{setBusy(true);try{await agentWalletService.verifyApplicationSecret(pin);setRevealed(true);setOpen(false)}catch(error:any){toast.error(error?.message||'Code secret incorrect.')}finally{setBusy(false)}};
  const biometric=async()=>{setRevealed(true);setOpen(false)};
  const close=()=>{if(!busy)setOpen(false)};
  return{revealed,open,busy,request,confirm,biometric,close,hide:()=>setRevealed(false)};
}
""",encoding='utf-8')

# Home callback must not re-run WebAuthn; the modal already verified it.
replace('src/pages/client/ClientHome.tsx',"import{deviceSecurityService}from'../../services/deviceSecurityService';\n",'')
replace('src/pages/client/ClientHome.tsx',
"  const confirmBiometric=async()=>{if(!user?.uid)return;setSecurityBusy(true);try{await deviceSecurityService.verify(user.uid);setRevealed(true);setSecurityOpen(false)}catch(error:any){toast.error(error?.message||'Vérification biométrique refusée.')}finally{setSecurityBusy(false)}};",
"  const confirmBiometric=async()=>{setRevealed(true);setSecurityOpen(false)};")

# Settings CVV callback consumes the grant created by the modal; do not authenticate twice.
settings=Path('src/pages/client/Settings.tsx'); st=settings.read_text(encoding='utf-8')
st=st.replace("const revealCvvBiometric=async()=>{setBusy(true);try{await deviceSecurityService.verify(user.uid);const cards=await localCardPairService.list();", "const revealCvvBiometric=async()=>{setBusy(true);try{const cards=await localCardPairService.list();")
settings.write_text(st,encoding='utf-8')

# App PIN screen: biometric is available based on real platform support, not enrolled() which was hardcoded false.
replace('src/pages/auth/PinScreen.tsx',"import React,{useEffect,useState}from'react';","import React,{useEffect,useRef,useState}from'react';")
replace('src/pages/auth/PinScreen.tsx',
"  useEffect(()=>{if(!user?.uid||!user.useBiometrics){setBiometricReady(false);return}void deviceSecurityService.platformAvailable().then(ok=>setBiometricReady(ok&&deviceSecurityService.enrolled(user.uid)))},[user?.uid,user?.useBiometrics]);",
"  useEffect(()=>{if(!user?.uid||!user.useBiometrics){setBiometricReady(false);return}void deviceSecurityService.platformAvailable().then(setBiometricReady)},[user?.uid,user?.useBiometrics]);")
replace('src/pages/auth/PinScreen.tsx',
"  const[pin,setPin]=useState('');const[confirmPin,setConfirmPin]=useState('');const[mode,setMode]=useState<Mode>('verify');const[loading,setLoading]=useState(false);const[showLogoutModal,setShowLogoutModal]=useState(false);const[biometricReady,setBiometricReady]=useState(false);",
"  const[pin,setPin]=useState('');const[confirmPin,setConfirmPin]=useState('');const[mode,setMode]=useState<Mode>('verify');const[loading,setLoading]=useState(false);const[showLogoutModal,setShowLogoutModal]=useState(false);const[biometricReady,setBiometricReady]=useState(false);const autoBioAttempted=useRef(false);")
anchor="  const biometricUnlock=async()=>{if(!user)return;setLoading(true);try{await deviceSecurityService.verify(user.uid);goHome();toast.success('Biométrie confirmée.')}catch(error:any){toast.error(error?.message||'Vérification biométrique impossible.')}finally{setLoading(false)}};"
replacement=anchor+"\n  useEffect(()=>{if(mode!=='verify'||!biometricReady||!user?.uid||autoBioAttempted.current)return;autoBioAttempted.current=true;const timer=setTimeout(()=>void biometricUnlock(),120);return()=>clearTimeout(timer)},[mode,biometricReady,user?.uid]);"
replace('src/pages/auth/PinScreen.tsx',anchor,replacement)

# Transaction history must be visible without PIN, as previously decided.
Path('src/pages/client/Transactions.tsx').write_text("""import React,{useEffect,useMemo,useState}from'react';
import{ArrowLeft,CheckCircle2,ChevronRight,CircleX,Filter,ReceiptText,RefreshCw,Search}from'lucide-react';
import{Link,useSearchParams}from'react-router-dom';import toast from'react-hot-toast';
import TransactionDetailsModal from'../../components/TransactionDetailsModal';import{agentWalletService}from'../../services/agentWalletService';
type StatusFilter='all'|'success'|'failed';
const money=(value:any,currency='USD')=>String(currency).toUpperCase()==='CDF'?`${Number(value||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(value||0).toFixed(2)} USD`;
const words=(value:any)=>String(value||'Transaction').replaceAll('_',' ').replace(/\\b\\w/g,c=>c.toUpperCase());
const failed=(t:any)=>['failed','declined','rejected','cancelled'].includes(String(t?.status||'').toLowerCase());
const balanceAfter=(t:any)=>{for(const value of[t?.balanceAfter,t?.cardBalanceAfter,t?.walletBalanceAfter,t?.clientBalanceAfter,t?.senderBalanceAfter]){if(value!==undefined&&value!==null&&value!==''&&Number.isFinite(Number(value)))return Number(value)}return null};
export default function Transactions(){const[params]=useSearchParams();const[items,setItems]=useState<any[]>([]);const[loading,setLoading]=useState(true);const[search,setSearch]=useState('');const[status,setStatus]=useState<StatusFilter>('all');const[selected,setSelected]=useState<any|null>(null);const requested=params.get('transaction');
const load=async()=>{setLoading(true);try{setItems(await agentWalletService.getMyWalletHistory())}catch(error){console.error('[CLIENT_TRANSACTIONS_LOAD_ERROR]',error);toast.error('Impossible de charger les transactions.')}finally{setLoading(false)}};useEffect(()=>{void load()},[]);useEffect(()=>{if(!requested||!items.length)return;const found=items.find(t=>String(t.id||'')===requested||String(t.transactionId||'')===requested||String(t.reference||'')===requested);if(found)setSelected(found)},[requested,items]);
const visible=useMemo(()=>{const q=search.trim().toLowerCase();return items.filter(t=>{if(status==='failed'&&!failed(t))return false;if(status==='success'&&failed(t))return false;if(!q)return true;return[t.reference,t.externalReference,t.type,t.status,t.developerName,t.merchantName,t.appName,t.amount,t.currency,t.failureCode].some(v=>String(v||'').toLowerCase().includes(q))})},[items,search,status]);
return <div className=\"mx-auto max-w-3xl space-y-5 p-4 pb-28 md:p-8\"><header className=\"flex items-start justify-between gap-4\"><div><Link to=\"/client/home\" className=\"inline-flex items-center gap-2 text-xs font-bold text-slate-500\"><ArrowLeft size={14}/>Accueil</Link><h1 className=\"mt-3 text-2xl font-black text-slate-950\">Transactions</h1><p className=\"mt-1 text-sm text-slate-500\">Toutes vos opérations Market-Cash, réussies ou refusées, avec leurs références et soldes disponibles.</p></div><button disabled={loading} onClick={load} className=\"grid h-11 w-11 shrink-0 place-items-center rounded-2xl border bg-white text-blue-900 shadow-sm disabled:opacity-40\"><RefreshCw size={18} className={loading?'animate-spin':''}/></button></header>
<section className=\"rounded-3xl border bg-white p-4 shadow-sm\"><div className=\"relative\"><Search size={17} className=\"absolute left-4 top-1/2 -translate-y-1/2 text-slate-400\"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder=\"Référence, bénéficiaire, montant…\" className=\"w-full rounded-2xl border bg-slate-50 p-3.5 pl-11 text-sm outline-none focus:border-blue-500\"/></div><div className=\"mt-3 flex items-center gap-2 overflow-x-auto\"><Filter size={15} className=\"shrink-0 text-slate-400\"/>{([['all','Toutes'],['success','Réussies'],['failed','Échouées']]as const).map(([key,label])=><button key={key} onClick={()=>setStatus(key)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-black ${status===key?'bg-blue-950 text-white':'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div></section>
<section className=\"space-y-3\">{loading?<div className=\"rounded-3xl border bg-white p-8 text-center text-sm text-slate-500\">Chargement…</div>:visible.length===0?<div className=\"rounded-3xl border bg-white p-8 text-center text-sm text-slate-500\"><ReceiptText className=\"mx-auto mb-2 text-slate-300\"/>Aucune transaction trouvée.</div>:visible.map(t=>{const isFailed=failed(t),after=balanceAfter(t),c=String(t.currency||'USD').toUpperCase(),title=t.developerName||t.merchantName||t.appName||words(t.type);return <button key={t.id||t.reference} onClick={()=>setSelected(t)} className=\"w-full rounded-3xl border bg-white p-4 text-left shadow-sm transition active:scale-[.995]\"><div className=\"flex items-start gap-3\"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${isFailed?'bg-rose-50 text-rose-700':'bg-emerald-50 text-emerald-700'}`}>{isFailed?<CircleX size={20}/>:<CheckCircle2 size={20}/>}</div><div className=\"min-w-0 flex-1\"><div className=\"flex items-start justify-between gap-3\"><div className=\"min-w-0\"><h2 className=\"truncate text-sm font-black text-slate-950\">{title}</h2><p className=\"mt-1 truncate font-mono text-[10px] text-slate-400\">{t.reference||t.id}</p></div><div className=\"shrink-0 text-right\"><p className={`font-black ${isFailed?'text-rose-700':'text-blue-950'}`}>{money(t.amount,c)}</p><p className={`mt-1 text-[9px] font-black uppercase ${isFailed?'text-rose-500':'text-emerald-600'}`}>{isFailed?'Échouée':'Réussie'}</p></div></div><div className=\"mt-3 flex items-end justify-between gap-3\"><div><p className=\"text-[10px] text-slate-400\">{t.createdAt?new Date(Number(t.createdAt)).toLocaleString('fr-FR'):'—'}</p>{after!==null&&<p className=\"mt-1 text-[10px] font-bold text-slate-500\">Solde après : {money(after,c)}</p>}</div><ChevronRight size={17} className=\"shrink-0 text-slate-300\"/></div></div></div></button>})}</section>{selected&&<TransactionDetailsModal transaction={selected} onClose={()=>setSelected(null)}/>}</div>}
""",encoding='utf-8')

# Admin fee toggle must actually be respected by the backend.
replace('functions/src/transactionFees.ts',
"  if(action==='wallet_to_card') return 0;\n  const minimum=currency==='USD'?minUsd:minCdf;",
"  if(action==='wallet_to_card'||override.enabled===false) return 0;\n  const minimum=currency==='USD'?minUsd:minCdf;")

# Keep the legacy developer fee schedule consistent with the current global policy.
replace('functions/src/developerPayments.ts',
"  wallet_to_card: { percent: 0.5, minUsd: 0.02, minCdf: 50, chargedTo: 'wallet' },",
"  wallet_to_card: { percent: 0, minUsd: 0, minCdf: 0, chargedTo: 'none' },")
replace('functions/src/developerPayments.ts',
"  agent_cash_in: { percent: 1.0, minUsd: 0.05, minCdf: 100, chargedTo: 'client' },",
"  agent_cash_in: { percent: 1.0, minUsd: 0.05, minCdf: 100, chargedTo: 'platform_commission' },")

print('current objectives security/audit fixes applied')
