import React,{useEffect,useState}from'react';
import{ArrowLeft,History,ShieldCheck,Store}from'lucide-react';
import{Link,useSearchParams}from'react-router-dom';
import{QRCodeSVG}from'qrcode.react';
import{agentWalletService,WalletServerSnapshot}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

const fmt=(v:number,c:WalletCurrency)=>c==='CDF'?`${v.toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${v.toFixed(2)} USD`;

export default function AgentWithdrawal(){
  const[params]=useSearchParams();
  const currency=(params.get('currency')==='CDF'?'CDF':'USD')as WalletCurrency;
  const[wallet,setWallet]=useState<WalletServerSnapshot|null>(null);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{agentWalletService.getMyWallets().then(setWallet).finally(()=>setLoading(false));},[]);
  const recharge=wallet?.rechargeNumber||'';
  const balance=Number(wallet?.wallets?.[currency]?.availableBalance||0);

  return <div className="mx-auto max-w-xl p-4 pb-28 md:p-8">
    <Link to="/client/home" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft size={16}/> Retour à l'accueil</Link>
    <section className="mt-5 rounded-3xl border bg-white p-5 shadow-sm md:p-6">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><Store/></div>
      <h1 className="mt-4 text-2xl font-black text-slate-950">Retrait en point de vente</h1>
      <p className="mt-1 text-sm text-slate-500">Présentez votre numéro de recharge Market-Cash à un agent point de vente autorisé.</p>
      <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-950">Solde disponible {currency} : <b>{fmt(balance,currency)}</b></div>

      {loading?<div className="mt-6 rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">Préparation du retrait…</div>:recharge?<div className="mt-6 text-center">
        <div className="inline-block rounded-3xl border bg-white p-4"><QRCodeSVG value={`MARKET-CASH-WITHDRAW:${recharge}`} size={190}/></div>
        <p className="mt-4 text-xs font-black uppercase tracking-wider text-slate-400">Numéro de recharge / retrait</p>
        <p className="mt-1 font-mono text-2xl font-black tracking-wider text-blue-950">{recharge}</p>
        <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-left text-sm leading-6 text-slate-600">
          <b className="text-slate-900">Au point de vente :</b> l'agent saisit ce numéro, vérifie votre nom, choisit le montant et confirme l'opération sur son terminal Market-Cash. Le montant est débité de votre portefeuille et crédité au float de l'agent.
        </div>
        <div className="mt-3 flex gap-2 rounded-2xl bg-amber-50 p-4 text-left text-xs leading-5 text-amber-900"><ShieldCheck className="shrink-0" size={18}/><span>Ne communiquez jamais votre code PIN au vendeur. Vérifiez le montant et le reçu Market-Cash avant de quitter le point de vente.</span></div>
        <Link to="/client/wallet/transactions" className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-blue-950 px-5 py-3 text-sm font-black text-white"><History size={17}/> Vérifier mes opérations</Link>
      </div>:<div className="mt-6 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">Impossible de générer votre numéro de retrait pour le moment.</div>}
    </section>
  </div>;
}
