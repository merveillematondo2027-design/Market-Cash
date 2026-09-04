import { createHash, randomInt } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
type Currency = typeof CURRENCIES[number];

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const walletId = (uid: string, currency: Currency) => `wallet_${currency.toLowerCase()}_${uid}`;
const localCardIdForUid = (uid: string) => `local_${sha256(`local-card:${uid}`).slice(0, 24)}`;
const localCardIdentifierForUid = (uid: string) => `MCL-${sha256(`local-card-id:${uid}`).slice(0, 12).toUpperCase()}`;
const localCardNumberForUid = (uid: string) => {
  const body = (BigInt(`0x${sha256(`local-card-number:${uid}`).slice(0, 15)}`) % 100000000000000n)
    .toString()
    .padStart(14, '0');
  return `91${body}`;
};
const cardAccountId = (cardId: string, currency: Currency) => `card_${currency.toLowerCase()}_${cardId}`;

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

function requirePin(user: FirebaseFirestore.DocumentSnapshot, value: any, message = 'Code PIN incorrect.') {
  const pin = String(value || '');
  if (!pin || user.data()?.pinHash !== sha256(pin)) throw new HttpsError('permission-denied', message);
}

function assertActiveUser(user: FirebaseFirestore.DocumentSnapshot, expectedRole?: string) {
  if (!user.exists) throw new HttpsError('not-found', 'Compte introuvable.');
  const data = user.data()!;
  if (expectedRole && data.role !== expectedRole) throw new HttpsError('permission-denied', 'Type de compte non autorisé.');
  if (['blocked', 'suspended'].includes(String(data.accountStatus || ''))) {
    throw new HttpsError('failed-precondition', 'Compte indisponible.');
  }
}

async function requireClient(uid: string) {
  const user = await db.doc(`users/${uid}`).get();
  assertActiveUser(user, 'client');
  return user;
}

async function requireAgent(uid: string) {
  const [user, profile] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`agent_profiles/${uid}`).get(),
  ]);
  assertActiveUser(user, 'agent');
  if (!profile.exists || profile.data()?.status !== 'active') {
    throw new HttpsError('permission-denied', 'Compte Agent point de vente non autorisé.');
  }
  return user;
}

async function requireAdmin(uid: string) {
  const user = await db.doc(`users/${uid}`).get();
  assertActiveUser(user, 'admin_general');
  return user;
}

