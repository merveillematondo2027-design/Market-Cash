import React, { useEffect, useState } from 'react';
import { CreditCard, QrCode, RefreshCw, ShieldCheck, Store, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import ClientCards from './Cards';
import { agentWalletService, InternalCardSummary } from '../../services/agentWalletService';

const money = (value: number, currency: 'USD' | 'CDF') => currency === 'CDF'
  ? `${Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} CDF`
  : `${Number(value || 0).toFixed(2)} USD`;

export default function CardsHub() {
  const [localCard, setLocalCard] = useState<InternalCardSummary | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [localError, setLocalError] = useState('');

  const loadLocalCard = async () => {
    setLoadingLocal(true);
    setLocalError('');
    try {
      await agentWalletService.ensureLocalCard();
      const cards = await agentWalletService.getMyInternalCards();
      setLocalCard(cards[0] || null);
    } catch (error: any) {
      console.error('[LOCAL_CARD_LOAD_ERROR]', error);
      setLocalCard(null);
      setLocalError(error?.message || 'Impossible de charger la carte locale pour le moment.');
    } finally {
      setLoadingLocal(false);
    }
  };

  useEffect(() => {
    void loadLocalCard();
  }, []);

  return (
    <div className="pb-28">
      <section className="mx-auto max-w-4xl px-3.5 pt-4 sm:px-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.18em] text-emerald-700">Paiements locaux Market-Cash</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Ma carte locale</h1>
            <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">
              Cette carte est attribuée automatiquement à votre compte. Retraits chez les Agents et paiements marchands sont débités ici, jamais directement du portefeuille principal.
            </p>
          </div>
          <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700 sm:inline-flex">1 carte locale / compte</span>
        </div>

        {loadingLocal ? (
          <div className="grid min-h-48 place-items-center rounded-3xl border bg-white shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-500"><RefreshCw className="animate-spin" size={18} /> Création / chargement de la carte locale…</div>
          </div>
        ) : localError ? (
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
        ) : null}

        <div className="mt-8 rounded-3xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-950">
          <b>Flux retenu :</b> dépôt → portefeuille principal → recharge de la carte locale → paiement ou retrait. La carte Visa reste un produit séparé et n’est pas utilisée pour les opérations locales.
        </div>

        <div className="mt-10 flex items-center gap-3 border-t pt-8">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-blue-950"><CreditCard size={22} /></div>
          <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Produit séparé</p><h2 className="text-xl font-black text-slate-950">Cartes Visa</h2><p className="text-xs text-slate-500">Aucune Visa n’est attribuée automatiquement. Le client peut uniquement lancer une demande d’achat dans cet espace.</p></div>
        </div>
      </section>

      <ClientCards />
    </div>
  );
}
