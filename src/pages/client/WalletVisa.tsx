import React from 'react';
import { ArrowLeft, CreditCard, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function WalletVisa() {
  return (
    <div className="max-w-xl mx-auto p-4 md:p-8 pb-28">
      <Link to="/client/wallet" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 mb-5">
        <ArrowLeft size={16} /> Wallet
      </Link>
      <section className="rounded-[32px] bg-gradient-to-br from-blue-700 to-blue-950 text-white p-7 shadow-xl">
        <div className="flex justify-between">
          <div>
            <p className="text-xs font-black tracking-[.2em]">MARKET-CASH</p>
            <p className="text-xs text-blue-200 mt-1">VIRTUAL VISA</p>
          </div>
          <CreditCard />
        </div>
        <div className="mt-16 text-2xl tracking-[.2em] font-mono">•••• •••• •••• ••••</div>
        <div className="flex justify-between mt-8 text-xs"><span>Carte internationale</span><span>VISA</span></div>
      </section>
      <div className="mt-5 rounded-3xl bg-white border p-6 text-center">
        <span className="inline-flex px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-black">COMING SOON</span>
        <h1 className="text-2xl font-black text-blue-950 mt-3">Visa virtuelle Market-Cash</h1>
        <p className="text-sm text-slate-500 mt-2">La Visa reste exclusivement virtuelle dans l'application. Son émission et les opérations internationales seront activées via un partenaire bancaire/issuer et MHT APIs.</p>
        <div className="mt-4 flex justify-center items-center gap-2 text-xs font-bold text-emerald-700"><ShieldCheck size={15} /> Aucune donnée Visa fictive n'est utilisable</div>
      </div>
    </div>
  );
}
