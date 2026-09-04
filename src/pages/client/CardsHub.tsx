import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import CardProductFace, { CardProductVariant } from '../../components/CardProductFace';
import { db } from '../../firebase/config';
import { agentWalletService, InternalCardSummary } from '../../services/agentWalletService';
import { useAuthStore } from '../../store/authStore';
import { UserCard } from '../../types';
import CardDetail from './CardDetail';
import ClientCards from './Cards';

function isVisa(card: UserCard) {
  return String(card.network || '').toLowerCase() === 'visa';
}

function isGold(card: UserCard) {
  const tier = String((card as any).visaTier || (card as any).productTier || '').toLowerCase();
  return tier === 'gold';
}

export default function CardsHub() {
  const { user } = useAuthStore();
  const [searchParams] = useSearchParams();
  const visaMode = searchParams.get('visa') === 'buy';
  const selectedKind = searchParams.get('card') as CardProductVariant | null;
  const selectedCardId = searchParams.get('cardId');
  const [localCard, setLocalCard] = useState<InternalCardSummary | null>(null);
  const [visaCards, setVisaCards] = useState<UserCard[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(true);

  useEffect(() => {
    if (!user?.uid || visaMode || selectedKind) return;
    let active = true;
    setLoadingLocal(true);

    (async () => {
      try {
        await agentWalletService.ensureLocalCard();
        const cards = await agentWalletService.getMyInternalCards();
        if (active) setLocalCard(cards[0] || null);
      } catch (error) {
        console.warn('[LOCAL_CARD_AUTO_READY_ERROR]', error);
        if (active) setLocalCard(null);
      } finally {
        if (active) setLoadingLocal(false);
      }
    })();

    return () => { active = false; };
  }, [user?.uid, visaMode, selectedKind]);

  useEffect(() => {
    if (!user?.uid || visaMode) return;
    const cardsQuery = query(collection(db, 'cards'), where('userId', '==', user.uid));
    return onSnapshot(cardsQuery, snapshot => {
      const cards = snapshot.docs
        .map(item => ({ ...item.data(), id: item.id, cardId: item.id } as UserCard))
        .filter(card => isVisa(card) && card.status !== 'disabled');
      setVisaCards(cards);
    }, error => {
      console.warn('[CARDS_HUB_VISA_LIST_ERROR]', error);
      setVisaCards([]);
    });
  }, [user?.uid, visaMode]);

  const standardCards = useMemo(() => visaCards.filter(card => !isGold(card)).slice(0, 4), [visaCards]);
  const goldCard = useMemo(() => visaCards.find(card => isGold(card)) || null, [visaCards]);

  if (visaMode) {
    return (
      <div className="pb-28">
        <div className="mx-auto max-w-4xl px-3.5 pt-4 sm:px-6">
          <Link to="/client/cards" className="inline-flex items-center gap-2 text-sm font-black text-slate-500">
            <ArrowLeft size={17} /> Mes cartes
          </Link>
        </div>
        <ClientCards />
      </div>
    );
  }

  if (selectedKind && ['local', 'standard', 'gold'].includes(selectedKind)) {
    return <CardDetail kind={selectedKind} cardId={selectedCardId} />;
  }

  return (
    <div className="mx-auto max-w-4xl px-3.5 pb-28 pt-4 sm:px-6">
      <h1 className="mb-6 text-2xl font-black tracking-tight text-slate-950">Cartes</h1>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-[0.12em] text-blue-950">Market-Cash Locale</h2>
          {loadingLocal && <RefreshCw size={15} className="animate-spin text-slate-400" />}
        </div>
        <Link to={localCard ? `/client/cards?card=local&cardId=${encodeURIComponent(localCard.cardId)}` : '/client/cards?card=local'} className="block">
          <CardProductFace
            variant="local"
            holder={localCard?.cardHolder || user?.displayName}
            number={localCard?.maskedNumber}
            className="transition duration-200 active:scale-[0.985]"
          />
        </Link>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-[0.12em] text-slate-700">Market-Cash Visa Standard</h2>
          {standardCards.length < 4 && (
            <Link to="/client/cards?card=standard" className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-700" aria-label="Ajouter une Visa Standard">
              <Plus size={16} />
            </Link>
          )}
        </div>
        {standardCards.length > 0 ? (
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {standardCards.map(card => {
              const id = card.cardId || card.id || '';
              return (
                <Link key={id} to={`/client/cards?card=standard&cardId=${encodeURIComponent(id)}`} className="w-[88%] shrink-0 snap-center sm:w-[68%] md:w-[58%]">
                  <CardProductFace
                    variant="standard"
                    holder={card.cardHolder || card.cardHolderName || user?.displayName}
                    number={card.cardNumber}
                    className="transition duration-200 active:scale-[0.985]"
                  />
                </Link>
              );
            })}
          </div>
        ) : (
          <Link to="/client/cards?card=standard" className="block">
            <CardProductFace
              variant="standard"
              holder={user?.displayName}
              className="transition duration-200 active:scale-[0.985]"
            />
          </Link>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-[0.12em] text-amber-800">Market-Cash Visa Gold</h2>
        </div>
        <Link
          to={goldCard ? `/client/cards?card=gold&cardId=${encodeURIComponent(goldCard.cardId || goldCard.id || '')}` : '/client/cards?card=gold'}
          className="block"
        >
          <CardProductFace
            variant="gold"
            holder={goldCard?.cardHolder || goldCard?.cardHolderName || user?.displayName}
            number={goldCard?.cardNumber}
            className="transition duration-200 active:scale-[0.985]"
          />
        </Link>
      </section>
    </div>
  );
}
