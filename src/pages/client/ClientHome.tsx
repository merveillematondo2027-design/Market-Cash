import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, CreditCard, QrCode, Send, Smartphone, WalletCards } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export default function ClientHome() {
  const { user } = useAuthStore();
  const firstName = user?.displayName?.split(' ')[0] || 'Client';

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 pb-28 space-y-5">
      <section>
        <p className="text-sm text-slate-500 font-semibold">Bonsoir, {firstName}</p>
        <h1 className="text-2xl md:text-3xl font-black text-blue-950">Votre argent, vos paiements, simplement.</h1>
      </section>

      <section className="rounded-[30px] bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 text-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div><p className="text-xs uppercase tracking-[.2em] text-blue-200 font-black">Solde Market-Cash</p><p className="text-4xl font-black mt-2">0.00 USD</p><p className="text-xs text-blue-200 mt-2">Wallet local sécurisé</p></div>
          <WalletCards className="text-amber-400" size={34}/>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-6">
          <Link to="/client/wallet/send" className="text-center rounded-2xl bg-white/10 p-3"><Send className="mx-auto" size={20}/><span className="text-[11px] font-bold block mt-1">Envoyer</span></Link>
          <Link to="/client/wallet/receive" className="text-center rounded-2xl bg-white/10 p-3"><ArrowDownLeft className="mx-auto" size={20}/><span className="text-[11px] font-bold block mt-1">Recevoir</span></Link>
          <Link to="/client/wallet/top-up" className="text-center rounded-2xl bg-white/10 p-3"><ArrowUpRight className="mx-auto" size={20}/><span className="text-[11px] font-bold block mt-1">Recharger</span></Link>
          <Link to="/client/wallet" className="text-center rounded-2xl bg-amber-400 text-blue-950 p-3"><WalletCards className="mx-auto" size={20}/><span className="text-[11px] font-black block mt-1">Wallet</span></Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Link to="/client/cards" className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm"><CreditCard className="text-blue-700"/><h2 className="font-black text-blue-950 mt-3">Mes cartes</h2><p className="text-xs text-slate-500 mt-1">Visa virtuelle et carte locale Market-Cash.</p></Link>
        <Link to="/client/wallet/receive" className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm"><QrCode className="text-emerald-600"/><h2 className="font-black text-blue-950 mt-3">Mon QR</h2><p className="text-xs text-slate-500 mt-1">Recevoir un paiement Market-Cash local.</p></Link>
      </section>

      <section className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center gap-3"><Smartphone className="text-violet-600"/><div><h2 className="font-black text-blue-950">Services financiers</h2><p className="text-xs text-slate-500">e-SIM et Crypto sont préparés dans l'application et seront activés progressivement.</p></div></div>
      </section>
    </div>
  );
}
