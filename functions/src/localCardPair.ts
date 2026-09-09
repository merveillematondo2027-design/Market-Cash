import { createHash, randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
export const LOCAL_CARD_CURRENCIES = ['USD', 'CDF'] as const;
export type LocalCardCurrency = typeof LOCAL_CARD_CURRENCIES[number];
export const LOCAL_CARD_PREFIX = '5585020002';
export const LOCAL_CARD_SCHEME = 'MC_LOCAL_V4_5585';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const legacyLocalCardId = (uid: string) => `local_${sha256(`local-card:${uid}`).slice(0, 24)}`;
export const localCardId = (uid: string, currency: LocalCardCurrency) => `local_${currency.toLowerCase()}_${sha256(`local-card:${currency}:${uid}`).slice(0, 20)}`;
export const localCardIdentifier = (uid: string, currency: LocalCardCurrency) => `MCL-${sha256(`local-card-id:${currency}:${uid}`).slice(0, 12).toUpperCase()}`;
export const cardAccountId = (cardId: string, currency: LocalCardCurrency) => `card_${currency.toLowerCase()}_${cardId}`;

function validity(startValue?: number) {
  const start = new Date(startValue && Number.isFinite(startValue) ? startValue : Date.now());
  const end = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()));
  const fmt = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(-2)}`;
  return { expiryStart: fmt(start), expiryEnd: fmt(end) };
}

async function requireEligibleUser(uid: string) {
  const ref = db.doc(`users/${uid}`);
  let snap = await ref.get();

  if (!snap.exists) {
    try {
      const authUser = await getAuth().getUser(uid);
      const now = Date.now();
      const displayName = String(authUser.displayName || authUser.email?.split('@')[0] || 'Utilisateur Market-Cash').trim() || 'Utilisateur Market-Cash';
      await ref.set({
        uid,
        email: authUser.email || '',
        displayName,
        phone: authUser.phoneNumber || '',
        role: 'client',
        accountStatus: 'active',
        kycStatus: 'not_started',
        createdAt: now,
        updatedAt: now,
        provisionedBy: 'local_card_bootstrap',
      }, { merge: true });
      snap = await ref.get();
    } catch (error) {
      console.error('[LOCAL_CARD_USER_BOOTSTRAP_ERROR]', { uid, error });
      throw new HttpsError('failed-precondition', 'Votre compte Market-Cash est encore en cours de préparation. Réessayez dans quelques secondes.');
    }
  }

  if (!snap.exists) throw new HttpsError('not-found', 'Compte Market-Cash introuvable.');
  const data = snap.data()!;
  if (['blocked', 'suspended', 'banned', 'deleted'].includes(String(data.accountStatus || ''))) {
    throw new HttpsError('failed-precondition', 'Compte indisponible.');
  }
  return { ref, data };
}

async function allocateUniqueCardNumber(uid: string, currency: LocalCardCurrency) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const suffix = String(randomInt(100000, 1000000));
    const number = `${LOCAL_CARD_PREFIX}${suffix}`;
    const registryRef = db.doc(`card_number_registry/${number}`);
    const reserved = await db.runTransaction(async tx => {
      const snap = await tx.get(registryRef);
      if (snap.exists) return false;
      tx.create(registryRef, { cardNumber: number, userId: uid, currency, scheme: LOCAL_CARD_SCHEME, createdAt: Date.now() });
      return true;
    });
    if (reserved) return number;
  }
  throw new HttpsError('resource-exhausted', 'Impossible de générer un numéro de carte unique.');
}

async function migrateLegacyBalance(uid: string, currency: LocalCardCurrency, destinationCardId: string) {
  const legacyId = legacyLocalCardId(uid);
  if (legacyId === destinationCardId) return;
  const legacyCardRef = db.doc(`local_cards/${legacyId}`);
  const legacyAccountRef = db.doc(`card_wallet_accounts/${cardAccountId(legacyId, currency)}`);
  const destinationRef = db.doc(`card_wallet_accounts/${cardAccountId(destinationCardId, currency)}`);

  await db.runTransaction(async tx => {
    const [legacyCard, legacyAccount, destination] = await Promise.all([
      tx.get(legacyCardRef), tx.get(legacyAccountRef), tx.get(destinationRef),
    ]);
    const destinationData = destination.data() || {};
    if (destinationData.migrationCompleted === true) return;
    const legacy = legacyAccount.data() || {};
    const available = Number(legacy.availableBalance || 0);
    const ledger = Number(legacy.ledgerBalance || available);
    const held = Number(legacy.heldBalance || 0);
    const now = Date.now();
    tx.set(destinationRef, {
      id: destinationRef.id, cardId: destinationCardId, userId: uid, currency,
      availableBalance: Number(destinationData.availableBalance || 0) + available,
      ledgerBalance: Number(destinationData.ledgerBalance || 0) + ledger,
      heldBalance: Number(destinationData.heldBalance || 0) + held,
      status: 'active', migrationCompleted: true,
      migratedFromCardId: legacyAccount.exists ? legacyId : null,
      createdAt: destinationData.createdAt || now, updatedAt: now,
    }, { merge: true });
    if (legacyAccount.exists) tx.set(legacyAccountRef, { availableBalance: 0, ledgerBalance: 0, heldBalance: 0, migratedToCardId: destinationCardId, migratedAt: now, updatedAt: now }, { merge: true });
    if (legacyCard.exists) tx.set(legacyCardRef, { status: 'migrated', migratedToLocalCardPair: true, migratedAt: now, updatedAt: now }, { merge: true });
  });
}

export async function ensureLocalCardPair(uid: string) {
  const user = await requireEligibleUser(uid);
  const holder = String(user.data.displayName || user.data.fullName || 'CLIENT MARKET-CASH').trim() || 'CLIENT MARKET-CASH';
  const cards: any[] = [];

  for (const currency of LOCAL_CARD_CURRENCIES) {
    const id = localCardId(uid, currency);
    const ref = db.doc(`local_cards/${id}`);
    const snap = await ref.get();
    const previous = snap.data() || {};
    const now = Date.now();
    const mustReissue = !snap.exists || String(previous.cardNumberScheme || '') !== LOCAL_CARD_SCHEME || !String(previous.cardNumber || '').startsWith(LOCAL_CARD_PREFIX);
    const reissuedAt = mustReissue ? now : Number(previous.reissuedAt || previous.createdAt || now);
    const dates = validity(reissuedAt);
    const number = mustReissue ? await allocateUniqueCardNumber(uid, currency) : String(previous.cardNumber || '');

    await ref.set({
      id, cardId: id, cardIdentifier: localCardIdentifier(uid, currency),
      program: 'market_cash_local', creationMode: previous.creationMode || 'account_auto',
      userId: uid, userName: holder, cardHolder: holder, cardHolderName: holder,
      cardNumber: number, cardNumberScheme: LOCAL_CARD_SCHEME, network: 'market_cash', type: 'local',
      currency, supportedCurrencies: [currency], status: previous.status === 'blocked' ? 'blocked' : 'active',
      qrData: `MARKET-CASH-CARD:${localCardIdentifier(uid, currency)}`,
      ...dates, validityMonths: 12, reissuedAt,
      activatedAt: Number(previous.activatedAt || now), createdAt: Number(previous.createdAt || now), updatedAt: now,
    }, { merge: true });

    await migrateLegacyBalance(uid, currency, id);
    const accountRef = db.doc(`card_wallet_accounts/${cardAccountId(id, currency)}`);
    const account = await accountRef.get();
    if (!account.exists) await accountRef.set({ id: accountRef.id, cardId: id, userId: uid, currency, availableBalance: 0, ledgerBalance: 0, heldBalance: 0, status: 'active', migrationCompleted: true, createdAt: now, updatedAt: now });
    cards.push((await ref.get()).data());
  }

  return cards;
}

export async function getOwnedLocalCard(uid: string, requestedCardId?: string) {
  const cards = await ensureLocalCardPair(uid);
  const card = requestedCardId ? cards.find((item) => String(item.cardId) === requestedCardId) : cards[0];
  if (!card || card.userId !== uid || !['active', 'blocked'].includes(String(card.status || ''))) throw new HttpsError('not-found', 'Carte locale introuvable.');
  return card;
}

export async function listLocalCardSummaries(uid: string) {
  const cards = await ensureLocalCardPair(uid);
  const result = [];
  for (const card of cards) {
    const currency = String(card.currency || 'USD') as LocalCardCurrency;
    const account = await db.doc(`card_wallet_accounts/${cardAccountId(card.cardId, currency)}`).get();
    const raw = String(card.cardNumber || '').replace(/\D/g, '');
    result.push({
      cardId: card.cardId, cardIdentifier: card.cardIdentifier,
      cardHolder: card.cardHolder || card.cardHolderName || 'CLIENT MARKET-CASH',
      maskedNumber: raw ? `${raw.slice(0,4)} •••• •••• ${raw.slice(-4)}` : '5585 •••• •••• ••••',
      status: card.status || 'active', qrData: card.qrData || '',
      expiryStart: card.expiryStart || '', expiryEnd: card.expiryEnd || '',
      currency, balances: { [currency]: Number(account.data()?.availableBalance || 0) },
    });
  }
  return result;
}
