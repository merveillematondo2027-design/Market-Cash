import { createHash, randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
type Currency = typeof CURRENCIES[number];
type AccountType = 'client' | 'agent' | 'business';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const walletId = (uid: string, currency: Currency) => `wallet_${currency.toLowerCase()}_${uid}`;
const cardWalletId = (cardId: string, currency: Currency) => `card_${currency.toLowerCase()}_${cardId}`;
const marketCashIdForUid = (uid: string) => `MCW-${sha256(`market-cash:${uid}`).slice(0, 10).toUpperCase()}`;

function requireAuth(request: any) {
  const uid = String(request.auth?.uid || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  return uid;
}

function parseCurrency(value: any): Currency {
  const currency = String(value || '').toUpperCase() as Currency;
  if (!CURRENCIES.includes(currency)) throw new HttpsError('invalid-argument', 'Devise invalide.');
  return currency;
}

function parseAmount(value: any) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpsError('invalid-argument', 'Montant invalide.');
  return Math.round(amount * 100) / 100;
}

function parseIdempotencyKey(value: any, prefix: string, uid: string) {
  const raw = String(value || '').trim();
  if (!raw) return `${prefix}_${uid}_${Date.now()}_${randomInt(1000, 9999)}`;
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(raw)) throw new HttpsError('invalid-argument', 'Clé de transaction invalide.');
  return raw;
}

function requirePin(user: FirebaseFirestore.DocumentSnapshot, pin: any, label = 'Code PIN incorrect.') {
  const value = String(pin || '');
  if (!value || user.data()?.pinHash !== sha256(value)) throw new HttpsError('permission-denied', label);
}

function assertUserActive(user: FirebaseFirestore.DocumentSnapshot, expectedRole?: string) {
  if (!user.exists) throw new HttpsError('not-found', 'Compte introuvable.');
  const data = user.data()!;
  if (expectedRole && data.role !== expectedRole) throw new HttpsError('permission-denied', 'Type de compte non autorisé.');
  if (['blocked', 'suspended'].includes(String(data.accountStatus || ''))) {
    throw new HttpsError('failed-precondition', 'Compte indisponible.');
  }
}

async function requireAgent(uid: string) {
  const [profile, user] = await Promise.all([
    db.doc(`agent_profiles/${uid}`).get(),
    db.doc(`users/${uid}`).get(),
  ]);
  if (!profile.exists || profile.data()?.status !== 'active' || !user.exists || user.data()?.role !== 'agent') {
    throw new HttpsError('permission-denied', 'Compte Agent point de vente non autorisé.');
  }
  assertUserActive(user, 'agent');
  return user;
}