async function ensureWallet(uid: string, currency: Currency, accountType: 'client' | 'agent' | 'business') {
  const ref = db.doc(`wallet_accounts/${walletId(uid, currency)}`);
  const snap = await ref.get();
  if (!snap.exists) {
    const now = Date.now();
    await ref.set({
      id: ref.id,
      userId: uid,
      accountType,
      currency,
      availableBalance: 0,
      ledgerBalance: 0,
      heldBalance: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  }
  return ref;
}

function expiryValues() {
  const now = new Date();
  const startMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
  const startYear = String(now.getUTCFullYear()).slice(-2);
  const end = new Date(Date.UTC(now.getUTCFullYear() + 5, now.getUTCMonth(), 1));
  const endMonth = String(end.getUTCMonth() + 1).padStart(2, '0');
  const endYear = String(end.getUTCFullYear()).slice(-2);
  return { expiryStart: `${startMonth}/${startYear}`, expiryEnd: `${endMonth}/${endYear}` };
}

async function ensureLocalCard(uid: string) {
  const user = await requireClient(uid);
  const cardId = localCardIdForUid(uid);
  const cardRef = db.doc(`local_cards/${cardId}`);
  const existing = await cardRef.get();
  const now = Date.now();
  const holder = String(user.data()?.displayName || user.data()?.fullName || 'CLIENT MARKET-CASH').trim() || 'CLIENT MARKET-CASH';
  const cardIdentifier = localCardIdentifierForUid(uid);
  const cardNumber = localCardNumberForUid(uid);
  const expiry = expiryValues();

  if (!existing.exists) {
    await cardRef.set({
      id: cardId,
      cardId,
      cardIdentifier,
      program: 'market_cash_local',
      userId: uid,
      userName: holder,
      cardNumber,
      cardHolder: holder,
      cardHolderName: holder,
      network: 'market_cash',
      type: 'local',
      status: 'active',
      qrData: `MARKET-CASH-CARD:${cardIdentifier}`,
      ...expiry,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await cardRef.set({
      program: 'market_cash_local',
      userId: uid,
      userName: holder,
      cardHolder: holder,
      cardHolderName: holder,
      status: 'active',
      updatedAt: now,
    }, { merge: true });
  }

  for (const currency of CURRENCIES) {
    const accountRef = db.doc(`card_wallet_accounts/${cardAccountId(cardId, currency)}`);
    const account = await accountRef.get();
    if (!account.exists) {
      await accountRef.set({
        id: accountRef.id,
        cardId,
        userId: uid,
        currency,
        availableBalance: 0,
        ledgerBalance: 0,
        heldBalance: 0,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  return (await cardRef.get()).data()!;
}

function normalizedCardReference(value: any) {
  const raw = String(value || '').trim();
  if (!raw) throw new HttpsError('invalid-argument', 'Numéro ou identifiant de carte requis.');
  const qr = raw.match(/(?:MARKET-CASH-CARD|MCL)[:|\s-]+([A-Za-z0-9_-]{4,120})/i);
  if (qr?.[1]) return { identifier: qr[1].toUpperCase(), digits: '' };
  const digits = raw.replace(/\D/g, '');
  if (/^\d{12,19}$/.test(digits)) return { identifier: '', digits };
  return { identifier: raw.toUpperCase(), digits: '' };
}

async function resolveLocalCard(value: any) {
  const ref = normalizedCardReference(value);
  let snap: FirebaseFirestore.DocumentSnapshot | null = null;

  if (ref.identifier) {
    const direct = await db.doc(`local_cards/${ref.identifier}`).get();
    if (direct.exists) snap = direct;
    if (!snap) {
      const byIdentifier = await db.collection('local_cards').where('cardIdentifier', '==', ref.identifier).limit(1).get();
      if (!byIdentifier.empty) snap = byIdentifier.docs[0];
    }
  }
  if (!snap && ref.digits) {
    const byNumber = await db.collection('local_cards').where('cardNumber', '==', ref.digits).limit(1).get();
    if (!byNumber.empty) snap = byNumber.docs[0];
  }

  if (!snap?.exists) throw new HttpsError('not-found', 'Carte locale Market-Cash introuvable.');
  const card = snap.data()!;
  if (card.program !== 'market_cash_local' || card.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Carte locale indisponible.');
  }
  const clientUid = String(card.userId || '');
  if (!clientUid) throw new HttpsError('failed-precondition', 'Carte locale non attribuée.');
  const user = await db.doc(`users/${clientUid}`).get();
  assertActiveUser(user, 'client');
  return { snap, card, clientUid, user };
}

async function resolveMerchant(value: any, payerUid: string) {
  const marketCashId = String(value || '').trim().toUpperCase();
  if (!/^MCW-[A-F0-9]{10}$/.test(marketCashId)) throw new HttpsError('invalid-argument', 'ID marchand invalide.');
  const mapping = await db.doc(`wallet_public_ids/${marketCashId}`).get();
  if (!mapping.exists) throw new HttpsError('not-found', 'Marchand introuvable.');
  const merchantUid = String(mapping.data()?.userId || '');
  if (!merchantUid || merchantUid === payerUid) throw new HttpsError('failed-precondition', 'Marchand invalide.');
  const [user, profile] = await Promise.all([
    db.doc(`users/${merchantUid}`).get(),
    db.doc(`merchant_profiles/${merchantUid}`).get(),
  ]);
  assertActiveUser(user, 'marchand');
  if (!profile.exists || profile.data()?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Ce compte n’est pas un marchand Market-Cash actif.');
  }
  return {
    merchantUid,
    marketCashId,
    displayName: String(profile.data()?.tradeName || user.data()?.displayName || 'Marchand Market-Cash'),
  };
}

export const ensureLocalMarketCashCard = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const card = await ensureLocalCard(uid);
  return {
    ok: true,
    cardId: card.cardId,
    cardIdentifier: card.cardIdentifier,
  };
});

export const getMyLocalMarketCashCards = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const card = await ensureLocalCard(uid);
  const balances: Partial<Record<Currency, number>> = {};
  for (const currency of CURRENCIES) {
    const account = await db.doc(`card_wallet_accounts/${cardAccountId(card.cardId, currency)}`).get();
    balances[currency] = Number(account.data()?.availableBalance || 0);
  }
  const raw = String(card.cardNumber || '').replace(/\D/g, '');
  return {
    cards: [{
      cardId: card.cardId,
      cardIdentifier: card.cardIdentifier,
      cardHolder: card.cardHolder,
      maskedNumber: raw ? `•••• •••• •••• ${raw.slice(-4)}` : 'Carte locale Market-Cash',
      status: card.status,
      qrData: card.qrData,
      balances,
    }],
  };
});

export const walletToLocalMarketCashCard = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const cardId = String(request.data?.cardId || '').trim();
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'localcardtopup', uid);
  const user = await requireClient(uid);
  const localCard = await ensureLocalCard(uid);
  if (cardId !== localCard.cardId) throw new HttpsError('permission-denied', 'Carte locale non autorisée.');
  await ensureWallet(uid, currency, 'client');

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId };

    const walletRef = db.doc(`wallet_accounts/${walletId(uid, currency)}`);
    const cardRef = db.doc(`local_cards/${cardId}`);
    const cardBalanceRef = db.doc(`card_wallet_accounts/${cardAccountId(cardId, currency)}`);
    const [walletSnap, cardSnap, cardBalanceSnap] = await Promise.all([
      tx.get(walletRef),
      tx.get(cardRef),
      tx.get(cardBalanceRef),
    ]);
    requirePin(user, request.data?.pin);
    if (!cardSnap.exists || cardSnap.data()?.userId !== uid || cardSnap.data()?.program !== 'market_cash_local' || cardSnap.data()?.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Carte locale indisponible.');
    }
    const wallet = walletSnap.data();
    if (!wallet || wallet.status !== 'active' || Number(wallet.availableBalance || 0) < amount) {
      throw new HttpsError('failed-precondition', 'Solde portefeuille insuffisant.');
    }
    const cardBalance = Number(cardBalanceSnap.data()?.availableBalance || 0);
    const cardLedger = Number(cardBalanceSnap.data()?.ledgerBalance || cardBalance);
    const now = Date.now();
    const reference = `MC-LCARD-${now}`;

    tx.update(walletRef, {
      availableBalance: Number(wallet.availableBalance || 0) - amount,
      ledgerBalance: Number(wallet.ledgerBalance || 0) - amount,
      updatedAt: now,
    });
    tx.set(cardBalanceRef, {
      id: cardBalanceRef.id,
      cardId,
      userId: uid,
      currency,
      availableBalance: cardBalance + amount,
      ledgerBalance: cardLedger + amount,
      status: 'active',
      updatedAt: now,
      createdAt: cardBalanceSnap.data()?.createdAt || now,
    }, { merge: true });
    tx.set(txRef, {
      id: txId,
      reference,
      type: 'wallet_to_local_card',
      status: 'settled',
      currency,
      amount,
      userId: uid,
      userIds: [uid],
      cardId,
      sourceWalletId: walletRef.id,
      destinationCardWalletId: cardBalanceRef.id,
      rail: 'market_cash_local_card',
      createdAt: now,
      updatedAt: now,
    });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: walletRef.id, userId: uid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, cardWalletId: cardBalanceRef.id, userId: uid, direction: 'credit', amount, currency, createdAt: now });
    return { ok: true, reference, transactionId: txId };
  });
});

