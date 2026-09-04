import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, CreditCard, Store } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { agentWalletService, InternalCardSummary, MarketCashRecipient } from '../../services/agentWalletService';
import { WalletCurrency } from '../../types/wallet';

const key = () => `pay_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const fmt = (value: number, currency: WalletCurrency) => currency === 'CDF'
  ? `${Number(value || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} CDF`
  : `${Number(value || 0).toFixed(2)} USD`;

export default function MerchantPay() {
  const [params] = useSearchParams();
  const currency = (params.get('currency') === 'CDF' ? 'CDF' : 'USD') as WalletCurrency;
  const initialMerchant = (params.get('merchant') || params.get('id') || '').trim().toUpperCase();
  const initialAmount = (params.get('amount') || '').trim();
  const [cards, setCards] = useState<InternalCardSummary[]>([]);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [merchantId, setMerchantId] = useState(initialMerchant);
  const [amount, setAmount] = useState(initialAmount);
  const [merchant, setMerchant] = useState<MarketCashRecipient | null>(null);
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'form' | 'review' | 'pin' | 'done'>('form');
  const [busy, setBusy] = useState(false);
  const [loadingCards, setLoadingCards] = useState(true);
  const [reference, setReference] = useState('');

  const refreshCards = async () => {
    const localCards = await agentWalletService.getMyInternalCards();
    setCards(localCards);
    setSelectedCardId(current => current && localCards.some(card => card.cardId === current)
      ? current
      : localCards[0]?.cardId || '');
  };

  useEffect(() => {
    agentWalletService.ensureLocalCard()
      .then(() => refreshCards())
      .catch(() => setCards([]))
      .finally(() => setLoadingCards(false));
  }, []);

  const selectedCard = cards.find(card => card.cardId === selectedCardId) || null;
  const value = useMemo(() => Number(String(amount).replace(',', '.')), [amount]);
  const valid = Number.isFinite(value) && value > 0;

  const identify = async () => {
    if (!merchantId.trim() || !valid || !selectedCard) return;
    setBusy(true);
    try {
      const result = await agentWalletService.lookupMerchantRecipient(merchantId.trim().toUpperCase());
      setMerchant(result);
      setStep('review');
    } catch (error: any) {
      toast.error(error?.message || 'Marchand introuvable ou non autorisé. Vérifiez son ID MCM.');
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!merchant || !valid || !pin || !selectedCard) return;
    setBusy(true);
    try {
      const result = await agentWalletService.payMerchant({
        cardId: selectedCard.cardId,
        marketCashId: merchant.marketCashId,
        currency,
        amount: value,
        pin,
        idempotencyKey: key(),
      });
      setReference(result.reference);
      setStep('done');
      setPin('');
      toast.success('Paiement par carte locale confirmé.');
      await refreshCards();
    } catch (error: any) {
      toast.error(error?.message || 'Paiement refusé. Vérifiez le solde de la carte locale.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl p-4 pb-28 md:p-8">
      <Link to="/client/cards/local" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft size={16} /> Retour à la carte locale</Link>
      <section className="mt-5 rounded-3xl border bg-white p-5 shadow-sm md:p-6">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><Store /></div>
        <h1 className="mt-4 text-2xl font-black text-slate-950">Payer un marchand</h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">Le paiement est débité de votre <b>carte locale Market-Cash</b>. Le portefeuille principal n’est pas débité directement.</p>

        {initialMerchant && <div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-xs font-bold text-emerald-800">QR / lien marchand détecté. Vérifiez le montant et le nom du bénéficiaire avant confirmation.</div>}

        {loadingCards ? (
          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">Chargement de la carte locale…</div>
        ) : cards.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <b>Aucune carte locale disponible.</b> Ouvrez l’espace Cartes pour initialiser votre carte Market-Cash.
            <Link to="/client/cards" className="mt-3 block rounded-xl bg-blue-950 px-4 py-3 text-center font-black text-white">Ouvrir Mes cartes</Link>
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-blue-950">
              <div className="flex items-center gap-2"><CreditCard size={17} /><span className="text-xs font-black uppercase tracking-wide">Carte locale utilisée</span></div>
              {cards.length > 1 ? (
                <select value={selectedCardId} onChange={event => setSelectedCardId(event.target.value)} className="mt-3 w-full rounded-xl border bg-white p-3 text-sm font-black">
                  {cards.map(card => <option key={card.cardId} value={card.cardId}>{card.maskedNumber} · {card.cardIdentifier}</option>)}
                </select>
              ) : (
                <div className="mt-3 flex items-center justify-between gap-3"><div><p className="font-mono text-sm font-black">{selectedCard?.maskedNumber}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{selectedCard?.cardIdentifier}</p></div><div className="text-right"><p className="text-[10px] font-black uppercase text-slate-400">Solde {currency}</p><p className="font-black tracking-widest">••••••</p></div></div>
              )}
              <p className="mt-2 text-[10px] font-bold text-slate-500">Le solde reste masqué ici. Utilisez l’œil dans l’espace de la carte locale pour le consulter après code secret.</p>
            </div>

            {step === 'form' && <div className="mt-5 space-y-3">
              <label className="block text-xs font-black uppercase text-slate-500">ID MCM du marchand</label>
              <input value={merchantId} onChange={event => setMerchantId(event.target.value.toUpperCase())} placeholder="MCM-1234567890A" className="w-full rounded-2xl border p-4 font-mono" />
              <label className="block text-xs font-black uppercase text-slate-500">Montant</label>
              <input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" placeholder={`Montant en ${currency}`} className="w-full rounded-2xl border p-4" />
              <p className="text-xs text-slate-500">Le serveur vérifiera le solde réel de la carte au moment de la confirmation.</p>
              <button disabled={busy || !merchantId.trim() || !valid || !selectedCard} onClick={identify} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">{busy ? 'Vérification…' : 'Vérifier le marchand'}</button>
            </div>}

            {step === 'review' && merchant && <div className="mt-5 space-y-3">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Marchand vérifié</p><p className="mt-1 text-lg font-black">{merchant.displayName}</p>{merchant.legalName && merchant.legalName !== merchant.displayName && <p className="text-xs text-slate-500">{merchant.legalName}</p>}<p className="mt-1 font-mono text-sm text-slate-500">{merchant.marketCashId}</p><div className="mt-4 flex justify-between border-t pt-3"><span>À débiter de la carte</span><b>{fmt(value, currency)}</b></div></div>
              <div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900">Carte : <b>{selectedCard?.maskedNumber}</b>. Vérifiez le nom du marchand avant de confirmer.</div>
              <button onClick={() => setStep('pin')} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white">Continuer</button>
              <button onClick={() => setStep('form')} className="w-full py-2 text-sm font-bold text-slate-500">Modifier</button>
            </div>}

            {step === 'pin' && <div className="mt-5 space-y-3">
              <label className="block text-xs font-black uppercase text-slate-500">Code PIN Market-Cash</label>
              <input value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} type="password" inputMode="numeric" placeholder="••••" className="w-full rounded-2xl border p-4 text-center tracking-[.35em]" />
              <button disabled={busy || !pin} onClick={pay} className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-40">{busy ? 'Paiement…' : 'Confirmer le paiement par carte'}</button>
            </div>}

            {step === 'done' && <div className="mt-6 rounded-3xl bg-emerald-50 p-6 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={42} /><h2 className="mt-3 text-xl font-black text-emerald-900">Paiement envoyé</h2><p className="mt-1 text-sm text-emerald-700">{fmt(value, currency)} vers {merchant?.displayName}</p><p className="mt-2 text-xs text-emerald-700">Débité de votre carte locale Market-Cash.</p><p className="mt-3 font-mono text-xs text-emerald-800">{reference}</p><Link to="/client/wallet/transactions" className="mt-5 inline-flex rounded-2xl bg-white px-4 py-3 text-sm font-black text-emerald-800">Voir l'historique</Link></div>}
          </>
        )}
      </section>
    </div>
  );
}