async function ensureWallets(uid: string, accountType: AccountType, marketCashId = marketCashIdForUid(uid)) {
  const now = Date.now();
  for (const currency of CURRENCIES) {
    const ref = db.doc(`wallet_accounts/${walletId(uid, currency)}`);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        id: ref.id,
        userId: uid,
        accountType,
        currency,
        availableBalance: 0,
        ledgerBalance: 0,
        heldBalance: 0,
        status: 'active',
        marketCashId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

function normalizeMarketCashId(value: any) {
  const text = String(value || '').trim().toUpperCase();
  const match = text.match(/MCW-[A-F0-9]{10}/);
  const marketCashId = match?.[0] || text;
  if (!/^MCW-[A-F0-9]{10}$/.test(marketCashId)) {
    throw new HttpsError('invalid-argument', 'ID Market-Cash invalide. Exemple : MCW-XXXXXXXXXX.');
  }
  return marketCashId;
}

async function resolveClientByMarketCashId(value: any, agentUid: string) {
  const marketCashId = normalizeMarketCashId(value);
  const mapping = await db.doc(`wallet_public_ids/${marketCashId}`).get();
  if (!mapping.exists) throw new HttpsError('not-found', 'Client Market-Cash introuvable.');
  const clientUid = String(mapping.data()?.userId || '');
  if (!clientUid || clientUid === agentUid) throw new HttpsError('failed-precondition', 'Client invalide.');
  const user = await db.doc(`users/${clientUid}`).get();
  assertUserActive(user, 'client');
  await ensureWallets(clientUid, 'client', marketCashId);
  return { clientUid, marketCashId, user };
}

function normalizeCardReference(value: any) {
  const raw = String(value || '').trim();
  if (!raw) throw new HttpsError('invalid-argument', 'Numéro ou identifiant de carte requis.');

  const trackOne = raw.match(/%B(\d{12,19})\^/i);
  const trackTwo = raw.match(/;(\d{12,19})=/);
  if (trackOne?.[1]) return { raw, digits: trackOne[1], identifier: '' };
  if (trackTwo?.[1]) return { raw, digits: trackTwo[1], identifier: '' };

  const qrPrefix = raw.match(/(?:MARKET-CASH-CARD|MC-CARD)[:|\s-]+([A-Za-z0-9_-]{4,120})/i);
  if (qrPrefix?.[1]) return { raw, digits: '', identifier: qrPrefix[1] };

  const digits = raw.replace(/\D/g, '');
  if (/^\d{12,19}$/.test(digits)) return { raw, digits, identifier: '' };
  return { raw, digits: '', identifier: raw };
}

async function resolveLocalCard(value: any) {
  const ref = normalizeCardReference(value);
  let cardSnap: FirebaseFirestore.DocumentSnapshot | null = null;

  if (ref.identifier) {
    const direct = await db.doc(`cards/${ref.identifier}`).get();
    if (direct.exists) cardSnap = direct;
    if (!cardSnap) {
      const identifiers = Array.from(new Set([ref.identifier, ref.identifier.toUpperCase()]));
      for (const identifier of identifiers) {
        const q = await db.collection('cards').where('cardIdentifier', '==', identifier).limit(1).get();
        if (!q.empty) { cardSnap = q.docs[0]; break; }
      }
    }
  }

  if (!cardSnap && ref.digits) {
    const q = await db.collection('cards').where('cardNumber', '==', ref.digits).limit(1).get();
    if (!q.empty) cardSnap = q.docs[0];
  }

  if (!cardSnap?.exists) throw new HttpsError('not-found', 'Carte locale Market-Cash introuvable.');
  const card = cardSnap.data()!;
  const isVirtualVisa = String(card.type || '').toLowerCase() === 'virtual' && String(card.network || '').toLowerCase() === 'visa';
  if (isVirtualVisa) throw new HttpsError('failed-precondition', 'La Visa virtuelle ne peut pas être utilisée pour ce retrait local.');
  if (card.status !== 'active') throw new HttpsError('failed-precondition', 'Carte locale inactive.');

  const clientUid = String(card.userId || '');
  if (!clientUid) throw new HttpsError('failed-precondition', 'Cette carte n’est pas attribuée à un client.');
  const user = await db.doc(`users/${clientUid}`).get();
  assertUserActive(user, 'client');

  return { cardSnap, card, clientUid, user };
}

export const lookupAgentClientByMarketCashId = onCall({ region: REGION }, async request => {
  const agentUid = requireAuth(request);
  await requireAgent(agentUid);
  const resolved = await resolveClientByMarketCashId(request.data?.marketCashId, agentUid);
  const profile = resolved.user.data()!;
  return {
    userId: resolved.clientUid,
    marketCashId: resolved.marketCashId,
    displayName: String(profile.displayName || profile.fullName || 'Client Market-Cash'),
    phone: String(profile.phone || ''),
  };
});

export const agentCashInByMarketCashId = onCall({ region: REGION }, async request => {
  const agentUid = requireAuth(request);
  const agentUser = await requireAgent(agentUid);
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'cashin', agentUid);
  const resolved = await resolveClientByMarketCashId(request.data?.marketCashId, agentUid);
  requirePin(agentUser, request.data?.pin, 'Code secret agent incorrect.');
  await ensureWallets(agentUid, 'agent');

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId };

    const agentWalletRef = db.doc(`wallet_accounts/${walletId(agentUid, currency)}`);
    const clientWalletRef = db.doc(`wallet_accounts/${walletId(resolved.clientUid, currency)}`);
    const [agentWallet, clientWallet] = await Promise.all([tx.get(agentWalletRef), tx.get(clientWalletRef)]);
    if (!agentWallet.exists || !clientWallet.exists) throw new HttpsError('failed-precondition', 'Portefeuille non initialisé.');
    const agent = agentWallet.data()!;
    const client = clientWallet.data()!;
    if (agent.status !== 'active' || client.status !== 'active') throw new HttpsError('failed-precondition', 'Portefeuille indisponible.');
    if (Number(agent.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Float agent insuffisant.');

    const now = Date.now();
    const reference = `MC-DEP-${now}`;
    tx.update(agentWalletRef, {
      availableBalance: Number(agent.availableBalance || 0) - amount,
      ledgerBalance: Number(agent.ledgerBalance || 0) - amount,
      updatedAt: now,
    });
    tx.update(clientWalletRef, {
      availableBalance: Number(client.availableBalance || 0) + amount,
      ledgerBalance: Number(client.ledgerBalance || 0) + amount,
      updatedAt: now,
    });
    tx.set(txRef, {
      id: txId,
      reference,
      type: 'cash_in',
      status: 'settled',
      currency,
      amount,
      agentId: agentUid,
      clientId: resolved.clientUid,
      clientMarketCashId: resolved.marketCashId,
      userIds: [agentUid, resolved.clientUid],
      sourceWalletId: agentWalletRef.id,
      destinationWalletId: clientWalletRef.id,
      rail: 'agent_terminal_market_cash_id',
      createdAt: now,
      updatedAt: now,
    });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: agentWalletRef.id, userId: agentUid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: clientWalletRef.id, userId: resolved.clientUid, direction: 'credit', amount, currency, createdAt: now });
    tx.set(db.collection('notifications').doc(), {
      userId: resolved.clientUid,
      title: 'Dépôt reçu',
      message: `Un Agent Market-Cash a déposé ${amount} ${currency} sur votre portefeuille.`,
      type: 'success',
      category: 'general',
      read: false,
      transactionId: txId,
      createdAt: now,
    });
    tx.set(db.collection('audit_events').doc(), { actorId: agentUid, actorType: 'agent', action: 'AGENT_CASH_IN_MCW', resourceId: txId, clientId: resolved.clientUid, clientMarketCashId: resolved.marketCashId, amount, currency, result: 'success', createdAt: now });
    return { ok: true, reference, transactionId: txId };
  });
});