export const merchantPaymentFromLocalCard = onCall({ region: REGION }, async request => {
  const payerUid = requireAuth(request);
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const cardId = String(request.data?.cardId || '').trim();
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'localcardpay', payerUid);
  const payerUser = await requireClient(payerUid);
  if (payerUser.data()?.kycStatus !== 'approved') throw new HttpsError('failed-precondition', 'Vérification KYC requise.');
  requirePin(payerUser, request.data?.pin);
  const localCard = await ensureLocalCard(payerUid);
  if (!cardId || cardId !== localCard.cardId) throw new HttpsError('permission-denied', 'Carte locale obligatoire.');
  const merchant = await resolveMerchant(request.data?.marketCashId, payerUid);
  await ensureWallet(merchant.merchantUid, currency, 'business');

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId, merchantName: merchant.displayName };

    const cardRef = db.doc(`local_cards/${cardId}`);
    const cardBalanceRef = db.doc(`card_wallet_accounts/${cardAccountId(cardId, currency)}`);
    const merchantWalletRef = db.doc(`wallet_accounts/${walletId(merchant.merchantUid, currency)}`);
    const [cardSnap, cardBalanceSnap, merchantWalletSnap] = await Promise.all([
      tx.get(cardRef),
      tx.get(cardBalanceRef),
      tx.get(merchantWalletRef),
    ]);
    if (!cardSnap.exists || cardSnap.data()?.userId !== payerUid || cardSnap.data()?.program !== 'market_cash_local' || cardSnap.data()?.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Carte locale indisponible.');
    }
    const cardBalance = cardBalanceSnap.data();
    const merchantWallet = merchantWalletSnap.data();
    if (!cardBalance || cardBalance.status !== 'active') throw new HttpsError('failed-precondition', 'Solde de carte indisponible.');
    if (!merchantWallet || merchantWallet.status !== 'active') throw new HttpsError('failed-precondition', 'Compte marchand indisponible.');
    if (Number(cardBalance.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde de la carte locale insuffisant.');

    const now = Date.now();
    const reference = `MC-PAY-${now}`;
    tx.update(cardBalanceRef, {
      availableBalance: Number(cardBalance.availableBalance || 0) - amount,
      ledgerBalance: Number(cardBalance.ledgerBalance || 0) - amount,
      updatedAt: now,
    });
    tx.update(merchantWalletRef, {
      availableBalance: Number(merchantWallet.availableBalance || 0) + amount,
      ledgerBalance: Number(merchantWallet.ledgerBalance || 0) + amount,
      updatedAt: now,
    });
    tx.set(txRef, {
      id: txId,
      reference,
      type: 'merchant_payment',
      status: 'settled',
      currency,
      amount,
      senderId: payerUid,
      recipientId: merchant.merchantUid,
      merchantId: merchant.merchantUid,
      merchantMarketCashId: merchant.marketCashId,
      merchantName: merchant.displayName,
      cardId,
      userIds: [payerUid, merchant.merchantUid],
      sourceCardWalletId: cardBalanceRef.id,
      destinationWalletId: merchantWalletRef.id,
      rail: 'market_cash_local_card_merchant',
      createdAt: now,
      updatedAt: now,
    });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, cardWalletId: cardBalanceRef.id, userId: payerUid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: merchantWalletRef.id, userId: merchant.merchantUid, direction: 'credit', amount, currency, createdAt: now });
    tx.set(db.collection('notifications').doc(), {
      userId: merchant.merchantUid,
      title: 'Paiement reçu',
      message: `Vous avez reçu ${amount} ${currency} par carte locale Market-Cash.`,
      type: 'success',
      category: 'general',
      read: false,
      transactionId: txId,
      createdAt: now,
    });
    tx.set(db.collection('notifications').doc(), {
      userId: payerUid,
      title: 'Paiement confirmé',
      message: `Paiement de ${amount} ${currency} effectué avec votre carte locale Market-Cash.`,
      type: 'success',
      category: 'general',
      read: false,
      transactionId: txId,
      createdAt: now,
    });
    tx.set(db.collection('audit_events').doc(), { actorId: payerUid, action: 'LOCAL_CARD_MERCHANT_PAYMENT', resourceId: txId, merchantId: merchant.merchantUid, cardId, amount, currency, result: 'success', createdAt: now });
    return { ok: true, reference, transactionId: txId, merchantName: merchant.displayName };
  });
});

