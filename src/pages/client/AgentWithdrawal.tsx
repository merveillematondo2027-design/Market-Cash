import React,{useEffect,useState}from'react';
import{ArrowLeft,CreditCard,Eye,EyeOff,History,MapPin,Radio,ScanLine,ShieldCheck}from'lucide-react';
import{Link,useSearchParams}from'react-router-dom';
import SecurityConfirmModal from'../../components/SecurityConfirmModal';
import{useSensitiveReveal}from'../../hooks/useSensitiveReveal';
import{agentWalletService,InternalCardSummary}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

const fmt=(v:number,c:WalletCurrency)=>c==='CDF'?`${Number(v||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(v||0).toFixed(2)} USD`;

export default function AgentWithdrawal(){
  const[params]=useSearchParams();
  const[currency,setCurrency]=useState<WalletCurrency>(params.get('currency')==='CDF'?'CDF':'USD');
  const[card,setCard]=useState<InternalCardSummary|null>(null);
  const[loading,setLoading]=useState(true);
  const secure=useSensitiveReveal(90000);
  useEffect(()=>{agentWalletService.getMyInternalCards().then(cards=>setCard(cards[0]||null)).catch(()=>setCard(null)).finally(()=>setLoading(false))},[]);

  return <div className="mx-auto max-w-xl p-4 pb-28 md:p-8">
    <Link to="/client/cards?card=local" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft size={16}/>Ma carte locale</Link>
    <section className="mt-5 rounded-[2rem] border bg-white p-5 shadow-sm md:p-6">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><MapPin/></div>
      <h1 className="mt-4 text-2xl font-black text-slate-950">Retrait chez un Agent Market-Cash</h1>
      <p className="mt-1 text-sm leading-6 text-slate-500">Le retrait est débité directement de votre carte locale et confirmé avec son <b>CVV à 3 chiffres</b>.</p>
      <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1"><button onClick={()=>setCurrency('CDF')} className={`rounded-xl py-3 text-sm font-black ${currency==='CDF'?'bg-white text-blue-950 shadow-sm':'text-slate-500'}`}>CDF</button><button onClick={()=>setCurrency('USD')} className={`rounded-xl py-3 text-sm font-black ${currency==='USD'?'bg-white text-blue-950 shadow-sm':'text-slate-500'}`}>USD</button></div>
      <div className="mt-5 space-y-3"><Step icon={<CreditCard size={18}/>} title="Présentez votre carte locale" text="L’agent saisit le numéro de 16 chiffres ou utilise un moyen de lecture compatible."/><Step icon={<Radio size={18}/>} title="Sans contact" text="Si la lecture NFC est disponible, approchez la carte du terminal."/><Step icon={<ScanLine size={18}/>} title="QR Market-Cash" text="Le terminal peut aussi scanner le QR technique lié à la carte locale."/><Step icon={<ShieldCheck size={18}/>} title="Confirmez avec votre CVV" text={`Après que l’agent a choisi ${currency} et le montant, saisissez vous-même les 3 chiffres du CVV. Ne communiquez jamais le code secret de l’application.`}/></div>
      <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-xs leading-5 text-blue-950"><b>Deux sécurités :</b> le code secret de l’application révèle les informations sensibles ; le CVV confirme le retrait.</div>
      <div className="mt-6"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Votre carte locale</p>{loading?<div className="mt-3 rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500">Chargement…</div>:!card?<div className="mt-3 rounded-2xl border border-dashed p-4 text-center text-sm text-slate-500">Aucune carte locale active trouvée.</div>:<div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border p-4"><div className="min-w-0"><p className="truncate font-black text-slate-950">{card.cardHolder}</p><p className="text-xs text-slate-500">{card.maskedNumber}</p></div><div className="flex items-center gap-2"><div className="shrink-0 text-right"><p className="text-[10px] font-black uppercase text-slate-400">Solde {currency}</p><p className="font-black text-blue-950">{secure.revealed?fmt(Number(card.balances?.[currency]||0),currency):'••••••'}</p></div><button onClick={secure.request} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-blue-950">{secure.revealed?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></div>}</div>
    </section>
    <Link to="/client/wallet/transactions" className="mt-4 flex items-center justify-center gap-2 rounded-2xl border bg-white px-5 py-3 text-sm font-black text-blue-950"><History size={17}/>Historique des opérations</Link>
    <SecurityConfirmModal open={secure.open} busy={secure.busy} onClose={secure.close} onConfirm={secure.confirm} title="Afficher le solde" subtitle="Entrez le code secret de l'application. Le CVV reste requis séparément pour confirmer le retrait."/>
  </div>;
}
function Step({icon,title,text}:{icon:React.ReactNode;title:string;text:string}){return <div className="flex gap-3 rounded-2xl bg-slate-50 p-4"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-blue-950 shadow-sm">{icon}</div><div><p className="text-sm font-black text-slate-950">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div></div>}
