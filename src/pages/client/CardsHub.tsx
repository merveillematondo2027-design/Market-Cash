import React, { useEffect, useState } from 'react';
import { ArrowLeft, CreditCard, Plus, QrCode, RefreshCw, ShieldCheck, Store, WalletCards } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import ClientCards from './Cards';
import { agentWalletService, InternalCardSummary } from '../../services/agentWalletService';

const money = (value: number, currency: 'USD' | 'CDF') => currency === 'CDF'
  ? `${Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} CDF`
  : `${Number(value || 0).toFixed(2)} USD`;

export default function CardsHub() {
  const [searchParams] = useSearchParams();
  const visaMode = searchParams.get('visa') === 'buy';
  const [localCard, setLocalCard] = useState<InternalCardSummary | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [activatingLocal, setActivatingLocal] = useState(false);
  const [localError, setLocalError] = useState('');

  const loadLocalCard = async () => {
    setLoadingLocal(true);
    setLocalError('');
    try {
      const cards = await agentWalletService.getMyInternalCards();
      setLocalCard(cards[0] || null);
    } catch (error: any) {
      console.error('[LOCAL_CARD_LOAD_ERROR]', error);
      setLocalCard(null);
      setLocalError(error?.message || 'Impossible de vérifier la carte locale pour le moment.');
    } finally {
      setLoadingLocal(false);
    }
  };

  const activateLocalCard = async () => {
    setActivatingLocal(true);
    setLocalError('');
    try {
      await agentWalletService.ensureLocalCard();
      const cards = await agentWalletService.getMyInternalCards();
      setLocalCard(cards[0] || null);
      toast.success('Votre carte locale Market-Cash est prête.');
    } catch (error: any) {
      console.error('[LOCAL_CARD_ACTIVATION_ERROR]', error);
      setLocalError(error?.message || 'Impossible d’obtenir la carte locale pour le moment.');
      toast.error(error?.message || 'Activation de la carte locale impossible.');
    } finally {
      setActivatingLocal(false);
    }
  };

  useEffect(() => {
    if (!visaMode) void loadLocalCard();
  }, [visaMode]);

  if (visaMode) {
    return (
      <div className="pb-28">
        <section className="mx-auto max-w-4xl px-3.5 pt-4 sm:px-6">
          <Link to="/client/cards" className="inline-flex items-center gap-2 text-sm font-black text-slate-500">
            <ArrowLeft size={16} /> Retour aux cartes
          </Link>
          <div className="mt-5 rounded-3xl border border-blue-100 bg-blue-50 p-5">
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-700">Produit international séparé</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Acheter une carte Visa</h1>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Cet espace sert uniquement aux demandes d'achat Visa. Aucune Visa n'est créée automatiquement et la Visa n'est pas utilisée pour les retraits ou paiements locaux Market-Cash.
            </p>
          </div>
        </section>
        <ClientCards />
      </div>
    );
  }

  return (
    <div className="pb-28">
      <section className="mx-auto max-w-4xl px-3.5 pt-4 sm:px-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.18em] text-emerald-700">Paiements locaux Market-Cash</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Carte locale Market-Cash</h1>
            <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
              La carte locale n'est plus attribuée automatiquement. Votre espace reste vide tant que vous ne choisissez pas d'obtenir votre carte locale.
            </p>
          </div>
          <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700 sm:inline-flex">1 carte locale maximum</span>
        </div>

        {loadingLocal ? (
          <div className="grid min-h-48 place-items-center rounded-3xl border bg-white shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-500"><RefreshCw className="animate-spin" size={18} /> Vérification de votre espace cartes…</div>
          </div>
        ) : localError && !localCard ? (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <p className="font-black text-amber-900">Carte locale momentanément indisponible</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">{localError}</p>
            <button onClick={() => void loadLocalCard()} className="mt-4 rounded-2xl bg-blue-950 px-4 py-3 text-xs font-black text-white">Réessayer</button>
          </div>
        ) : localCard ? (
          <div className="grid gap-4 md:grid-cols-[1.35fr_.65fr]">
            <div className="relative aspect-[1.586/1] overflow-hidden rounded-[1.65rem] border border-blue-300/40 bg-gradient-to-br from-blue-600 via-blue-700 to-blue-950 p-5 text-white shadow-xl">
              <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-300/20 blur-2xl" />
              <div className="absolute -bottom-24 -left-14 h-64 w-64 rounded-full bg-blue-950/70 blur-2xl" />
              <div className="relative z-10 flex h-full flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-base font-black tracking-wide">MARKET<span className="text-amber-300">-CASH</span></p>
                    <p className="mt-1 text-[8px] font-extrabold uppercase tracking-[.22em] text-blue-100">Carte locale • USD / CDF</p>
                  </div>
                  <div className="rounded-xl bg-white p-1.5 shadow-lg">
                    <QRCodeSVG value={localCard.qrData || `MARKET-CASH-CARD:${localCard.cardIdentifier}`} size={42} level="M" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-3"><div className="h-9 w-12 rounded-lg bg-gradient-to-br from-amber-100 via-amber-300 to-amber-500 shadow-inner" /><QrCode size={23} className="text-white/90" /></div>
                  <p className="mt-5 font-mono text-xl font-black tracking-[.14em] drop-shadow sm:text-2xl">{localCard.maskedNumber}</p>
                </div>

                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0"><p className="text-[7px] font-bold uppercase tracking-[.16em] text-blue-100">Titulaire</p><p className="mt-1 truncate text-xs font-black">{localCard.cardHolder}</p><p className="mt-1 truncate font-mono text-[8px] text-blue-100">{localCard.cardIdentifier}</p></div>
                  <div className="text-right"><p className="text-[7px] font-bold uppercase tracking-[.16em] text-blue-100">Réseau</p><p className="mt-1 text-sm font-black italic">LOCAL</p></div>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-3xl border bg-white p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Solde carte locale</p>
                <p className="mt-2 text-xl font-black text-blue-950">{money(Number(localCard.balances?.USD || 0), 'USD')}</p>
                <p className="mt-1 text-lg font-black text-slate-800">{money(Number(localCard.balances?.CDF || 0), 'CDF')}</p>
              </div>
              <Link to="/client/wallet/card-topup" className="flex items-center justify-between rounded-2xl bg-amber-400 p-4 font-black text-blue-950 shadow-sm"><span className="flex items-center gap-2"><WalletCards size={18} /> Recharger la carte</span><span>→</span></Link>
              <Link to="/client/wallet/pay" className="flex items-center justify-between rounded-2xl border bg-white p-4 text-sm font-black text-blue-950"><span className="flex items-center gap-2"><Store size={18} /> Payer un marchand</span><span>→</span></Link>
              <Link to="/client/wallet/withdraw" className="flex items-center justify-between rounded-2xl border bg-white p-4 text-sm font-black text-blue-950"><span className="flex items-center gap-2"><ShieldCheck size={18} /> Retrait chez Agent</span><span>→</span></Link>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-7 text-center shadow-sm sm:p-10">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-800"><WalletCards size={30} /></div>
            <p className="mt-4 text-[10px] font-black uppercase tracking-[.18em] text-slate-400">Aucune carte locale attribuée</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Votre espace carte locale est vide</h2>
            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">
              Obtenez une carte locale Market-Cash uniquement quand vous êtes prêt à l'utiliser. Elle servira ensuite pour les paiements marchands et les retraits chez Agent.
            </p>
            <button
              type="button"
              disabled={activatingLocal}
              onClick={() => void activateLocalCard()}
              className="mx-auto mt-5 flex items-center justify-center gap-2 rounded-2xl bg-blue-950 px-6 py-4 text-sm font-black text-white shadow-sm disabled:opacity-50"
            >
              {activatingLocal ? <RefreshCw className="animate-spin" size={18} /> : <Plus size={18} />}
              {activatingLocal ? 'Création en cours…' : 'Obtenir ma carte locale'}
            </button>
          </div>
        )}

        <div className="mt-8 rounded-3xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-950">
          <b>Flux retenu :</b> dépôt → portefeuille principal → recharge de la carte locale → paiement ou retrait. Sans carte locale activée, aucune dépense locale n'est possible. La Visa reste totalement séparée.
        </div>

        <div className="mt-10 border-t pt-8">
          <div className="rounded-3xl border bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-blue-950"><CreditCard size={23} /></div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Produit international séparé</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">Carte Visa</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Aucune Visa n'est attribuée automatiquement. Le client peut uniquement lancer une demande d'achat Visa.</p>
                <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
                  <b>État attendu :</b> aucune Visa tant qu'une demande d'achat n'a pas été approuvée et qu'une carte n'a pas été attribuée.
                </div>
                <Link to="/client/cards?visa=buy" className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-sm sm:w-auto">
                  <CreditCard size={18} /> Acheter une carte Visa
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
