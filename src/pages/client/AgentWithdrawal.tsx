import React,{useEffect,useMemo,useState}from'react';
import{ArrowLeft,CheckCircle2,Clock3,History,ShieldCheck,Store,XCircle}from'lucide-react';
import{Link,useSearchParams}from'react-router-dom';
import{QRCodeSVG}from'qrcode.react';
import toast from'react-hot-toast';
import{agentWalletService,WalletServerSnapshot,WithdrawalAuthorization}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

const fmt=(v:number,c:WalletCurrency)=>c==='CDF'?`${v.toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${v.toFixed(2)} USD`;

export default function AgentWithdrawal(){
  const[params]=useSearchParams();
  const[currency,setCurrency]=useState<WalletCurrency>(params.get('currency')==='CDF'?'CDF':'USD');
  const[wallet,setWallet]=useState<WalletServerSnapshot|null>(null);
  const[amount,setAmount]=useState('');
  const[pin,setPin]=useState('');
  const[authorization,setAuthorization]=useState<WithdrawalAuthorization|null>(null);
  const[loading,setLoading]=useState(true);
  const[busy,setBusy]=useState(false);

  const refresh=()=>agentWalletService.getMyWallets().then(setWallet).catch(()=>setWallet(null));
  useEffect(()=>{refresh().finally(()=>setLoading(false));},[]);
  const balance=Number(wallet?.wallets?.[currency]?.availableBalance||0);
  const value=useMemo(()=>Number(String(amount).replace(',','.')),[amount]);
  const valid=Number.isFinite(value)&&value>0&&value<=balance;

  const createAuthorization=async()=>{
    if(!valid)return toast.error('Montant invalide ou solde insuffisant.');
    if(pin.length<4)return toast.error('Saisissez votre code PIN Market-Cash.');
    setBusy(true);
    try{
      const result=await agentWalletService.createWithdrawalAuthorization({currency,amount:value,pin});
      setAuthorization(result);setPin('');
      toast.success('Code de retrait sécurisé créé.');
    }catch(e:any){toast.error(e?.message||'Impossible de créer le retrait.');}
    finally{setBusy(false)}
  };

  const cancelAuthorization=async()=>{
    if(!authorization)return;
    setBusy(true);
    try{await agentWalletService.cancelWithdrawalAuthorization(authorization.authorizationId);setAuthorization(null);toast.success('Code de retrait annulé.');}
    catch(e:any){toast.error(e?.message||'Annulation impossible.');}
    finally{setBusy(false)}
  };

  return <div className="mx-auto max-w-xl p-4 pb-28 md:p-8">
    <Link to="/client/home" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft size={16}/> Retour à l'accueil</Link>
    <section className="mt-5 rounded-3xl border bg-white p-5 shadow-sm md:p-6">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><Store/></div>
      <h1 className="mt-4 text-2xl font-black text-slate-950">Retrait en point de vente</h1>
      <p className="mt-1 text-sm text-slate-500">Créez un code à usage unique puis présentez-le à un Agent point de vente Market-Cash.</p>

      {loading?<div className="mt-6 rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">Préparation du retrait…</div>:!authorization?<>
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1"><button onClick={()=>setCurrency('CDF')} className={`rounded-xl py-3 text-sm font-black ${currency==='CDF'?'bg-white text-blue-950 shadow-sm':'text-slate-500'}`}>CDF</button><button onClick={()=>setCurrency('USD')} className={`rounded-xl py-3 text-sm font-black ${currency==='USD'?'bg-white text-blue-950 shadow-sm':'text-slate-500'}`}>USD</button></div>
        <div className="mt-3 rounded-2xl bg-blue-50 p-4 text-sm text-blue-950">Solde disponible {currency} : <b>{fmt(balance,currency)}</b></div>
        <div className="mt-5 space-y-3"><label className="block"><span className="text-xs font-black uppercase text-slate-500">Montant à retirer</span><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={currency==='CDF'?'Ex. 50000':'Ex. 20'} className="mt-1 w-full rounded-2xl border p-4 text-xl font-black outline-none focus:border-blue-500"/></label>{value>balance&&<p className="text-xs font-bold text-red-600">Solde insuffisant.</p>}<label className="block"><span className="text-xs font-black uppercase text-slate-500">Votre code PIN</span><input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} type="password" inputMode="numeric" placeholder="••••" className="mt-1 w-full rounded-2xl border p-4 text-center tracking-[.35em] outline-none focus:border-blue-500"/></label></div>
        <div className="mt-4 flex gap-2 rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-900"><ShieldCheck className="shrink-0" size={18}/><span>Votre PIN reste privé. L'agent reçoit uniquement le code de retrait, le montant et la devise déjà autorisés par vous.</span></div>
        <button disabled={busy||!valid||pin.length<4} onClick={createAuthorization} className="mt-4 w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">{busy?'Création…':'Créer mon code de retrait'}</button>
      </>:<AuthorizationCard authorization={authorization} busy={busy} onCancel={cancelAuthorization}/>} 
    </section>
    <Link to="/client/wallet/transactions" className="mt-4 flex items-center justify-center gap-2 rounded-2xl border bg-white px-5 py-3 text-sm font-black text-blue-950"><History size={17}/> Historique des opérations</Link>
  </div>;
}

function AuthorizationCard({authorization,busy,onCancel}:{authorization:WithdrawalAuthorization;busy:boolean;onCancel:()=>void}){
  const expired=authorization.expiresAt<=Date.now();
  return <div className="mt-6 text-center">
    <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700"><CheckCircle2 size={16}/> Retrait autorisé</div>
    <div className="mt-4 inline-block rounded-3xl border bg-white p-4"><QRCodeSVG value={`MARKET-CASH-WITHDRAW:${authorization.code}`} size={190}/></div>
    <p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">Code à remettre à l'agent</p>
    <p className="mt-1 font-mono text-3xl font-black tracking-[.18em] text-blue-950">{authorization.code}</p>
    <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Montant autorisé</p><p className="mt-1 text-2xl font-black text-slate-950">{fmt(authorization.amount,authorization.currency)}</p></div>
    <div className={`mt-3 flex items-center justify-center gap-2 rounded-2xl p-3 text-xs font-bold ${expired?'bg-red-50 text-red-700':'bg-amber-50 text-amber-800'}`}><Clock3 size={16}/>{expired?'Code expiré':`Valable jusqu’à ${new Date(authorization.expiresAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`}</div>
    <p className="mt-4 text-xs leading-5 text-slate-500">L'Agent saisit ce code dans son terminal et confirme avec son propre PIN. Le serveur vérifie le code, sa durée de validité et votre solde avant de débiter votre portefeuille.</p>
    <button disabled={busy} onClick={onCancel} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-700 disabled:opacity-40"><XCircle size={17}/> Annuler ce code</button>
  </div>;
}
