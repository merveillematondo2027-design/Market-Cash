import { createHash, timingSafeEqual } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';

initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
type Currency = typeof CURRENCIES[number];
type DepositRail = 'mobile_money' | 'bank';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const walletId = (uid: string, currency: Currency) => `wallet_${currency.toLowerCase()}_${uid}`;
const cardWalletId = (cardId: string, currency: Currency) => `card_${currency.toLowerCase()}_${cardId}`;
const rechargeNumberForUid = (uid: string) =>
  (BigInt(`0x${sha256(uid).slice(0, 15)}`) % 100000000000n).toString().padStart(11, '0');
const marketCashIdForUid = (uid: string) => `MCW-${sha256(`market-cash:${uid}`).slice(0, 10).toUpperCase()}`;

const requireAuth = (request: any) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  return request.auth.uid as string;
};
const getRole = async (uid: string) => (await db.doc(`users/${uid}`).get()).data()?.role as string | undefined;
const requireAdmin = async (uid: string) => {
  if ((await getRole(uid)) !== 'admin_general') throw new HttpsError('permission-denied', 'Administrateur requis.');
};
const requireAgent = async (uid: string) => {
  const snap = await db.doc(`agent_profiles/${uid}`).get();
  if (!snap.exists || snap.data()?.status !== 'active') throw new HttpsError('permission-denied', 'Compte agent non autorisé.');
  return snap.data()!;
};
const parseCurrency = (value: any): Currency => {
  if (!CURRENCIES.includes(value)) throw new HttpsError('invalid-argument', 'Devise invalide.');
  return value;
};
const parseAmount = (value: any) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpsError('invalid-argument', 'Montant invalide.');
  return Math.round(amount * 100) / 100;
};
const normalizeId = (value: any) => String(value || '').trim().toUpperCase();
const normalizePhone = (value: any) => String(value || '').replace(/[^+\d]/g, '');
const requirePin = (user: FirebaseFirestore.DocumentSnapshot, pin: any) => {
  const value = String(pin || '');
  if (!value || user.data()?.pinHash !== sha256(value)) throw new HttpsError('permission-denied', 'Code secret incorrect.');
};
const idempotencyKey = (value: any, prefix: string, uid: string) => {
  const raw = String(value || '').trim();
  if (!raw) return `${prefix}_${uid}_${Date.now()}`;
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(raw)) throw new HttpsError('invalid-argument', 'Clé de transaction invalide.');
  return raw;
};

async function ensureWalletDocs(uid: string, accountType: 'client' | 'agent' | 'business' = 'client') {
  const rechargeNumber = rechargeNumberForUid(uid);
  const marketCashId = marketCashIdForUid(uid);
  const now = Date.now();
  const batch = db.batch();
  for (const currency of CURRENCIES) {
    const ref = db.doc(`wallet_accounts/${walletId(uid, currency)}`);
    if (!(await ref.get()).exists) {
      batch.set(ref, {
        id: ref.id, userId: uid, accountType, currency,
        availableBalance: 0, ledgerBalance: 0, heldBalance: 0,
        status: 'active', rechargeNumber, marketCashId, createdAt: now, updatedAt: now,
      });
    } else {
      batch.set(ref, { marketCashId, rechargeNumber, updatedAt: now }, { merge: true });
    }
  }
  const rechargeMapping = db.doc(`wallet_recharge_numbers/${rechargeNumber}`);
  if (!(await rechargeMapping.get()).exists) batch.set(rechargeMapping, { userId: uid, rechargeNumber, createdAt: now });
  const publicMapping = db.doc(`wallet_public_ids/${marketCashId}`);
  const existingPublic = await publicMapping.get();
  if (existingPublic.exists && existingPublic.data()?.userId !== uid) {
    throw new HttpsError('already-exists', 'Collision d’identifiant Market-Cash. Contactez le support.');
  }
  batch.set(publicMapping, { userId: uid, marketCashId, updatedAt: now, createdAt: existingPublic.data()?.createdAt || now }, { merge: true });
  await batch.commit();
  return { rechargeNumber, marketCashId };
}

