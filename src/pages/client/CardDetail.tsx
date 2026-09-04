import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Banknote, Eye, EyeOff, RefreshCw, ShieldCheck, Store, WalletCards } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import CardProductFace, { CardProductVariant } from '../../components/CardProductFace';
import { db } from '../../firebase/config';
import { agentWalletService, InternalCardSummary } from '../../services/agentWalletService';
import { useAuthStore } from '../../store/authStore';
import { UserCard } from '../../types';
import { WalletCurrency } from '../../types/wallet';

interface CardDetailProps {
  kind: CardProductVariant;
  cardId?: string | null;
}

const money = (value: number, currency: WalletCurrency) => currency === 'CDF'
  ? `${Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} CDF`
  : `${Number(value || 0).toFixed(2)} USD`;

const transactionLabel = (type: string) => {
  const normalized = String(type || '').toLowerCase();
  if (normalized.includes('wallet_to_local_card') || normalized.includes('cardtopup')) return 'Recharge';
  if (normalized.includes('merchant')) return 'Paiement marchand';
  if (normalized.includes('cash_out') || normalized.includes('cashout') || normalized.includes('withdraw')) return 'Retrait Agent';
  if (normalized.includes('refund')) return 'Remboursement';
  return 'Opération carte';
};

const isDebit = (type: string) => {
  const normalized = String(type || '').toLowerCase();
  return normalized.includes('merchant') || normalized.includes('cash_out') || normalized.includes('cashout') || normalized.includes('withdraw');
};

function belongsToCard(transaction: any, cardId?: string | null) {
  if (!cardId) return false;
  const direct = [transaction?.cardId, transaction?.sourceCardId, transaction?.destinationCardId]
    .filter(Boolean)
    .map(String);
  if (direct.includes(cardId)) return true;
  const accountFields = [transaction?.cardWalletId, transaction?.sourceCardWalletId, transaction?.destinationCardWalletId]
    .filter(Boolean)
    .map(String);
  return accountFields.some(value => value.includes(cardId));
}

