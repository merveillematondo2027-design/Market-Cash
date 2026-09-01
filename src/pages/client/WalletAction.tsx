import React, { useMemo } from 'react';
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, History, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { walletService } from '../../services/walletService';

type Action = 'send' | 'receive' | 'transactions' | 'top-up';

export default function WalletAction({ action }: { action: Action }) {
  const { user } = useAuthStore();
  const wallet = useMemo(() => user?.uid ? walletService.getWalletPreview(user.uid) : null, [user?.uid]);
  const title = { send: 'Envoyer', receive: 'Recevoir', transactions: 'Transactions', 'top-up': 'Recharger' }[action];
  const Icon = action === 'send' ? Send : action === 'receive' ? ArrowDownLeft : action === 'transactions' ? History : ArrowUpRight;
  const reserve = () => toast('Connexion partenaire via backend Market-Cash et GMH APIs en préparation.', { icon: '⏳' });

  return <div className="max-w-xl mx-auto p-4 md:p-8 pb-28 space-y-5">
    <Link to="/client/wallet" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft size={16}/> Wallet</Link>
    <section className="rounded-[30px] bg-white border border-slate-200 p-6 shadow-sm">
      <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center"><Icon size={24}/></div>
      <h1 className="text-2xl font-black text-blue-950 mt-4">{title}</h1>
      {action === 'receive' && wallet ? <div className="mt-5 text-center"><div className="inline-block p-4 rounded-3xl border bg-white"><QRCodeSVG value={`MARKET-CASH:WALLET:${wallet.localPaymentId}`} size={180}/></div><p className="font-mono font-black text-blue-950 mt-3">{wallet.localPaymentId}</p><p className="text-sm text-slate-500 mt-1">Présentez ce QR pour recevoir un paiement local Market-Cash.</p></div> : null}
      {action === 'transactions' ? <div className="mt-6 rounded-2xl bg-slate-50 p-6 text-center text-slate-500">Aucune transaction wallet disponible pour le moment.</div> : null}
      {action === 'send' ? <div className="mt-5 space-y-3"><input disabled placeholder="Téléphone, ID Market-Cash ou QR" className="w-full rounded-2xl border p-4 bg-slate-50"/><input disabled placeholder="Montant" className="w-full rounded-2xl border p-4 bg-slate-50"/><button onClick={reserve} className="w-full rounded-2xl bg-blue-950 text-white py-4 font-black">Continuer</button></div> : null}
      {action === 'top-up' ? <div className="mt-5 space-y-3"><button onClick={reserve} className="w-full rounded-2xl border border-slate-200 p-4 text-left font-black">M-Pesa / Mobile Money <span className="block text-xs text-slate-500 font-medium mt-1">Demande sécurisée via GMH APIs</span></button><button onClick={reserve} className="w-full rounded-2xl border border-slate-200 p-4 text-left font-black">Agent / Terminal Market-Cash <span className="block text-xs text-slate-500 font-medium mt-1">Dépôt local sur le wallet</span></button></div> : null}
    </section>
  </div>;
}