async function getWalletSnapshot(uid: string) {
  const wallets: Record<string, any> = {};
  for (const currency of CURRENCIES) {
    const data = (await db.doc(`wallet_accounts/${walletId(uid, currency)}`).get()).data();
    wallets[currency] = data || null;
  }
  return wallets;
}

export const ensureWalletProfile = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const isAgent = (await db.doc(`agent_profiles/${uid}`).get()).data()?.status === 'active';
  const identity = await ensureWalletDocs(uid, isAgent ? 'agent' : 'client');
  return { ok: true, ...identity, isAgent, wallets: await getWalletSnapshot(uid) };
});

export const getMyWallets = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const isAgent = (await db.doc(`agent_profiles/${uid}`).get()).data()?.status === 'active';
  const identity = await ensureWalletDocs(uid, isAgent ? 'agent' : 'client');
  return { ...identity, isAgent, wallets: await getWalletSnapshot(uid) };
});

export const getMyMarketCashIdentity = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const { marketCashId } = await ensureWalletDocs(uid);
  return { marketCashId };
});

export const lookupMarketCashRecipient = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const marketCashId = normalizeId(request.data?.marketCashId);
  if (!/^MCW-[A-F0-9]{10}$/.test(marketCashId)) throw new HttpsError('invalid-argument', 'ID Market-Cash invalide.');
  const mapping = await db.doc(`wallet_public_ids/${marketCashId}`).get();
  if (!mapping.exists) throw new HttpsError('not-found', 'Bénéficiaire Market-Cash introuvable.');
  const userId = String(mapping.data()?.userId || '');
  if (userId === uid) throw new HttpsError('failed-precondition', 'Vous ne pouvez pas vous envoyer de l’argent à vous-même.');
  const profile = await db.doc(`users/${userId}`).get();
  if (!profile.exists) throw new HttpsError('not-found', 'Profil bénéficiaire introuvable.');
  await ensureWalletDocs(userId);
  return { userId, marketCashId, displayName: profile.data()?.displayName || 'Utilisateur Market-Cash' };
});

export const marketCashTransfer = onCall({ region: REGION }, async (request) => {
  const senderUid = requireAuth(request);
  const marketCashId = normalizeId(request.data?.marketCashId);
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const txId = idempotencyKey(request.data?.idempotencyKey, 'transfer', senderUid);
  await ensureWalletDocs(senderUid);
  const mapping = await db.doc(`wallet_public_ids/${marketCashId}`).get();
  if (!mapping.exists) throw new HttpsError('not-found', 'Bénéficiaire introuvable.');
  const recipientUid = String(mapping.data()?.userId || '');
  if (!recipientUid || recipientUid === senderUid) throw new HttpsError('failed-precondition', 'Bénéficiaire invalide.');
  await ensureWalletDocs(recipientUid);

  return db.runTransaction(async (tx) => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId };
    const senderUserRef = db.doc(`users/${senderUid}`);
    const senderWalletRef = db.doc(`wallet_accounts/${walletId(senderUid, currency)}`);
    const recipientWalletRef = db.doc(`wallet_accounts/${walletId(recipientUid, currency)}`);
    const [senderUser, senderWallet, recipientWallet] = await Promise.all([tx.get(senderUserRef), tx.get(senderWalletRef), tx.get(recipientWalletRef)]);
    if (!senderWallet.exists || !recipientWallet.exists) throw new HttpsError('failed-precondition', 'Portefeuille non initialisé.');
    requirePin(senderUser, request.data?.pin);
    const sender = senderWallet.data()!;
    const recipient = recipientWallet.data()!;
    if (sender.status !== 'active' || recipient.status !== 'active') throw new HttpsError('failed-precondition', 'Portefeuille indisponible.');
    if (Number(sender.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde insuffisant.');
    const now = Date.now();
    const reference = `MC-TRF-${now}`;
    tx.update(senderWalletRef, { availableBalance: Number(sender.availableBalance) - amount, ledgerBalance: Number(sender.ledgerBalance || 0) - amount, updatedAt: now });
    tx.update(recipientWalletRef, { availableBalance: Number(recipient.availableBalance || 0) + amount, ledgerBalance: Number(recipient.ledgerBalance || 0) + amount, updatedAt: now });
    tx.set(txRef, { id: txId, reference, type: 'local_transfer', status: 'settled', currency, amount, senderId: senderUid, recipientId: recipientUid, userIds: [senderUid, recipientUid], sourceWalletId: senderWalletRef.id, destinationWalletId: recipientWalletRef.id, rail: 'market_cash_local', createdAt: now, updatedAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: senderWalletRef.id, userId: senderUid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: recipientWalletRef.id, userId: recipientUid, direction: 'credit', amount, currency, createdAt: now });
    tx.set(db.collection('notifications').doc(), { userId: recipientUid, title: 'Argent reçu', message: `Vous avez reçu ${amount} ${currency} sur votre portefeuille Market-Cash.`, type: 'success', category: 'general', read: false, transactionId: txId, createdAt: now });
    tx.set(db.collection('audit_events').doc(), { actorId: senderUid, action: 'WALLET_TRANSFER', resourceId: txId, result: 'success', recipientId: recipientUid, amount, currency, createdAt: now });
    return { ok: true, reference, transactionId: txId };
  });
});