export default function CardDetail({ kind, cardId }: CardDetailProps) {
  const { user } = useAuthStore();
  const [currency, setCurrency] = useState<WalletCurrency>('USD');
  const [showBalance, setShowBalance] = useState(false);
  const [localCard, setLocalCard] = useState<InternalCardSummary | null>(null);
  const [visaCard, setVisaCard] = useState<UserCard | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.uid) return;
      setLoading(true);
      try {
        if (kind === 'local') {
          await agentWalletService.ensureLocalCard();
          const cards = await agentWalletService.getMyInternalCards();
          if (active) setLocalCard(cards.find(card => !cardId || card.cardId === cardId) || cards[0] || null);
        } else if (cardId) {
          const snap = await getDoc(doc(db, 'cards', cardId));
          if (snap.exists()) {
            const candidate = { ...snap.data(), id: snap.id, cardId: snap.id } as UserCard;
            const tier = String((candidate as any).visaTier || (candidate as any).productTier || '').toLowerCase();
            const isGold = tier === 'gold';
            const validKind = kind === 'gold' ? isGold : !isGold;
            if (candidate.userId === user.uid && String(candidate.network || '').toLowerCase() === 'visa' && validKind && active) {
              setVisaCard(candidate);
            }
          }
        }

        const history = await agentWalletService.getMyWalletHistory().catch(() => [] as any[]);
        if (active) setTransactions(Array.isArray(history) ? history : []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user?.uid, kind, cardId]);

  const activeCardId = kind === 'local' ? localCard?.cardId : visaCard?.cardId || visaCard?.id || cardId || null;
  const cardHistory = useMemo(
    () => transactions.filter(transaction => belongsToCard(transaction, activeCardId)).slice(0, 30),
    [transactions, activeCardId],
  );

  const balance = useMemo(() => {
    if (kind === 'local') return Number(localCard?.balances?.[currency] || 0);
    const card = visaCard as any;
    if (!card) return 0;
    return Number(card?.balances?.[currency] ?? card?.[`balance${currency}`] ?? card?.balance ?? 0);
  }, [kind, localCard, visaCard, currency]);

  const holder = kind === 'local'
    ? localCard?.cardHolder || user?.displayName
    : visaCard?.cardHolder || visaCard?.cardHolderName || user?.displayName;
  const number = kind === 'local' ? localCard?.maskedNumber : visaCard?.cardNumber;

  return (
    <div className="mx-auto max-w-4xl px-3.5 pb-28 pt-4 sm:px-6">
      <Link to="/client/cards" className="inline-flex items-center gap-2 text-sm font-black text-slate-500 transition hover:text-blue-950">
        <ArrowLeft size={17} /> Mes cartes
      </Link>

      <div className="mx-auto mt-5 max-w-xl">
        {loading ? (
          <div className="grid aspect-[1.586/1] place-items-center rounded-[1.55rem] bg-slate-100 text-slate-400">
            <RefreshCw className="animate-spin" size={24} />
          </div>
        ) : (
          <CardProductFace variant={kind} holder={holder} number={number} />
        )}
      </div>

      <section className="mx-auto mt-5 max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Solde de la carte</p>
            <p className="mt-2 text-2xl font-black text-blue-950">{showBalance ? money(balance, currency) : '••••••'}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowBalance(value => !value)}
            className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-blue-950 transition active:scale-95"
            aria-label={showBalance ? 'Masquer le solde' : 'Afficher le solde'}
          >
            {showBalance ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        <div className="mt-4 inline-flex rounded-2xl bg-slate-100 p-1">
          {(['USD', 'CDF'] as WalletCurrency[]).map(item => (
            <button
              key={item}
              type="button"
              onClick={() => setCurrency(item)}
              className={`rounded-xl px-5 py-2 text-xs font-black transition ${currency === item ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-500'}`}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {kind === 'local' && (
        <section className="mx-auto mt-5 grid max-w-xl grid-cols-3 gap-2.5">
          <Link to="/client/wallet/card-topup" className="rounded-2xl border border-slate-200 bg-white px-2 py-4 text-center shadow-sm">
            <WalletCards className="mx-auto text-blue-700" size={22} />
            <span className="mt-2 block text-[11px] font-black text-slate-700">Recharger</span>
          </Link>
          <Link to="/client/wallet/pay" className="rounded-2xl border border-slate-200 bg-white px-2 py-4 text-center shadow-sm">
            <Store className="mx-auto text-blue-700" size={22} />
            <span className="mt-2 block text-[11px] font-black text-slate-700">Payer</span>
          </Link>
          <Link to="/client/wallet/withdraw" className="rounded-2xl border border-slate-200 bg-white px-2 py-4 text-center shadow-sm">
            <Banknote className="mx-auto text-blue-700" size={22} />
            <span className="mt-2 block text-[11px] font-black text-slate-700">Retrait</span>
          </Link>
        </section>
      )}

      {kind === 'standard' && (
        <section className="mx-auto mt-5 max-w-xl">
          <Link to="/client/cards?visa=buy" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-sm">
            <ShieldCheck size={18} /> {visaCard ? 'Gérer mes Visa Standard' : 'Obtenir ma Visa Standard'}
          </Link>
        </section>
      )}

      {kind === 'gold' && (
        <section className="mx-auto mt-5 max-w-xl">
          <div className="flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-300/70 bg-amber-50 px-5 py-4 text-sm font-black text-amber-900">
            <ShieldCheck size={18} /> Émission partenaire sécurisée
          </div>
        </section>
      )}

      <section className="mx-auto mt-8 max-w-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">Historique</h2>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cette carte</span>
        </div>
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {cardHistory.length === 0 ? (
            <div className="p-8 text-center text-sm font-semibold text-slate-400">Aucune opération sur cette carte.</div>
          ) : cardHistory.map((transaction, index) => {
            const debit = isDebit(transaction?.type);
            const txCurrency = (String(transaction?.currency || currency).toUpperCase() === 'CDF' ? 'CDF' : 'USD') as WalletCurrency;
            const amount = Number(transaction?.amount || 0);
            return (
              <div key={transaction?.id || transaction?.reference || index} className="flex items-center justify-between gap-4 border-b border-slate-100 p-4 last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-800">{transactionLabel(transaction?.type)}</p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    {transaction?.createdAt ? new Date(Number(transaction.createdAt)).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Market-Cash'}
                  </p>
                </div>
                <p className={`shrink-0 text-sm font-black ${debit ? 'text-slate-800' : 'text-emerald-700'}`}>
                  {debit ? '-' : '+'}{money(amount, txCurrency)}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
