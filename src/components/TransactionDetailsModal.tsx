import React from 'react';
import { CheckCircle2, CircleX, Clock3, ReceiptText, X } from 'lucide-react';

type Props={transaction:any;onClose:()=>void};
type DetailRow=[string,React.ReactNode];

const finite=(...values:any[])=>{for(const value of values){const n=Number(value);if(value!==null&&value!==undefined&&value!==''&&Number.isFinite(n))return n}return null};
const money=(value:any,currency='USD')=>{const n=Number(value||0);return currency==='CDF'?`${n.toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${n.toFixed(2)} USD`};
const words=(value:any)=>String(value||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const statusText=(status:any)=>{const s=String(status||'settled').toLowerCase();if(['settled','completed','approved','success'].includes(s))return'Réussie';if(['failed','declined','rejected'].includes(s))return'Échouée';if(s==='cancelled')return'Annulée';if(s==='pending')return'En attente';return words(s)};
const failureText=(code:any)=>({INSUFFICIENT_FUNDS:'Solde insuffisant',CARD_INACTIVE:'Carte inactive',CARD_ACCOUNT_INACTIVE:'Compte carte inactif',CVV_INVALID:'Code de sécurité incorrect',EXPIRY_INVALID:'Date d’expiration invalide',EXPIRY_MISMATCH:'Date d’expiration incorrecte',CARD_INVALID:'Carte invalide',CARD_NOT_FOUND:'Carte introuvable',HOLDER_MISMATCH:'Informations du titulaire non reconnues',DEVELOPER_WALLET_INACTIVE:'Compte du bénéficiaire indisponible'} as Record<string,string>)[String(code||'')]||words(code);

export default function TransactionDetailsModal({transaction:t,onClose}:Props){
  const currency=String(t?.currency||'USD').toUpperCase();
  const status=String(t?.status||'settled').toLowerCase();
  const failed=['failed','declined','rejected','cancelled'].includes(status);
  const balanceBefore=finite(t?.balanceBefore,t?.cardBalanceBefore,t?.walletBalanceBefore,t?.clientBalanceBefore,t?.senderBalanceBefore);
  const balanceAfter=finite(t?.balanceAfter,t?.cardBalanceAfter,t?.walletBalanceAfter,t?.clientBalanceAfter,t?.senderBalanceAfter);
  const beneficiary=t?.merchantName||t?.developerName||t?.recipientName||t?.beneficiaryName||t?.clientName||'';
  const failure=t?.failureCode||t?.declineCode||t?.errorCode||'';
  const rawRows:DetailRow[]=[
    ['Référence',t?.reference||'—'],
    ['Transaction',t?.id||t?.transactionId||'—'],
    ['Référence externe',t?.externalReference||''],
    ['Type',words(t?.type||'transaction')],
    ['Statut',statusText(status)],
    ['Montant',money(t?.amount,currency)],
    ['Frais',t?.feeAmount!==undefined?money(t.feeAmount,currency):''],
    ['Total débité',t?.totalDebited!==undefined?money(t.totalDebited,currency):''],
    ['Bénéficiaire',beneficiary],
    ['Application',t?.appName||''],
    ['Carte',t?.cardLast4?`•••• ${t.cardLast4}`:''],
    ['Canal',t?.rail?words(t.rail):''],
    ['Origine',t?.source?words(t.source):''],
    ['Motif',t?.reason||''],
    ['Cause',failure?failureText(failure):''],
    ['Solde avant',balanceBefore!==null?money(balanceBefore,currency):''],
    ['Solde après opération',balanceAfter!==null?money(balanceAfter,currency):''],
    ['Date et heure',t?.createdAt?new Date(Number(t.createdAt)).toLocaleString('fr-FR'):'—'],
  ];
  const rows=rawRows.filter(([,value])=>value!==''&&value!==null&&value!==undefined);

  return <div className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4" onClick={onClose}>
    <section onClick={e=>e.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white/95 p-5 backdrop-blur">
        <div className="flex gap-3"><div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${failed?'bg-rose-50 text-rose-700':'bg-emerald-50 text-emerald-700'}`}>{failed?<CircleX size={22}/>:<CheckCircle2 size={22}/>}</div><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Détails de transaction</p><h2 className="mt-1 text-lg font-black text-slate-950">{beneficiary||words(t?.type||'Transaction')}</h2><p className={`mt-1 text-xs font-black ${failed?'text-rose-600':'text-emerald-700'}`}>{statusText(status)}</p></div></div>
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-600" aria-label="Fermer"><X size={18}/></button>
      </header>
      <div className="space-y-4 p-5">
        <div className="rounded-3xl bg-blue-950 p-5 text-white"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-blue-200">Montant</p><p className="mt-1 text-2xl font-black">{money(t?.amount,currency)}</p></div><ReceiptText className="text-amber-400" size={28}/></div>{balanceAfter!==null&&<div className="mt-4 border-t border-white/10 pt-4"><p className="text-[10px] font-black uppercase tracking-wider text-blue-200">Solde après opération</p><p className="mt-1 text-lg font-black">{money(balanceAfter,currency)}</p></div>}</div>
        {failed&&failure&&<div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><b>Paiement non exécuté.</b><p className="mt-1">{failureText(failure)}. Le solde affiché après l’opération reste inchangé lorsqu’aucun débit n’a été effectué.</p></div>}
        <div className="overflow-hidden rounded-3xl border border-slate-200">{rows.map(([label,value])=><div key={label} className="grid grid-cols-[128px_1fr] gap-3 border-b border-slate-100 px-4 py-3 last:border-0"><span className="text-[11px] font-bold text-slate-400">{label}</span><span className="break-words text-right text-xs font-bold text-slate-700">{value}</span></div>)}</div>
        <p className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400"><Clock3 size={12}/>Informations enregistrées par Market-Cash au moment de l’opération.</p>
      </div>
    </section>
  </div>;
}
