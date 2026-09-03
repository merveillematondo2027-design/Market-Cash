import React,{useEffect,useState}from'react';
import{ArrowLeft,CreditCard,History,MapPin,Radio,ScanLine,ShieldCheck}from'lucide-react';
import{Link,useSearchParams}from'react-router-dom';
import{agentWalletService,InternalCardSummary}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

const fmt=(v:number,c:WalletCurrency)=>c==='CDF'?`${Number(v||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(v||0).toFixed(2)} USD`;

export default function AgentWithdrawal(){
  const[params]=useSearchParams();
  const[currency,setCurrency]=useState<WalletCurrency>(params.get('currency')==='CDF'?'CDF':'USD');
  const[cards,setCards]=useState<InternalCardSummary[]>([]);
  const[loading,setLoading]=useState(true);

  useEffect(()=>{
    agentWalletService.getMyInternalCards().then(setCards).catch(()=>setCards([])).finally(()=>setLoading(false));
  },[]);

  return <div className="mx-auto max-w-xl p-4 pb-28 md:p-8">
    <Link to="/client/home" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft size={16}/> Retour à l'accueil</Link>
    <section className="mt-5 rounded-3xl border bg-white p-5 shadow-sm md:p-6">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><MapPin/></div>
      <h1 className="mt-4 text-2xl font-black text-slate-950">Retrait chez un Agent Market-Cash</h1>
      <p className="mt-1 text-sm leading-6 text-slate-500">Le retrait ne part plus directement de votre wallet principal. Il est débité de votre <b>carte locale Market-Cash</b> au terminal de l'agent.</p>

      <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1"><button onClick={()=>setCurrency('CDF')} className={`rounded-xl py-3 text-sm font-black ${currency==='CDF'?'bg-white text-blue-950 shadow-sm':'text-slate-500'}`}>CDF</button><button onClick={()=>setCurrency('USD')} className={`rounded-xl py-3 text-sm font-black ${currency==='USD'?'bg-white text-blue-950 shadow-sm':'text-slate-500'}`}>USD</button></div>

      <div className="mt-5 space-y-3">
        <Step icon={<CreditCard size={18}/>} title="Présentez votre carte locale" text="L'agent saisit le numéro de la carte ou la lit avec son terminal compatible."/>
        <Step icon={<Radio size={18}/>} title="NFC / carte sans contact" text="Si votre carte Market-Cash est configurée NFC, approchez-la du terminal pour remplir automatiquement ses informations."/>
        <Step icon={<ScanLine size={18}/>} title="QR Market-Cash" text="Le terminal peut aussi scanner le QR associé à votre carte locale."/>
        <Step icon={<ShieldCheck size={18}/>} title="Saisissez vous-même votre code" text={`Après que l'agent a choisi ${currency} et le montant, saisissez votre code secret directement sur son terminal. Ne le communiquez pas à voix haute.`}/>
      </div>

      <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-xs leading-5 text-blue-950"><b>Aucun code de retrait préalable n'est nécessaire.</b> Le serveur vérifie votre carte, son solde dans la devise choisie et votre code au moment de l'opération.</div>

      <div className="mt-6"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Mes cartes locales disponibles</p>{loading?<div className="mt-3 rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500">Chargement des cartes…</div>:cards.length===0?<div className="mt-3 rounded-2xl border border-dashed p-4 text-center text-sm text-slate-500">Aucune carte locale active trouvée.</div>:<div className="mt-3 space-y-2">{cards.map(card=><div key={card.cardId} className="flex items-center justify-between gap-3 rounded-2xl border p-4"><div className="min-w-0"><p className="truncate font-black text-slate-950">{card.cardHolder}</p><p className="text-xs text-slate-500">{card.maskedNumber}</p><p className="truncate font-mono text-[10px] text-slate-400">{card.cardIdentifier}</p></div><div className="shrink-0 text-right"><p className="text-[10px] font-black uppercase text-slate-400">Solde {currency}</p><p className="font-black text-blue-950">{fmt(Number(card.balances?.[currency]||0),currency)}</p></div></div>)}</div>}</div>
    </section>
    <Link to="/client/wallet/transactions" className="mt-4 flex items-center justify-center gap-2 rounded-2xl border bg-white px-5 py-3 text-sm font-black text-blue-950"><History size={17}/> Historique des opérations</Link>
  </div>;
}

function Step({icon,title,text}:{icon:React.ReactNode;title:string;text:string}){return <div className="flex gap-3 rounded-2xl bg-slate-50 p-4"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-blue-950 shadow-sm">{icon}</div><div><p className="text-sm font-black text-slate-950">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div></div>}