export const lookupLocalMarketCashCardForWithdrawal = onCall({ region: REGION }, async request => {
  const agentUid = requireAuth(request);
  await requireAgent(agentUid);
  const resolved = await resolveLocalCard(request.data?.cardReference);
  if (resolved.clientUid === agentUid) throw new HttpsError('failed-precondition', 'Carte client invalide.');
  const raw = String(resolved.card.cardNumber || '').replace(/\D/g, '');
  return {
    cardId: resolved.snap.id,
    cardIdentifier: String(resolved.card.cardIdentifier || resolved.snap.id),
    cardHolder: String(resolved.card.cardHolder || resolved.user.data()?.displayName || 'Client Market-Cash'),
    maskedNumber: raw ? `•••• ${raw.slice(-4)}` : 'Carte locale Market-Cash',
    clientName: String(resolved.user.data()?.displayName || resolved.card.cardHolder || 'Client Market-Cash'),
  };
});

export const agentLocalCardCashOut = onCall({ region: REGION }, async request => {
  const agentUid = requireAuth(request);
  await requireAgent(agentUid);
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const txId = parseIdempotencyKey(request.data?.idempotencyKey, 'localcardcashout', agentUid);
  const resolved = await resolveLocalCard(request.data?.cardReference);
  if (resolved.clientUid === agentUid) throw new HttpsError('failed-precondition', 'Carte client invalide.');
  await ensureWallet(agentUid, currency, 'agent');

  return db.runTransaction(async tx => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId, amount, currency };

    const clientUserRef = db.doc(`users/${resolved.clientUid}`);
    const cardRef = db.doc(`local_cards/${resolved.snap.id}`);
    const cardBalanceRef = db.doc(`card_wallet_accounts/${cardAccountId(resolved.snap.id, currency)}`);
    const agentWalletRef = db.doc(`wallet_accounts/${walletId(agentUid, currency)}`);
    const [clientUser, cardSnap, cardBalanceSnap, agentWalletSnap] = await Promise.all([
      tx.get(clientUserRef),
      tx.get(cardRef),
      tx.get(cardBalanceRef),
      tx.get(agentWalletRef),
    ]);
    assertActiveUser(clientUser, 'client');
    requirePin(clientUser, request.data?.clientPin, 'Code secret client incorrect.');
    if (!cardSnap.exists || cardSnap.data()?.userId !== resolved.clientUid || cardSnap.data()?.program !== 'market_cash_local' || cardSnap.data()?.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Carte locale indisponible.');
    }
    const cardBalance = cardBalanceSnap.data();
    const agentWallet = agentWalletSnap.data();
    if (!cardBalance || cardBalance.status !== 'active') throw new HttpsError('failed-precondition', 'Solde de carte indisponible.');
    if (!agentWallet || agentWallet.status !== 'active') throw new HttpsError('failed-precondition', 'Float agent indisponible.');
    if (Number(cardBalance.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde de la carte locale insuffisant.');

    const now = Date.now();
    const reference = `MC-RET-${now}`;
    tx.update(cardBalanceRef, {
      availableBalance: Number(cardBalance.availableBalance || 0) - amount,
      ledgerBalance: Number(cardBalance.ledgerBalance || 0) - amount,
      updatedAt: now,
    });
    tx.update(agentWalletRef, {
      availableBalance: Number(agentWallet.availableBalance || 0) + amount,
      ledgerBalance: Number(agentWallet.ledgerBalance || 0) + amount,
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
      cardId: resolved.snap.id,
      cardIdentifier: resolved.card.cardIdentifier || resolved.snap.id,
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
    tx.set(db.collection('audit_events').doc(), { actorId: agentUid, actorType: 'agent', action: 'AGENT_LOCAL_CARD_CASH_OUT', resourceId: txId, clientId: resolved.clientUid, cardId: resolved.snap.id, amount, currency, result: 'success', createdAt: now });
    return { ok: true, reference, transactionId: txId, amount, currency };
  });
});

export const adminResetVisaTestData = onCall({ region: REGION, timeoutSeconds: 120 }, async request => {
  const adminUid = requireAuth(request);
  await requireAdmin(adminUid);
  const migrationRef = db.doc('system_migrations/reset_visa_test_clients_20260904');
  const migration = await migrationRef.get();
  if (migration.data()?.status === 'completed') return { ok: true, alreadyCompleted: true, ...migration.data() };

  await migrationRef.set({ status: 'running', startedAt: Date.now(), startedBy: adminUid }, { merge: true });
  let resetCards = 0;
  let deletedRequests = 0;
  let deletedDeliveries = 0;
  let deletedCardAccounts = 0;
  const visaCardIds = new Set<string>();

  const cards = await db.collection('cards').get();
  for (const cardDoc of cards.docs) {
    const card = cardDoc.data();
    const network = String(card.network || 'visa').toLowerCase();
    if (network !== 'visa') continue;
    visaCardIds.add(cardDoc.id);
    const hadClient = Boolean(String(card.userId || '').trim());
    if (hadClient || ['sold', 'confirmed', 'reserved'].includes(String(card.saleStatus || ''))) {
      resetCards += 1;
      await cardDoc.ref.set({
        userId: '',
        userName: '',
        userEmail: '',
        cardHolder: 'CLIENT MARKET-CASH',
        cardHolderName: 'CLIENT MARKET-CASH',
        status: 'disabled',
        saleStatus: 'available',
        soldAt: FieldValue.delete(),
        soldBy: FieldValue.delete(),
        soldByAgencyId: FieldValue.delete(),
        soldByAgencyName: FieldValue.delete(),
        printStatus: FieldValue.delete(),
        printReady: FieldValue.delete(),
        printedAt: FieldValue.delete(),
        printedBy: FieldValue.delete(),
        updatedAt: Date.now(),
      }, { merge: true });
    }
  }

  const requests = await db.collection('card_purchase_requests').get();
  for (const requestDoc of requests.docs) {
    await requestDoc.ref.delete();
    deletedRequests += 1;
  }

  const deliveries = await db.collection('physical_card_requests').get();
  for (const deliveryDoc of deliveries.docs) {
    await deliveryDoc.ref.delete();
    deletedDeliveries += 1;
  }

  const cardAccounts = await db.collection('card_wallet_accounts').get();
  for (const accountDoc of cardAccounts.docs) {
    if (visaCardIds.has(String(accountDoc.data()?.cardId || ''))) {
      await accountDoc.ref.delete();
      deletedCardAccounts += 1;
    }
  }

  const completed = {
    status: 'completed',
    completedAt: Date.now(),
    completedBy: adminUid,
    resetCards,
    deletedRequests,
    deletedDeliveries,
    deletedCardAccounts,
  };
  await migrationRef.set(completed, { merge: true });
  return { ok: true, ...completed };
});