export const lookupLocalCardForWithdrawal = onCall({ region: REGION }, async request => {
  const agentUid = requireAuth(request);
  await requireAgent(agentUid);
  const resolved = await resolveLocalCard(request.data?.cardReference);
  if (resolved.clientUid === agentUid) throw new HttpsError('failed-precondition', 'Carte client invalide.');
  const raw = String(resolved.card.cardNumber || '').replace(/\D/g, '');
  return {
    cardId: resolved.cardSnap.id,
    cardIdentifier: String(resolved.card.cardIdentifier || resolved.cardSnap.id),
    cardHolder: String(resolved.card.cardHolder || resolved.card.cardHolderName || resolved.user.data()?.displayName || 'Client Market-Cash'),
    maskedNumber: raw ? `•••• ${raw.slice(-4)}` : 'Carte locale Market-Cash',
    clientName: String(resolved.user.data()?.displayName || resolved.card.cardHolder || 'Client Market-Cash'),
  };
});

export const agentCardCashOut = onCall({ region: REGION }, async request => {
  const agentUid = requireAuth(request);
  await requireAgent(agentUid);
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'cardcashout', agentUid);
  const resolved = await resolveLocalCard(request.data?.cardReference);
  if (resolved.clientUid === agentUid) throw new HttpsError('failed-precondition', 'Carte client invalide.');
  await ensureWallets(agentUid, 'agent');

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId };

    const userRef = db.doc(`users/${resolved.clientUid}`);
    const cardRef = db.doc(`cards/${resolved.cardSnap.id}`);
    const cardBalanceRef = db.doc(`card_wallet_accounts/${cardWalletId(resolved.cardSnap.id, currency)}`);
    const agentWalletRef = db.doc(`wallet_accounts/${walletId(agentUid, currency)}`);
    const [clientUser, cardSnap, cardBalanceSnap, agentWallet] = await Promise.all([
      tx.get(userRef),
      tx.get(cardRef),
      tx.get(cardBalanceRef),
      tx.get(agentWalletRef),
    ]);

    assertUserActive(clientUser, 'client');
    requirePin(clientUser, request.data?.clientPin, 'Code secret client incorrect.');
    if (!cardSnap.exists || cardSnap.data()?.userId !== resolved.clientUid || cardSnap.data()?.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Carte locale indisponible.');
    }
    const currentCard = cardSnap.data()!;
    const isVirtualVisa = String(currentCard.type || '').toLowerCase() === 'virtual' && String(currentCard.network || '').toLowerCase() === 'visa';
    if (isVirtualVisa) throw new HttpsError('failed-precondition', 'La Visa virtuelle ne peut pas être utilisée pour ce retrait.');
    if (!agentWallet.exists || agentWallet.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'Float agent indisponible.');

    const cardBalance = cardBalanceSnap.data();
    const available = Number(cardBalance?.availableBalance || 0);
    const ledger = Number(cardBalance?.ledgerBalance || available);
    if (!cardBalanceSnap.exists || cardBalance?.status === 'blocked') throw new HttpsError('failed-precondition', 'Solde de carte indisponible.');
    if (available < amount) throw new HttpsError('failed-precondition', 'Solde de la carte insuffisant.');

    const agent = agentWallet.data()!;
    const now = Date.now();
    const reference = `MC-RET-${now}`;
    tx.set(cardBalanceRef, {
      id: cardBalanceRef.id,
      cardId: resolved.cardSnap.id,
      userId: resolved.clientUid,
      currency,
      availableBalance: available - amount,
      ledgerBalance: ledger - amount,
      status: 'active',
      updatedAt: now,
      createdAt: cardBalance?.createdAt || now,
    }, { merge: true });
    tx.update(agentWalletRef, {
      availableBalance: Number(agent.availableBalance || 0) + amount,
      ledgerBalance: Number(agent.ledgerBalance || 0) + amount,
      updatedAt: now,
    });
    tx.set(txRef, {
      id: txId,
      reference,
      type: 'cash_out',
      status: 'settled',
      currency,
      amount,
      agentId: agentUid,
      clientId: resolved.clientUid,
      cardId: resolved.cardSnap.id,
      cardIdentifier: currentCard.cardIdentifier || resolved.cardSnap.id,
      userIds: [agentUid, resolved.clientUid],
      sourceCardWalletId: cardBalanceRef.id,
      destinationWalletId: agentWalletRef.id,
      rail: 'agent_terminal_local_card',
      authenticatedBy: 'client_pin_on_agent_terminal',
      createdAt: now,
      updatedAt: now,
    });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, cardWalletId: cardBalanceRef.id, userId: resolved.clientUid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: agentWalletRef.id, userId: agentUid, direction: 'credit', amount, currency, createdAt: now });
    tx.set(db.collection('notifications').doc(), {
      userId: resolved.clientUid,
      title: 'Retrait confirmé',
      message: `Retrait de ${amount} ${currency} effectué depuis votre carte locale Market-Cash auprès d’un Agent.`,
      type: 'success',
      category: 'general',
      read: false,
      transactionId: txId,
      createdAt: now,
    });
    tx.set(db.collection('audit_events').doc(), { actorId: agentUid, actorType: 'agent', action: 'AGENT_LOCAL_CARD_CASH_OUT', resourceId: txId, clientId: resolved.clientUid, cardId: resolved.cardSnap.id, amount, currency, result: 'success', createdAt: now });
    return { ok: true, reference, transactionId: txId, amount, currency };
  });
});
