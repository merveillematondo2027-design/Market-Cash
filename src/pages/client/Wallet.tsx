import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowDownToLine, ArrowUpRight, Banknote, CreditCard, History, Nfc, QrCode, ShieldCheck, Smartphone, WalletCards } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { walletService } from '../../services/walletService';

const money = (value: number, currency: string) => `${value.toFixed(2)} ${currency}`;

export default function ClientWallet() {
  const { user } = useAuthStore();
  const wallet = useMemo(() => user?.uid ? walletService.getWalletPreview(user.uid) : null, [user?.uid]);
  const transactions = walletService.getTransactionsPreview();
  const qrPayload = useMemo(() => wallet ? `MARKET-CASH:WALLET:${wallet.localPaymentId}` : '', [wallet]);

  if (!wallet) return <div className="p-6"><div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-red-700 font-bold">Portefeuille indisponible pour le moment.</div></div>;

  const reservePartnerAction = (label: string) => {
    toast(`${label} sera exécuté par GMH APIs dès que le backend et le connecteur partenaire seront activés.`, { icon: '⏳' });
  };

  return <div className="max-w-6xl mx-auto p-4 md:p-8 pb-28 space-y-6">
    <section className="rounded-[28px] bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 text-white p-6 md:p-8 shadow-xl overflow-hidden relative">
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-xs uppercase tracking-[.2em] text-blue-200 font-black">Portefeuille Market-Cash</p><h1 className="text-3xl md:text-4xl font-black mt-2">{money(wallet.availableBalance, wallet.currency)}</h1></div>
          <div className="w-14 h-14 rounded-2xl bg-amber-400 text-blue-950 flex items-center justify-center"><WalletCards size={28}/></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-6 text-sm">
          <div className="rounded-2xl bg-white/10 border border-white/10 p-4"><div className="text-blue-200 text-xs">Solde comptable</div><div className="font-black mt-1">{money(wallet.ledgerBalance, wallet.currency)}</div></div>
          <div className="rounded-2xl bg-white/10 border border-white/10 p-4"><div className="text-blue-200 text-xs">Montant réservé</div><div className="font-black mt-1">{money(wallet.heldBalance, wallet.currency)}</div></div>
        </div>
        <div className="mt-5 flex items-center gap-2 text-xs text-blue-200"><ShieldCheck size={15}/> Wallet {wallet.status === 'active' ? 'actif' : wallet.status} · {wallet.localPaymentId}</div>
      </div>
    </section>

    <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <button onClick={() => reservePartnerAction('Recharge Mobile Money')} className="rounded-2xl bg-white border border-slate-200 p-4 text-left shadow-sm hover:border-blue-400"><Smartphone className="text-blue-700"/><div className="font-black mt-3">Recharger</div><div className="text-xs text-slate-500">M-Pesa / partenaires via GMH APIs</div></button>
      <button onClick={() => reservePartnerAction('Dépôt agent / terminal')} className="rounded-2xl bg-white border border-slate-200 p-4 text-left shadow-sm hover:border-blue-400"><Banknote className="text-emerald-600"/><div className="font-black mt-3">Agent</div><div className="text-xs text-slate-500">Cash-in depuis terminal local</div></button>
      <button onClick={() => reservePartnerAction('Transfert bancaire')} className="rounded-2xl bg-white border border-slate-200 p-4 text-left shadow-sm hover:border-blue-400"><ArrowUpRight className="text-violet-600"/><div className="font-black mt-3">Transférer</div><div className="text-xs text-slate-500">Rail bancaire futur</div></button>
      <Link to="/client/cards" className="rounded-2xl bg-white border border-slate-200 p-4 text-left shadow-sm hover:border-blue-400"><CreditCard className="text-amber-600"/><div className="font-black mt-3">Visa virtuelle</div><div className="text-xs text-slate-500">Carte Visa dans l'application</div></Link>
    </section>

    <section className="grid md:grid-cols-2 gap-4">
      <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="flex justify-between items-start"><div><p className="text-xs uppercase font-black tracking-wider text-slate-400">Carte physique Market-Cash</p><h2 className="text-xl font-black text-blue-950 mt-1">Wallet local</h2></div><Nfc className="text-blue-700"/></div>
        <p className="text-sm text-slate-600 mt-3">Cette carte physique n'est pas Visa. Elle représente votre wallet Market-Cash pour les paiements locaux sur terminaux Market-Cash, via NFC et QR.</p>
        <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-200 p-4 flex items-center gap-4">
          <div className="bg-white p-2 rounded-xl border"><QRCodeSVG value={qrPayload} size={86}/></div>
          <div><div className="text-xs text-slate-400 font-bold">Identifiant paiement local</div><div className="font-mono font-black text-blue-950 break-all">{wallet.localPaymentId}</div><div className="mt-2 text-xs text-emerald-700 font-bold flex items-center gap-1"><QrCode size={13}/> QR prêt · NFC réservé au réseau local</div></div>
        </div>
      </div>

      <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="flex justify-between items-start"><div><p className="text-xs uppercase font-black tracking-wider text-slate-400">Carte internationale</p><h2 className="text-xl font-black text-blue-950 mt-1">Market-Cash Visa virtuelle</h2></div><CreditCard className="text-amber-500"/></div>
        <p className="text-sm text-slate-600 mt-3">La Visa reste exclusivement virtuelle dans l'application. Son émission et ses paiements internationaux seront branchés sur un partenaire bancaire/issuer via GMH APIs.</p>
        <Link to="/client/cards" className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-950 text-white font-black text-sm">Gérer ma Visa virtuelle <ArrowUpRight size={15}/></Link>
      </div>
    </section>

    <section className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-center gap-2"><History className="text-blue-800"/><h2 className="font-black text-blue-950">Activité du portefeuille</h2></div>
      {transactions.length === 0 ? <div className="p-8 text-center text-slate-500"><ArrowDownToLine className="mx-auto mb-2"/>Aucune transaction wallet pour le moment.</div> : null}
    </section>

    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <strong>Fondation sécurisée :</strong> le solde affiché reste à zéro tant que le backend ledger Market-Cash n'est pas connecté. Aucune action partenaire ne peut créditer ou débiter le wallet depuis React. Les appels M-Pesa, banque et Visa passeront par le backend Market-Cash puis GMH APIs avant toute écriture comptable.
    </section>
  </div>;
}
