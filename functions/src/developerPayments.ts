import { createHash, randomBytes } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
type Currency = typeof CURRENCIES[number];

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const normalize = (value: unknown) => String(value || '').trim();
const normalizeUpper = (value: unknown) => normalize(value).toUpperCase();
const roundMoney = (value: number) => Math.round(value * 100) / 100;
const localCardIdForUid = (uid: string) => `local_${sha256(`local-card:${uid}`).slice(0, 24)}`;
const cardAccountId = (cardId: string, currency: Currency) => `card_${currency.toLowerCase()}_${cardId}`;
const developerAccountId = (uid: string) => `DEV-${sha256(`developer:${uid}`).slice(0, 10).toUpperCase()}`;
const developerWalletId = (developerId: string, currency: Currency) => `dev_${currency.toLowerCase()}_${developerId}`;
const revenueWalletId = (currency: Currency) => `market_cash_revenue_${currency.toLowerCase()}`;

function requireAuth(request: any) {
  const uid = String(request.auth?.uid || '');
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  return uid;
}

async function requireAdmin(uid: string) {
  const user = await db.doc(`users/${uid}`).get();
  if (!user.exists || user.data()?.role !== 'admin_general') throw new HttpsError('permission-denied', 'Administrateur requis.');
}

function parseCurrency(value: unknown): Currency {
  const currency = normalizeUpper(value) as Currency;
  if (!CURRENCIES.includes(currency)) throw new HttpsError('invalid-argument', 'Devise invalide.');
  return currency;
}

function parseAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpsError('invalid-argument', 'Montant invalide.');
  return roundMoney(amount);
}

const DEFAULT_FEES = {
  developer_card_payment: { percent: 2.5, minUsd: 0.15, minCdf: 350, chargedTo: 'payer' },
  merchant_payment: { percent: 2.0, minUsd: 0.10, minCdf: 250, chargedTo: 'payer' },
  market_cash_transfer: { percent: 1.5, minUsd: 0.05, minCdf: 150, chargedTo: 'sender' },
  wallet_to_card: { percent: 0.5, minUsd: 0.02, minCdf: 50, chargedTo: 'wallet' },
  agent_cash_in: { percent: 1.0, minUsd: 0.05, minCdf: 100, chargedTo: 'client' },
  agent_cash_out: { percent: 3.5, minUsd: 0.15, minCdf: 350, chargedTo: 'client' },
  mobile_money_withdrawal: { percent: 4.0, minUsd: 0.20, minCdf: 500, chargedTo: 'client' },
  bank_withdrawal: { percent: 3.0, minUsd: 0.20, minCdf: 500, chargedTo: 'client' },
} as const;

type FeeAction = keyof typeof DEFAULT_FEES;

async function feeFor(action: FeeAction, amount: number, currency: Currency) {
  const snap = await db.doc(`app_settings/transaction_fees`).get();
  const configured = snap.data()?.[action] || {};
  const defaults = DEFAULT_FEES[action];
  const percent = Number(configured.percent ?? defaults.percent);
  const minimum = currency === 'USD'
    ? Number(configured.minUsd ?? defaults.minUsd)
    : Number(configured.minCdf ?? defaults.minCdf);
  return roundMoney(Math.max(amount * percent / 100, minimum));
}

async function ensureDeveloperWallets(developerId: string, uid: string) {
  const now = Date.now();
  const batch = db.batch();
  for (const currency of CURRENCIES) {
    const ref = db.doc(`developer_wallet_accounts/${developerWalletId(developerId, currency)}`);
    const snap = await ref.get();
    if (!snap.exists) batch.set(ref, {
      id: ref.id, developerId, userId: uid, currency,
      availableBalance: 0, ledgerBalance: 0, heldBalance: 0,
      status: 'active', createdAt: now, updatedAt: now,
    });
  }
  await batch.commit();
}

export const createDeveloperAccount = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const companyName = normalize(request.data?.companyName);
  const contactEmail = normalize(request.data?.contactEmail);
  if (companyName.length < 2) throw new HttpsError('invalid-argument', 'Nom entreprise requis.');
  if (!/^\S+@\S+\.\S+$/.test(contactEmail)) throw new HttpsError('invalid-argument', 'Email invalide.');
  const developerId = developerAccountId(uid);
  const ref = db.doc(`developer_accounts/${developerId}`);
  const existing = await ref.get();
  const now = Date.now();
  await ref.set({
    developerId, userId: uid, companyName, contactEmail,
    status: existing.data()?.status || 'pending',
    createdAt: existing.data()?.createdAt || now, updatedAt: now,
  }, { merge: true });
  await ensureDeveloperWallets(developerId, uid);
  return { developerId, status: existing.data()?.status || 'pending' };
});