export const getMyInternalCards = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const snap = await db.collection('cards').where('userId', '==', uid).get();
  const cards: any[] = [];
  for (const docSnap of snap.docs) {
    const card = docSnap.data();
    const isVirtualVisa = String(card.type || '').toLowerCase() === 'virtual' && String(card.network || '').toLowerCase() === 'visa';
    if (isVirtualVisa || card.status !== 'active') continue;
    const balances: Record<string, number> = {};
    for (const currency of CURRENCIES) {
      const balanceDoc = await db.doc(`card_wallet_accounts/${cardWalletId(docSnap.id, currency)}`).get();
      balances[currency] = Number(balanceDoc.data()?.availableBalance || 0);
    }
    const raw = String(card.cardNumber || '').replace(/\s/g, '');
    cards.push({ cardId: docSnap.id, cardIdentifier: card.cardIdentifier || docSnap.id, cardHolder: card.cardHolder || card.cardHolderName || 'Carte Market-Cash', maskedNumber: raw ? `•••• ${raw.slice(-4)}` : 'Carte locale', status: card.status, balances });
  }
  return { cards };
});

export const walletToInternalCard = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const cardId = String(request.data?.cardId || '').trim();
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const txId = idempotencyKey(request.data?.idempotencyKey, 'cardtopup', uid);
  if (!cardId) throw new HttpsError('invalid-argument', 'Carte obligatoire.');
  await ensureWalletDocs(uid);

  return db.runTransaction(async (tx) => {
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const existing = await tx.get(txRef);
    if (existing.exists) return { ok: true, duplicate: true, reference: existing.data()?.reference, transactionId: txId };
    const userRef = db.doc(`users/${uid}`);
    const cardRef = db.doc(`cards/${cardId}`);
    const walletRef = db.doc(`wallet_accounts/${walletId(uid, currency)}`);
    const cardWalletRef = db.doc(`card_wallet_accounts/${cardWalletId(cardId, currency)}`);
    const [userSnap, cardSnap, walletSnap, cardWalletSnap] = await Promise.all([tx.get(userRef), tx.get(cardRef), tx.get(walletRef), tx.get(cardWalletRef)]);
    if (!cardSnap.exists || cardSnap.data()?.userId !== uid) throw new HttpsError('permission-denied', 'Carte non autorisée.');
    const card = cardSnap.data()!;
    const isVirtualVisa = String(card.type || '').toLowerCase() === 'virtual' && String(card.network || '').toLowerCase() === 'visa';
    if (isVirtualVisa) throw new HttpsError('failed-precondition', 'La Visa virtuelle est séparée du portefeuille local.');
    if (card.status !== 'active') throw new HttpsError('failed-precondition', 'Carte inactive.');
    requirePin(userSnap, request.data?.pin);
    const wallet = walletSnap.data();
    if (!wallet || Number(wallet.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', 'Solde portefeuille insuffisant.');
    const cardBalance = Number(cardWalletSnap.data()?.availableBalance || 0);
    const cardLedger = Number(cardWalletSnap.data()?.ledgerBalance || cardBalance);
    const now = Date.now();
    const reference = `MC-CARD-${now}`;
    tx.update(walletRef, { availableBalance: Number(wallet.availableBalance) - amount, ledgerBalance: Number(wallet.ledgerBalance || 0) - amount, updatedAt: now });
    tx.set(cardWalletRef, { id: cardWalletRef.id, cardId, userId: uid, currency, availableBalance: cardBalance + amount, ledgerBalance: cardLedger + amount, status: 'active', updatedAt: now, createdAt: cardWalletSnap.data()?.createdAt || now }, { merge: true });
    tx.set(txRef, { id: txId, reference, type: 'wallet_to_card', status: 'settled', currency, amount, userId: uid, userIds: [uid], cardId, sourceWalletId: walletRef.id, destinationCardWalletId: cardWalletRef.id, rail: 'market_cash_internal_card', createdAt: now, updatedAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, walletId: walletRef.id, userId: uid, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, cardWalletId: cardWalletRef.id, userId: uid, direction: 'credit', amount, currency, createdAt: now });
    return { ok: true, reference, transactionId: txId };
  });
});

