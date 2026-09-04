import React,{useCallback,useEffect,useState}from'react';
import{RefreshCw,WalletCards}from'lucide-react';
import{useAuthStore}from'../../store/authStore';
import{agentWalletService,WalletServerSnapshot}from'../../services/agentWalletService';

export default function AgentProfile(){
  const{user}=useAuthStore();
  const[data,setData]=useState<WalletServerSnapshot|null>(null);
  const[loading,setLoading]=useState(false);

  const refresh=useCallback(async()=>{
    setLoading(true);
    try{setData(await agentWalletService.getMyWallets())}catch(error){console.warn('[AGENT_PROFILE_REFRESH_ERROR]',error)}finally{setLoading(false)}
  },[]);

  useEffect(()=>{
    void refresh();
    const timer=window.setInterval(()=>void refresh(),10000);
    const onVisible=()=>{if(document.visibilityState==='visible')void refresh()};
    const onFocus=()=>void refresh();
    document.addEventListener('visibilitychange',onVisible);window.addEventListener('focus',onFocus);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',onFocus)};
  },[refresh]);

  return <div className="mx-auto max-w-xl p-4 md:p-8">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-black text-blue-950">Profil agent</h1><button onClick={()=>void refresh()} className="grid h-10 w-10 place-items-center rounded-xl border bg-white text-blue-950"><RefreshCw size={17} className={loading?'animate-spin':''}/></button></div>
    <div className="mt-4 rounded-3xl border bg-white p-5 shadow-sm"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-800"><WalletCards/></div><h2 className="mt-3 text-lg font-black">{user?.displayName||'Agent Market-Cash'}</h2><p className="text-sm text-slate-500">{user?.email}</p><p className="mt-1 text-xs text-slate-400">{user?.phone}</p>
      {data?.marketCashId&&<div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase text-slate-400">ID Market-Cash</p><p className="mt-1 font-mono font-black text-blue-950">{data.marketCashId}</p></div>}
      {data?.rechargeNumber&&<div className="mt-3 rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase text-slate-400">Numéro interne</p><p className="mt-1 font-mono font-black text-blue-950">{data.rechargeNumber}</p></div>}
      <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-2xl bg-blue-950 p-4 text-white"><p className="text-[10px] font-black text-blue-200">FLOAT CDF</p><p className="mt-2 text-lg font-black">{Number(data?.wallets?.CDF?.availableBalance||0).toLocaleString('fr-FR')} CDF</p></div><div className="rounded-2xl bg-blue-950 p-4 text-white"><p className="text-[10px] font-black text-blue-200">FLOAT USD</p><p className="mt-2 text-lg font-black">{Number(data?.wallets?.USD?.availableBalance||0).toFixed(2)} USD</p></div></div>
      <p className="mt-3 text-center text-[10px] text-slate-400">Mise à jour automatique toutes les 10 secondes.</p>
    </div>
  </div>;
}
