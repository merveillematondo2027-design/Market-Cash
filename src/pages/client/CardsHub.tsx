import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Gem, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuthStore } from '../../store/authStore';
import { agentWalletService, InternalCardSummary } from '../../services/agentWalletService';

function hiddenName(name?: string) {
  const clean = String(name || 'CLIENT MARKET-CASH').trim();
  return clean.split(/\s+/).map(part => part ? `${part.charAt(0).toUpperCase()}${'•'.repeat(Math.max(3, Math.min(7, part.length - 1)))}` : '').join(' ');
}

function ProductCard({
  title,
  subtitle,
  badge,
  number,
  holder,
  identifier,
  variant,
}: {
  title:string;
  subtitle:string;
  badge:string;
  number:string;
  holder:string;
  identifier:string;
  variant:'local'|'standard'|'gold';
}) {
  const shell = variant === 'gold'
    ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950 border-amber-300/30'
    : variant === 'standard'
      ? 'bg-gradient-to-br from-blue-950 via-indigo-900 to-blue-700 border-blue-300/30'
      : 'bg-gradient-to-br from-blue-600 via-blue-700 to-blue-950 border-cyan-300/30';
  return (
    <div className={`relative aspect-[1.586/1] overflow-hidden rounded-[1.7rem] border p-5 text-white shadow-xl ${shell}`}>
      <div className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-20 -left-12 h-52 w-52 rounded-full bg-black/25 blur-2xl" />
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-black tracking-wide">MARKET<span className="text-amber-300">-CASH</span></p>
            <p className="mt-1 text-[8px] font-black uppercase tracking-[.2em] text-white/70">{subtitle}</p>
          </div>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[9px] font-black uppercase tracking-wider backdrop-blur">{badge}</span>
        </div>
        <div>
          <div className="flex items-center gap-3"><div className="h-9 w-12 rounded-lg bg-gradient-to-br from-amber-100 via-amber-300 to-amber-500 shadow-inner" /><LockKeyhole size={18} className="text-white/75" /></div>
          <p className="mt-5 font-mono text-xl font-black tracking-[.15em] sm:text-2xl">{number}</p>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0"><p className="text-[7px] font-bold uppercase tracking-[.16em] text-white/60">Titulaire</p><p className="mt-1 truncate text-xs font-black">{holder}</p><p className="mt-1 truncate font-mono text-[8px] text-white/60">{identifier}</p></div>
          <div className="text-right"><p className="text-[7px] font-bold uppercase tracking-[.16em] text-white/60">Produit</p><p className={`mt-1 text-sm font-black italic ${variant === 'gold' ? 'text-amber-300' : 'text-white'}`}>{title}</p></div>
        </div>
      </div>
    </div>
  );
}

export default function CardsHub() {
  const { user } = useAuthStore();
  const [localCard, setLocalCard] = useState<InternalCardSummary | null>(null);
  const [visaCards, setVisaCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    let active = true;
    agentWalletService.ensureLocalCard()
      .then(() => agentWalletService.getMyInternalCards())
      .then(cards => { if (active) setLocalCard(cards[0] || null); })
      .catch(error => console.warn('[CARDS_HUB_LOCAL_ERROR]', error))
      .finally(() => { if (active) setLoading(false); });
    const stop = onSnapshot(query(collection(db, 'cards'), where('userId', '==', user.uid)), snap => {
      setVisaCards(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((card:any) => String(card.network || 'visa').toLowerCase() === 'visa'));
    }, error => console.warn('[CARDS_HUB_VISA_ERROR]', error));
    return () => { active = false; stop(); };
  }, [user?.uid]);

  const standard = useMemo(() => visaCards.filter(card => String(card.visaTier || 'standard').toLowerCase() !== 'gold'), [visaCards]);
  const gold = useMemo(() => visaCards.filter(card => String(card.visaTier || '').toLowerCase() === 'gold'), [visaCards]);
  const standardFirst = standard[0];
  const goldFirst = gold[0];
  const localLast4 = localCard?.maskedNumber?.replace(/\D/g, '').slice(-4) || '••••';
  const standardLast4 = String(standardFirst?.cardNumber || '').replace(/\D/g, '').slice(-4) || '••••';
  const goldLast4 = String(goldFirst?.cardNumber || '').replace(/\D/g, '').slice(-4) || '••••';

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 pb-28 pt-5 md:px-8">
      <header className="flex items-start justify-between gap-4">
        <div><p className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700">Espace cartes</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Mes cartes Market-Cash</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Choisissez une carte pour ouvrir son espace. Les soldes, recharges et autres actions ne sont pas affichés sur cette page.</p></div>
        <div className="hidden rounded-2xl bg-emerald-50 p-3 text-emerald-700 sm:block"><ShieldCheck /></div>
      </header>

      {loading && !localCard ? <div className="rounded-3xl border bg-white p-8 text-center text-sm font-bold text-slate-500">Préparation de votre carte locale…</div> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Link to="/client/cards/local" className="group block rounded-[2rem] border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <div className="mb-3 flex items-center justify-between px-2"><div><p className="text-sm font-black text-slate-950">1. Market-Cash Locale</p><p className="text-[11px] text-slate-500">USD / CDF • 1 carte par client</p></div><CreditCard size={19} className="text-blue-700" /></div>
          <ProductCard title="LOCALE" subtitle="Carte locale • USD / CDF" badge="1 / 1" number={`•••• •••• •••• ${localLast4}`} holder={hiddenName(localCard?.cardHolder)} identifier={localCard?.cardIdentifier || 'MCL-•••••••••••'} variant="local" />
          <p className="px-2 pt-3 text-xs font-bold text-blue-800">Touchez la carte pour ouvrir son espace →</p>
        </Link>

        <Link to="/client/cards/visa-standard" className="group block rounded-[2rem] border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <div className="mb-3 flex items-center justify-between px-2"><div><p className="text-sm font-black text-slate-950">2. Market-Cash Visa Standard</p><p className="text-[11px] text-slate-500">Jusqu’à 4 cartes • approvisionnement Vodacom</p></div><CreditCard size={19} className="text-indigo-700" /></div>
          <ProductCard title="VISA" subtitle="Visa Standard" badge={`${standard.length} / 4`} number={`•••• •••• •••• ${standardLast4}`} holder={hiddenName(standardFirst?.cardHolder || user?.displayName)} identifier={standardFirst?.cardIdentifier || 'VISA ••••••••••'} variant="standard" />
          <p className="px-2 pt-3 text-xs font-bold text-indigo-800">Touchez la carte pour ouvrir son espace →</p>
        </Link>

        <Link to="/client/cards/visa-gold" className="group block rounded-[2rem] border border-amber-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
          <div className="mb-3 flex items-center justify-between px-2"><div><p className="text-sm font-black text-slate-950">3. Market-Cash Visa Gold</p><p className="text-[11px] text-slate-500">1 seule carte Gold par client</p></div><Gem size={19} className="text-amber-600" /></div>
          <ProductCard title="VISA GOLD" subtitle="Visa Gold" badge={`${gold.length} / 1`} number={`•••• •••• •••• ${goldLast4}`} holder={hiddenName(goldFirst?.cardHolder || user?.displayName)} identifier={goldFirst?.cardIdentifier || 'GOLD ••••••••••'} variant="gold" />
          <p className="px-2 pt-3 text-xs font-bold text-amber-700">Touchez la carte pour ouvrir son espace →</p>
        </Link>
      </div>
    </div>
  );
}
