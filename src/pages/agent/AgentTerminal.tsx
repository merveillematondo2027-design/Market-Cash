import React,{useEffect,useState}from'react';
import{ArrowDownLeft,ArrowUpRight,KeyRound,Search,ShieldCheck,UserRound,WalletCards}from'lucide-react';
import toast from'react-hot-toast';
import{agentWalletService,RechargeClientLookup,WalletServerSnapshot,WithdrawalInspection}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

const newKey=()=>`agent_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
const money=(value:number,currency:WalletCurrency)=>currency==='CDF'?`${Number(value||0).toLocaleString('fr-FR')} CDF`:`${Number(value||0).toFixed(2)} USD`;

export default function AgentTerminal(){
  const[recharge,setRecharge]=useState('');
  const[client,setClient]=useState<RechargeClientLookup|null>(null);
  const[withdrawCode,setWithdrawCode]=useState('');
  const[withdrawal,setWithdrawal]=useState<WithdrawalInspection|null>(null);
  const[agent,setAgent]=useState<WalletServerSnapshot|null>(null);
  const[currency,setCurrency]=useState<WalletCurrency>('CDF');
  const[amount,setAmount]=useState('');
  const[pin,setPin]=useState('');
  const[mode,setMode]=useState<'cash_in'|'cash_out'>('cash_in');
  const[loading,setLoading]=useState(false);

  const refreshAgent=()=>agentWalletService.getMyWallets().then(setAgent).catch(()=>{});
  useEffect(()=>{refreshAgent();},[]);

  const switchMode=(next:'cash_in'|'cash_out')=>{
    setMode(next);setClient(null);setWithdrawal(null);setAmount('');setPin('');
  };

  const findClient=async()=>{
    setLoading(true);
    try{const data=await agentWalletService.lookupClient(recharge);setClient(data);toast.success('Client trouvé');}
    catch(e:any){setClient(null);toast.error(e?.message||'Client introuvable');}
    finally{setLoading(false)}
  };

  const inspectWithdrawal=async()=>{
    setLoading(true);
    try{const data=await agentWalletService.inspectWithdrawalAuthorization(withdrawCode);setWithdrawal(data);toast.success('Code de retrait valide');}
    catch(e:any){setWithdrawal(null);toast.error(e?.message||'Code de retrait invalide');}
    finally{setLoading(false)}
  };

  const submitDeposit=async()=>{
    if(!client)return;
    const n=Number(amount);
    if(!Number.isFinite(n)||n<=0)return toast.error('Montant invalide');
    if(pin.length<4)return toast.error('Code secret agent requis');
    setLoading(true);
    try{
      const result=await agentWalletService.cashIn({rechargeNumber:client.rechargeNumber,currency,amount:n,pin,idempotencyKey:newKey()});
      toast.success(`Dépôt confirmé · ${result.reference}`);
      setAmount('');setPin('');
      setClient(await agentWalletService.lookupClient(client.rechargeNumber));
      await refreshAgent();
    }catch(e:any){toast.error(e?.message||'Dépôt refusé');}
    finally{setLoading(false)}
  };

  const submitWithdrawal=async()=>{
    if(!withdrawal)return;
    if(pin.length<4)return toast.error('Code secret agent requis');
    setLoading(true);
    try{
      const result=await agentWalletService.redeemWithdrawalAuthorization({code:withdrawCode,pin,idempotencyKey:newKey()});
      toast.success(`Retrait confirmé · ${result.reference}`);
      setPin('');setWithdrawCode('');setWithdrawal(null);
      await refreshAgent();
    }catch(e:any){toast.error(e?.message||'Retrait refusé');}
    finally{setLoading(false)}
  };

  const floatCurrency=mode==='cash_out'&&withdrawal?withdrawal.currency:currency;
  const float=agent?.wallets?.[floatCurrency]?.availableBalance||0;

  return <div className="mx-auto max-w-xl space-y-4 p-4 md:p-8">
    <header><p className="text-xs font-black uppercase tracking-wider text-amber-600">Terminal Market-Cash</p><h1 className="text-2xl font-black text-blue-950">Dépôt & retrait client</h1><p className="mt-1 text-sm text-slate-500">Les dépôts utilisent le numéro de recharge. Les retraits exigent un code à usage unique créé par le client.</p></header>

    <section className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1"><button onClick={()=>switchMode('cash_in')} className={`flex items-center justify-center gap-2 rounded-xl p-3 text-sm font-black ${mode==='cash_in'?'bg-emerald-600 text-white shadow-sm':'text-slate-600'}`}><ArrowDownLeft size={18}/> Dépôt</button><button onClick={()=>switchMode('cash_out')} className={`flex items-center justify-center gap-2 rounded-xl p-3 text-sm font-black ${mode==='cash_out'?'bg-amber-400 text-blue-950 shadow-sm':'text-slate-600'}`}><ArrowUpRight size={18}/> Retrait</button></section>

    <section className="rounded-3xl bg-blue-950 p-5 text-white shadow-lg"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider text-blue-200">Float agent disponible</p><p className="mt-1 text-3xl font-black">{money(Number(float),floatCurrency)}</p></div><WalletCards className="text-amber-400"/></div>{mode==='cash_in'&&<div className="mt-4 inline-flex rounded-xl bg-white/10 p-1"><button onClick={()=>setCurrency('CDF')} className={`rounded-lg px-4 py-2 text-xs font-black ${currency==='CDF'?'bg-white text-blue-950':''}`}>CDF</button><button onClick={()=>setCurrency('USD')} className={`rounded-lg px-4 py-2 text-xs font-black ${currency==='USD'?'bg-white text-blue-950':''}`}>USD</button></div>}</section>

    {mode==='cash_in'?<DepositPanel recharge={recharge} setRecharge={setRecharge} client={client} loading={loading} onFind={findClient} currency={currency} amount={amount} setAmount={setAmount} pin={pin} setPin={setPin} onSubmit={submitDeposit}/>:<WithdrawalPanel code={withdrawCode} setCode={setWithdrawCode} withdrawal={withdrawal} loading={loading} onInspect={inspectWithdrawal} pin={pin} setPin={setPin} onSubmit={submitWithdrawal}/>} 
  </div>;
}

function DepositPanel({recharge,setRecharge,client,loading,onFind,currency,amount,setAmount,pin,setPin,onSubmit}:{recharge:string;setRecharge:(v:string)=>void;client:RechargeClientLookup|null;loading:boolean;onFind:()=>void;currency:WalletCurrency;amount:string;setAmount:(v:string)=>void;pin:string;setPin:(v:string)=>void;onSubmit:()=>void}){
  return <>
    <section className="rounded-3xl border bg-white p-4 shadow-sm"><label className="text-xs font-black text-slate-500">Numéro de recharge client</label><div className="mt-2 flex gap-2"><input value={recharge} onChange={e=>setRecharge(e.target.value.replace(/\D/g,''))} inputMode="numeric" placeholder="Ex. 00123456789" className="min-w-0 flex-1 rounded-2xl border p-3 outline-none focus:border-blue-500"/><button disabled={loading||recharge.length<6} onClick={onFind} className="rounded-2xl bg-blue-950 px-4 font-black text-white disabled:opacity-40"><Search size={18}/></button></div></section>
    {client&&<><ClientCard client={client}/><section className="space-y-4 rounded-3xl border bg-white p-5 shadow-sm"><label className="block"><span className="text-xs font-black text-slate-500">Montant du dépôt ({currency})</span><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={currency==='CDF'?'50000':'10'} className="mt-1 w-full rounded-2xl border p-4 text-xl font-black outline-none focus:border-blue-500"/></label><AgentPin pin={pin} setPin={setPin}/><div className="flex gap-2 rounded-2xl bg-blue-50 p-3 text-xs text-blue-900"><ShieldCheck size={16} className="shrink-0"/>Le serveur débite le float de l'agent et crédite le portefeuille du client dans une même transaction.</div><button disabled={loading} onClick={onSubmit} className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-50">{loading?'Traitement...':'Confirmer le dépôt'}</button></section></>}
  </>;
}

function WithdrawalPanel({code,setCode,withdrawal,loading,onInspect,pin,setPin,onSubmit}:{code:string;setCode:(v:string)=>void;withdrawal:WithdrawalInspection|null;loading:boolean;onInspect:()=>void;pin:string;setPin:(v:string)=>void;onSubmit:()=>void}){
  return <>
    <section className="rounded-3xl border bg-white p-4 shadow-sm"><label className="text-xs font-black text-slate-500">Code de retrait du client</label><div className="mt-2 flex gap-2"><input value={code} onChange={e=>{setCode(e.target.value.replace(/\D/g,'').slice(0,8));}} inputMode="numeric" placeholder="8 chiffres" className="min-w-0 flex-1 rounded-2xl border p-3 text-center font-mono text-lg font-black tracking-[.18em] outline-none focus:border-blue-500"/><button disabled={loading||code.length!==8} onClick={onInspect} className="rounded-2xl bg-blue-950 px-4 font-black text-white disabled:opacity-40"><Search size={18}/></button></div><p className="mt-2 text-[11px] leading-5 text-slate-500">Le montant et la devise viennent de l'autorisation créée par le client et ne peuvent pas être modifiés par l'agent.</p></section>
    {withdrawal&&<section className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><UserRound/></div><div><h2 className="font-black text-slate-950">{withdrawal.clientName}</h2><p className="text-xs text-slate-500">{withdrawal.clientPhone||'Téléphone masqué'}</p></div></div><div className="mt-4 rounded-2xl bg-amber-50 p-4 text-center"><p className="text-xs font-black uppercase tracking-wider text-amber-700">Montant à remettre au client</p><p className="mt-1 text-3xl font-black text-blue-950">{money(withdrawal.amount,withdrawal.currency)}</p><p className="mt-2 text-[11px] text-amber-800">Code valable jusqu'à {new Date(withdrawal.expiresAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</p></div><div className="mt-4"><AgentPin pin={pin} setPin={setPin}/></div><div className="mt-4 flex gap-2 rounded-2xl bg-blue-50 p-3 text-xs leading-5 text-blue-900"><ShieldCheck size={16} className="shrink-0"/>Confirmez seulement lorsque vous êtes prêt à remettre l'espèce. Après validation, le code devient inutilisable.</div><button disabled={loading} onClick={onSubmit} className="mt-4 w-full rounded-2xl bg-amber-400 py-4 font-black text-blue-950 disabled:opacity-50">{loading?'Traitement...':'Confirmer le retrait'}</button></section>}
  </>;
}

function ClientCard({client}:{client:RechargeClientLookup}){return <section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-800"><UserRound/></div><div className="min-w-0"><h2 className="truncate font-black text-slate-950">{client.displayName}</h2><p className="text-xs text-slate-500">{client.phone||'Téléphone non renseigné'}</p><p className="font-mono text-[10px] text-slate-400">Recharge {client.rechargeNumber}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black text-slate-400">CDF</p><p className="font-black">{Number(client.balances.CDF||0).toLocaleString('fr-FR')} FC</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black text-slate-400">USD</p><p className="font-black">{Number(client.balances.USD||0).toFixed(2)} $</p></div></div></section>}

function AgentPin({pin,setPin}:{pin:string;setPin:(v:string)=>void}){return <label className="block"><span className="flex items-center gap-1 text-xs font-black text-slate-500"><KeyRound size={14}/> Code secret agent</span><input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} type="password" inputMode="numeric" placeholder="••••" className="mt-1 w-full rounded-2xl border p-4 text-center font-black tracking-[.35em] outline-none focus:border-blue-500"/></label>}