export const getMyWalletHistory = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const snap = await db.collection('wallet_transactions').where('userIds', 'array-contains', uid).limit(100).get();
  const transactions = snap.docs.map(d => d.data()).sort((a: any, b: any) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).slice(0, 50);
  return { transactions };
});

async function callMhtDeposit(requestData: any) {
  const baseUrl = String(process.env.MHT_API_BASE_URL || '').replace(/\/$/, '');
  const apiKey = String(process.env.MHT_API_KEY || '');
  if (!baseUrl || !apiKey) return { integration: 'reserved', status: 'awaiting_mht_configuration' };
  const fetchFn: any = (globalThis as any).fetch;
  if (!fetchFn) throw new Error('FETCH_UNAVAILABLE');
  const path = requestData.rail === 'mobile_money' ? '/v1/payments/mobile-money/deposits' : '/v1/payments/bank/deposits';
  const response = await fetchFn(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}`, 'x-market-cash-request-id': requestData.requestId }, body: JSON.stringify(requestData) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`MHT_HTTP_${response.status}`);
  return { integration: 'mht', status: String(body.status || 'pending_user_confirmation'), providerReference: body.reference || body.providerReference || null, pushRequested: body.pushRequested !== false };
}

export const createWalletDeposit = onCall({ region: REGION, timeoutSeconds: 30 }, async (request) => {
  const uid = requireAuth(request);
  const rail = String(request.data?.rail || '') as DepositRail;
  if (!['mobile_money', 'bank'].includes(rail)) throw new HttpsError('invalid-argument', 'Source de dépôt invalide.');
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const requestId = idempotencyKey(request.data?.idempotencyKey, 'deposit', uid);
  const network = String(request.data?.network || '').trim();
  const phone = normalizePhone(request.data?.phone);
  const bank = String(request.data?.bank || '').trim();
  if (rail === 'mobile_money') {
    if (!['M-Pesa', 'Airtel Money', 'Orange Money', 'Afrimoney'].includes(network)) throw new HttpsError('invalid-argument', 'Réseau Mobile Money invalide.');
    if (!/^\+?\d{9,15}$/.test(phone)) throw new HttpsError('invalid-argument', 'Numéro Mobile Money invalide.');
  }
  if (rail === 'bank' && bank.length < 2) throw new HttpsError('invalid-argument', 'Banque obligatoire.');
  await ensureWalletDocs(uid);
  const ref = db.doc(`partner_deposit_requests/${requestId}`);
  const existing = await ref.get();
  if (existing.exists) return existing.data();
  const now = Date.now();
  const payload: any = { requestId, userId: uid, userIds: [uid], walletId: walletId(uid, currency), rail, currency, amount, network: rail === 'mobile_money' ? network : null, phone: rail === 'mobile_money' ? phone : null, bank: rail === 'bank' ? bank : null, orchestrator: 'MHT_APIS', status: 'created', createdAt: now, updatedAt: now };
  await ref.set(payload);
  try {
    const mht = await callMhtDeposit(payload);
    const next = { ...payload, ...mht, status: mht.status, updatedAt: Date.now() };
    await ref.set(next, { merge: true });
    return next;
  } catch (error: any) {
    await ref.set({ status: 'partner_error', partnerError: String(error?.message || 'MHT_ERROR'), updatedAt: Date.now() }, { merge: true });
    throw new HttpsError('unavailable', 'Le partenaire de dépôt est momentanément indisponible. Aucun montant n’a été débité.');
  }
});

async function settleDeposit(requestId: string, providerReference: string) {
  const depositRef = db.doc(`partner_deposit_requests/${requestId}`);
  return db.runTransaction(async tx => {
    const depositSnap = await tx.get(depositRef);
    if (!depositSnap.exists) throw new Error('DEPOSIT_NOT_FOUND');
    const deposit = depositSnap.data()!;
    if (deposit.status === 'settled') return { ok: true, duplicate: true };
    const currency = parseCurrency(deposit.currency);
    const amount = parseAmount(deposit.amount);
    const walletRef = db.doc(`wallet_accounts/${walletId(deposit.userId, currency)}`);
    const walletSnap = await tx.get(walletRef);
    if (!walletSnap.exists) throw new Error('WALLET_NOT_FOUND');
    const wallet = walletSnap.data()!;
    const now = Date.now();
    const transactionId = `deposit_${requestId}`;
    const reference = providerReference || `MC-DEP-${now}`;
    tx.update(walletRef, { availableBalance: Number(wallet.availableBalance || 0) + amount, ledgerBalance: Number(wallet.ledgerBalance || 0) + amount, updatedAt: now });
    tx.set(db.doc(`wallet_transactions/${transactionId}`), { id: transactionId, reference, type: 'wallet_deposit', status: 'settled', currency, amount, userId: deposit.userId, userIds: [deposit.userId], destinationWalletId: walletRef.id, rail: deposit.rail, provider: deposit.network || deposit.bank, providerReference, createdAt: now, updatedAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId, walletId: walletRef.id, userId: deposit.userId, direction: 'credit', amount, currency, createdAt: now });
    tx.update(depositRef, { status: 'settled', providerReference, settledAt: now, updatedAt: now });
    tx.set(db.collection('notifications').doc(), { userId: deposit.userId, title: 'Portefeuille rechargé', message: `Votre portefeuille a été crédité de ${amount} ${currency}.`, type: 'success', category: 'general', read: false, transactionId, createdAt: now });
    return { ok: true, transactionId, reference };
  });
}

export const mhtDepositWebhook = onRequest({ region: REGION }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
  const configured = String(process.env.MHT_WEBHOOK_SECRET || '');
  const supplied = String(req.header('x-mht-webhook-secret') || '');
  if (!configured || !supplied) { res.status(401).send('Unauthorized'); return; }
  const a = Buffer.from(sha256(configured));
  const b = Buffer.from(sha256(supplied));
  if (a.length !== b.length || !timingSafeEqual(a, b)) { res.status(401).send('Unauthorized'); return; }
  const requestId = String(req.body?.requestId || '');
  const status = String(req.body?.status || '').toLowerCase();
  const providerReference = String(req.body?.reference || req.body?.providerReference || '');
  if (!requestId) { res.status(400).send('requestId required'); return; }
  try {
    if (['success', 'succeeded', 'completed', 'settled'].includes(status)) {
      const result = await settleDeposit(requestId, providerReference);
      res.status(200).json(result); return;
    }
    await db.doc(`partner_deposit_requests/${requestId}`).set({ status: ['failed', 'cancelled', 'rejected'].includes(status) ? status : 'pending_user_confirmation', providerReference, updatedAt: Date.now() }, { merge: true });
    res.status(200).json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || 'WEBHOOK_ERROR') });
  }
});

export const adminRegisterAgent = onCall({ region: REGION }, async (request) => {
  const adminUid = requireAuth(request);
  await requireAdmin(adminUid);
  const agentUid = String(request.data?.agentUid || '');
  const user = await db.doc(`users/${agentUid}`).get();
  if (!user.exists) throw new HttpsError('not-found', 'Utilisateur introuvable.');
  const now = Date.now();
  await db.doc(`agent_profiles/${agentUid}`).set({ userId: agentUid, status: 'active', createdBy: adminUid, createdAt: now, updatedAt: now }, { merge: true });
  await ensureWalletDocs(agentUid, 'agent');
  return { ok: true };
});

export const lookupRechargeClient = onCall({ region: REGION }, async (request) => {
  const agentUid = requireAuth(request);
  await requireAgent(agentUid);
  const rechargeNumber = String(request.data?.rechargeNumber || '').replace(/\D/g, '');
  const mapping = await db.doc(`wallet_recharge_numbers/${rechargeNumber}`).get();
  if (!mapping.exists) throw new HttpsError('not-found', 'Client introuvable.');
  const userId = mapping.data()!.userId;
  const user = (await db.doc(`users/${userId}`).get()).data();
  if (!user) throw new HttpsError('not-found', 'Profil client introuvable.');
  const wallets = await getWalletSnapshot(userId);
  return { userId, displayName: user.displayName || 'Client', phone: user.phone || '', rechargeNumber, balances: { USD: wallets.USD?.availableBalance || 0, CDF: wallets.CDF?.availableBalance || 0 } };
});

async function executeAgentTransfer(input: { agentUid: string; clientUid: string; currency: Currency; amount: number; direction: 'cash_in' | 'cash_out'; pin: string; idempotencyKey: string; }) {
  const { agentUid, clientUid, currency, amount, direction, pin, idempotencyKey } = input;
  const txRef = db.doc(`wallet_transactions/${idempotencyKey}`);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(txRef);
    if (existing.exists) return { duplicate: true, ...existing.data() };
    const agentUserRef = db.doc(`users/${agentUid}`);
    const clientUserRef = db.doc(`users/${clientUid}`);
    const agentWalletRef = db.doc(`wallet_accounts/${walletId(agentUid, currency)}`);
    const clientWalletRef = db.doc(`wallet_accounts/${walletId(clientUid, currency)}`);
    const [agentUser, clientUser, agentWallet, clientWallet] = await Promise.all([tx.get(agentUserRef), tx.get(clientUserRef), tx.get(agentWalletRef), tx.get(clientWalletRef)]);
    if (!agentUser.exists || !clientUser.exists) throw new HttpsError('not-found', 'Compte introuvable.');
    requirePin(agentUser, pin);
    if (!agentWallet.exists || !clientWallet.exists) throw new HttpsError('failed-precondition', 'Portefeuille non initialisé.');
    const agent = agentWallet.data()!;
    const client = clientWallet.data()!;
    if (agent.status !== 'active' || client.status !== 'active') throw new HttpsError('failed-precondition', 'Portefeuille indisponible.');
    const debitRef = direction === 'cash_in' ? agentWalletRef : clientWalletRef;
    const creditRef = direction === 'cash_in' ? clientWalletRef : agentWalletRef;
    const debit = direction === 'cash_in' ? agent : client;
    const credit = direction === 'cash_in' ? client : agent;
    if (Number(debit.availableBalance || 0) < amount) throw new HttpsError('failed-precondition', direction === 'cash_in' ? 'Solde agent insuffisant.' : 'Solde client insuffisant.');
    const now = Date.now();
    const reference = `MC-${direction === 'cash_in' ? 'DEP' : 'RET'}-${now}`;
    tx.update(debitRef, { availableBalance: Number(debit.availableBalance) - amount, ledgerBalance: Number(debit.ledgerBalance) - amount, updatedAt: now });
    tx.update(creditRef, { availableBalance: Number(credit.availableBalance) + amount, ledgerBalance: Number(credit.ledgerBalance) + amount, updatedAt: now });
    const record = { id: idempotencyKey, reference, type: direction, status: 'settled', currency, amount, agentId: agentUid, clientId: clientUid, userIds: [agentUid, clientUid], sourceWalletId: debitRef.id, destinationWalletId: creditRef.id, rail: 'agent_terminal', createdAt: now, updatedAt: now };
    tx.set(txRef, record);
    tx.set(db.collection('ledger_entries').doc(), { transactionId: idempotencyKey, walletId: debitRef.id, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: idempotencyKey, walletId: creditRef.id, direction: 'credit', amount, currency, createdAt: now });
    tx.set(db.collection('audit_events').doc(), { actorId: agentUid, actorType: 'agent', action: direction === 'cash_in' ? 'AGENT_CASH_IN' : 'AGENT_CASH_OUT', resourceId: idempotencyKey, result: 'success', clientId: clientUid, amount, currency, createdAt: now });
    return { ok: true, reference, transactionId: idempotencyKey };
  });
}

async function resolveClient(rechargeNumber: string) {
  const mapping = await db.doc(`wallet_recharge_numbers/${rechargeNumber}`).get();
  if (!mapping.exists) throw new HttpsError('not-found', 'Client introuvable.');
  return mapping.data()!.userId as string;
}

export const agentCashIn = onCall({ region: REGION }, async (request) => {
  const agentUid = requireAuth(request); await requireAgent(agentUid);
  const recharge = String(request.data?.rechargeNumber || '').replace(/\D/g, '');
  return executeAgentTransfer({ agentUid, clientUid: await resolveClient(recharge), currency: parseCurrency(request.data?.currency), amount: parseAmount(request.data?.amount), direction: 'cash_in', pin: String(request.data?.pin || ''), idempotencyKey: idempotencyKey(request.data?.idempotencyKey, 'cashin', agentUid) });
});

export const agentCashOut = onCall({ region: REGION }, async (request) => {
  const agentUid = requireAuth(request); await requireAgent(agentUid);
  const recharge = String(request.data?.rechargeNumber || '').replace(/\D/g, '');
  return executeAgentTransfer({ agentUid, clientUid: await resolveClient(recharge), currency: parseCurrency(request.data?.currency), amount: parseAmount(request.data?.amount), direction: 'cash_out', pin: String(request.data?.pin || ''), idempotencyKey: idempotencyKey(request.data?.idempotencyKey, 'cashout', agentUid) });
});

export const getAgentHistory = onCall({ region: REGION }, async (request) => {
  const agentUid = requireAuth(request); await requireAgent(agentUid);
  const snap = await db.collection('wallet_transactions').where('agentId', '==', agentUid).limit(50).get();
  return { transactions: snap.docs.map(d => d.data()).sort((a: any, b: any) => Number(b.createdAt || 0) - Number(a.createdAt || 0)) };
});

export const adminFundAgentFloat = onCall({ region: REGION }, async (request) => {
  const adminUid = requireAuth(request); await requireAdmin(adminUid);
  const agentUid = String(request.data?.agentUid || '');
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const reason = String(request.data?.reason || '').trim();
  if (reason.length < 5) throw new HttpsError('invalid-argument', 'Motif obligatoire.');
  await requireAgent(agentUid); await ensureWalletDocs(agentUid, 'agent');
  const ref = db.doc(`wallet_accounts/${walletId(agentUid, currency)}`);
  const id = `fund_${agentUid}_${Date.now()}`;
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref); const wallet = snap.data()!; const now = Date.now();
    tx.update(ref, { availableBalance: Number(wallet.availableBalance || 0) + amount, ledgerBalance: Number(wallet.ledgerBalance || 0) + amount, updatedAt: now });
    tx.set(db.doc(`wallet_transactions/${id}`), { id, reference: `MC-FLOAT-${now}`, type: 'agent_float_funding', status: 'settled', currency, amount, agentId: agentUid, userIds: [agentUid], approvedBy: adminUid, reason, createdAt: now, updatedAt: now });
    tx.set(db.collection('audit_events').doc(), { actorId: adminUid, action: 'AGENT_FLOAT_FUNDED', agentId: agentUid, amount, currency, reason, createdAt: now });
  });
  return { ok: true, transactionId: id };
});
