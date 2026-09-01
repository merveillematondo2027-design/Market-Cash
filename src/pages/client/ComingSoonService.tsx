import React from 'react';
import { ArrowLeft, Bitcoin, RadioTower } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ComingSoonService({ service }: { service: 'e-SIM' | 'Crypto' }) {
  const Icon = service === 'Crypto' ? Bitcoin : RadioTower;
  return <div className="max-w-xl mx-auto p-4 md:p-8 pb-28">
    <Link to="/client/home" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 mb-5"><ArrowLeft size={16}/> Retour</Link>
    <div className="rounded-[32px] bg-white border border-slate-200 p-8 shadow-sm text-center">
      <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-700 flex items-center justify-center mx-auto"><Icon size={30}/></div>
      <div className="inline-flex mt-5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-black uppercase tracking-wider">Bientôt disponible</div>
      <h1 className="text-3xl font-black text-blue-950 mt-3">{service} Market-Cash</h1>
      <p className="text-slate-500 mt-3">L'espace {service} est déjà réservé dans l'expérience Market-Cash. Le service sera connecté uniquement lorsque les partenaires, la conformité et le backend sécurisé seront prêts.</p>
    </div>
  </div>;
}