export const approveDeveloperAccount = onCall({ region: REGION }, async request => {
  const adminUid = requireAuth(request);
  await requireAdmin(adminUid);
  const developerId = normalizeUpper(request.data?.developerId);
  const ref = db.doc(`developer_accounts/${developerId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Compte développeur introuvable.');
  const now = Date.now();
  await ref.set({ status: 'active', approvedBy: adminUid, approvedAt: now, updatedAt: now }, { merge: true });
  const uid = String(snap.data()?.userId || '');
  if (uid) await db.doc(`users/${uid}`).set({ developerEnabled: true, updatedAt: now }, { merge: true });
  await db.collection('audit_events').add({ actorId: adminUid, action: 'DEVELOPER_ACCOUNT_APPROVED', developerId, createdAt: now });
  return { ok: true, developerId };
});

export const registerDeveloperApp = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const developerId = developerAccountId(uid);
  const developer = await db.doc(`developer_accounts/${developerId}`).get();
  if (!developer.exists || developer.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'Compte développeur non approuvé.');
  const appName = normalize(request.data?.appName);
  if (appName.length < 2) throw new HttpsError('invalid-argument', 'Nom application requis.');
  const appId = `APP-${randomBytes(6).toString('hex').toUpperCase()}`;
  const apiKey = `mck_live_${randomBytes(24).toString('hex')}`;
  const now = Date.now();
  await db.doc(`developer_apps/${appId}`).set({
    appId, developerId, userId: uid, appName,
    apiKeyHash: sha256(apiKey), status: 'active',
    allowedCurrencies: [...CURRENCIES], createdAt: now, updatedAt: now,
  });
  return { appId, apiKey, appName, note: 'Copiez cette clé maintenant. Market-Cash ne la réaffichera pas.' };
});

export const getMyDeveloperDashboard = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request);
  const developerId = developerAccountId(uid);
  const [account, apps, transactions] = await Promise.all([
    db.doc(`developer_accounts/${developerId}`).get(),
    db.collection('developer_apps').where('developerId', '==', developerId).limit(20).get(),
    db.collection('wallet_transactions').where('developerId', '==', developerId).limit(100).get(),
  ]);
  if (!account.exists) return { developer: null, apps: [], wallets: {}, transactions: [] };
  const wallets: Record<string, any> = {};
  for (const currency of CURRENCIES) wallets[currency] = (await db.doc(`developer_wallet_accounts/${developerWalletId(developerId, currency)}`).get()).data() || null;
  return {
    developer: account.data(),
    apps: apps.docs.map(d => ({ ...d.data(), apiKeyHash: undefined })),
    wallets,
    transactions: transactions.docs.map(d => d.data()).sort((a: any, b: any) => Number(b.createdAt || 0) - Number(a.createdAt || 0)),
  };
});

export const getTransactionFeeSchedule = onCall({ region: REGION }, async request => {
  requireAuth(request);
  const configured = (await db.doc('app_settings/transaction_fees').get()).data() || {};
  return { fees: Object.fromEntries(Object.entries(DEFAULT_FEES).map(([key, value]) => [key, { ...value, ...(configured as any)[key] }])) };
});

export const adminUpdateTransactionFees = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request); await requireAdmin(uid);
  const input = request.data?.fees || {};
  const allowed: Record<string, any> = {};
  for (const action of Object.keys(DEFAULT_FEES) as FeeAction[]) {
    if (!input[action]) continue;
    const percent = Number(input[action].percent);
    const minUsd = Number(input[action].minUsd);
    const minCdf = Number(input[action].minCdf);
    if (![percent, minUsd, minCdf].every(Number.isFinite) || percent < 0 || percent > 20 || minUsd < 0 || minCdf < 0) {
      throw new HttpsError('invalid-argument', `Frais invalides: ${action}`);
    }
    allowed[action] = { percent, minUsd, minCdf, updatedAt: Date.now(), updatedBy: uid };
  }
  await db.doc('app_settings/transaction_fees').set(allowed, { merge: true });
  return { ok: true };
});

async function authenticateDeveloperApp(req: any) {
  const appId = normalizeUpper(req.header('x-market-cash-app-id'));
  const authorization = normalize(req.header('authorization'));
  const headerKey = normalize(req.header('x-market-cash-api-key'));
  const apiKey = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : headerKey;
  if (!appId || !apiKey) throw new Error('UNAUTHORIZED');
  const app = await db.doc(`developer_apps/${appId}`).get();
  if (!app.exists || app.data()?.status !== 'active' || app.data()?.apiKeyHash !== sha256(apiKey)) throw new Error('UNAUTHORIZED');
  const developerId = String(app.data()?.developerId || '');
  const developer = await db.doc(`developer_accounts/${developerId}`).get();
  if (!developer.exists || developer.data()?.status !== 'active') throw new Error('DEVELOPER_INACTIVE');
  return { appId, app: app.data()!, developerId, developer: developer.data()! };
}

function expiryMatches(stored: string, submitted: string) {
  return stored.replace(/\s/g, '') === submitted.replace(/\s/g, '');
}

export const marketCashApiCardPayment = onRequest({ region: REGION }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ status: 'error', code: 'METHOD_NOT_ALLOWED' }); return; }
  try {
    const auth = await authenticateDeveloperApp(req);
    const currency = parseCurrency(req.body?.currency);
    const amount = parseAmount(req.body?.amount);
    const cardNumber = normalize(req.body?.cardNumber).replace(/\D/g, '');
    const holder = normalizeUpper(req.body?.cardHolder);
    const expiry = normalize(req.body?.expiry);
    const cvv = normalize(req.body?.cvv);
    const externalReference = normalize(req.body?.externalReference);
    const reason = normalize(req.body?.reason || `Paiement ${auth.app.appName}`);
    if (!/^4585020002\d{6}$/.test(cardNumber)) throw new Error('CARD_INVALID');
    if (!/^\d{3}$/.test(cvv)) throw new Error('CVV_INVALID');
    if (!/^\d{2}\/\d{2}$/.test(expiry)) throw new Error('EXPIRY_INVALID');
    if (externalReference.length < 6 || externalReference.length > 120) throw new Error('REFERENCE_INVALID');

    const registry = await db.doc(`card_number_registry/${cardNumber}`).get();
    if (!registry.exists) throw new Error('CARD_NOT_FOUND');
    const clientUid = String(registry.data()?.userId || '');
    const cardId = localCardIdForUid(clientUid);
    const txId = `devpay_${sha256(`${auth.appId}:${externalReference}`).slice(0, 36)}`;
    const cardRef = db.doc(`local_cards/${cardId}`);
    const cardWalletRef = db.doc(`card_wallet_accounts/${cardAccountId(cardId, currency)}`);
    const developerWalletRef = db.doc(`developer_wallet_accounts/${developerWalletId(auth.developerId, currency)}`);
    const revenueRef = db.doc(`platform_revenue_accounts/${revenueWalletId(currency)}`);
    const txRef = db.doc(`wallet_transactions/${txId}`);
    const securityRef = db.doc(`user_security/${clientUid}`);
    const fee = await feeFor('developer_card_payment', amount, currency);
    const totalDebit = roundMoney(amount + fee);

    const result = await db.runTransaction(async tx => {
      const [existing, cardSnap, cardWallet, developerWallet, revenue, security] = await Promise.all([
        tx.get(txRef), tx.get(cardRef), tx.get(cardWalletRef), tx.get(developerWalletRef), tx.get(revenueRef), tx.get(securityRef),
      ]);
      if (existing.exists) return { duplicate: true, ...existing.data() };
      if (!cardSnap.exists || cardSnap.data()?.status !== 'active') throw new Error('CARD_INACTIVE');
      const card = cardSnap.data()!;
      if (String(card.cardNumber || '') !== cardNumber) throw new Error('CARD_INVALID');
      if (normalizeUpper(card.cardHolder || card.cardHolderName) !== holder) throw new Error('HOLDER_MISMATCH');
      if (!expiryMatches(String(card.expiryEnd || ''), expiry)) throw new Error('EXPIRY_MISMATCH');
      if (security.data()?.localTransactionCvvHash !== sha256(cvv)) throw new Error('CVV_INVALID');
      if (!cardWallet.exists || cardWallet.data()?.status !== 'active') throw new Error('CARD_ACCOUNT_INACTIVE');
      if (!developerWallet.exists || developerWallet.data()?.status !== 'active') throw new Error('DEVELOPER_WALLET_INACTIVE');
      const cardBalance = Number(cardWallet.data()?.availableBalance || 0);
      if (cardBalance < totalDebit) throw new Error('INSUFFICIENT_FUNDS');
      const developerBalance = Number(developerWallet.data()?.availableBalance || 0);
      const revenueBalance = Number(revenue.data()?.availableBalance || 0);
      const now = Date.now();
      const reference = `MC-PAY-${now}-${randomBytes(3).toString('hex').toUpperCase()}`;
      const cardBalanceAfter = roundMoney(cardBalance - totalDebit);
      const developerBalanceAfter = roundMoney(developerBalance + amount);
      const revenueAfter = roundMoney(revenueBalance + fee);
      tx.update(cardWalletRef, { availableBalance: cardBalanceAfter, ledgerBalance: roundMoney(Number(cardWallet.data()?.ledgerBalance || cardBalance) - totalDebit), updatedAt: now });
      tx.update(developerWalletRef, { availableBalance: developerBalanceAfter, ledgerBalance: roundMoney(Number(developerWallet.data()?.ledgerBalance || developerBalance) + amount), updatedAt: now });
      tx.set(revenueRef, { id: revenueRef.id, currency, availableBalance: revenueAfter, ledgerBalance: revenueAfter, updatedAt: now, createdAt: revenue.data()?.createdAt || now }, { merge: true });
      const record = {
        id: txId, reference, externalReference, type: 'developer_card_payment', status: 'settled',
        currency, amount, feeAmount: fee, totalDebited: totalDebit, netAmount: amount,
        clientId: clientUid, cardId, developerId: auth.developerId, appId: auth.appId,
        developerName: auth.developer.companyName, appName: auth.app.appName,
        reason, rail: 'market_cash_api', source: 'MHT_APIS',
        cardLast4: cardNumber.slice(-4), cardBalanceAfter, developerBalanceAfter,
        adminVisible: true, createdAt: now, updatedAt: now,
      };
      tx.set(txRef, record);
      tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, cardWalletId: cardWalletRef.id, userId: clientUid, direction: 'debit', amount: totalDebit, currency, entryType: 'client_card_payment', createdAt: now });
      tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, developerWalletId: developerWalletRef.id, developerId: auth.developerId, direction: 'credit', amount, currency, entryType: 'developer_sale', createdAt: now });
      tx.set(db.collection('ledger_entries').doc(), { transactionId: txId, revenueWalletId: revenueRef.id, direction: 'credit', amount: fee, currency, entryType: 'market_cash_fee', createdAt: now });
      tx.set(db.collection('notifications').doc(), { userId: clientUid, title: 'Paiement Market-Cash effectué', message: `${amount} ${currency} payé à ${auth.developer.companyName}. Frais: ${fee} ${currency}. Réf: ${reference}.`, type: 'success', category: 'transaction', transactionId: txId, read: false, createdAt: now });
      tx.set(db.collection('audit_events').doc(), { actorId: auth.developerId, actorType: 'developer_app', action: 'MARKET_CASH_API_CARD_PAYMENT', resourceId: txId, result: 'success', clientId: clientUid, appId: auth.appId, amount, feeAmount: fee, currency, createdAt: now });
      return record;
    });

    res.status(200).json({
      status: 'approved', approved: true, duplicate: Boolean((result as any).duplicate),
      reference: (result as any).reference, externalReference,
      amount, feeAmount: fee, totalDebited: totalDebit, currency,
      developer: auth.developer.companyName, app: auth.app.appName,
    });
  } catch (error: any) {
    const code = String(error?.message || 'INTERNAL_ERROR');
    const status = code === 'UNAUTHORIZED' ? 401 : code === 'DEVELOPER_INACTIVE' ? 403 : 400;
    console.warn('[MARKET_CASH_API_CARD_PAYMENT_DECLINED]', code);
    res.status(status).json({ status: 'declined', approved: false, code });
  }
});
