import { createHash, randomBytes } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const LEGACY_PAYMENT_ENDPOINT = 'https://europe-west1-automarket-fintech.cloudfunctions.net/marketCashApiCardPayment';

type Currency = 'USD' | 'CDF';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const normalize = (value: unknown) => String(value || '').trim();
const normalizeUpper = (value: unknown) => normalize(value).toUpperCase();
const roundMoney = (value: number) => Math.round(value * 100) / 100;
const localCardIdForUid = (uid: string) => `local_${sha256(`local-card:${uid}`).slice(0, 24)}`;
const cardAccountId = (cardId: string, currency: string) => `card_${currency.toLowerCase()}_${cardId}`;
const developerWalletId = (developerId: string, currency: string) => `dev_${currency.toLowerCase()}_${developerId}`;
const revenueWalletId = (currency: string) => `market_cash_revenue_${currency.toLowerCase()}`;

const DEFAULT_FEES = {
  developer_card_payment: { percent: 2.5, minUsd: 0.15, minCdf: 350 },
  developer_card_payment_partner: { percent: 1.5, minUsd: 0.10, minCdf: 250 },
} as const;

function readApiKey(req: any) {
  const authorization = normalize(req.header('authorization'));
  const headerKey = normalize(req.header('x-market-cash-api-key'));
  return authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : headerKey;
}

function parseCurrency(value: unknown): Currency {
  const currency = normalizeUpper(value) as Currency;
  if (currency !== 'USD' && currency !== 'CDF') throw new Error('CURRENCY_INVALID');
  return currency;
}

function parseAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('AMOUNT_INVALID');
  return roundMoney(amount);
}

function parseExternalReference(value: unknown) {
  const reference = normalize(value);
  if (reference.length < 6 || reference.length > 120) throw new Error('REFERENCE_INVALID');
  return reference;
}

function expiryIsCurrent(expiry: string) {
  const match = String(expiry || '').trim().match(/^(\d{2})\/(\d{2})$/);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const expiryBoundary = new Date(Date.UTC(year, month, 1));
  return expiryBoundary.getTime() > now.getTime();
}

async function feeFor(app: any, developer: any, amount: number, currency: Currency) {
  const partnerPricing = developer?.businessType === 'api_provider';
  const action = partnerPricing ? 'developer_card_payment_partner' : 'developer_card_payment';
  const configured = (await db.doc('app_settings/transaction_fees').get()).data()?.[action] || {};
  const defaults = DEFAULT_FEES[action];
  const percent = Number(configured.percent ?? defaults.percent);
  const minimum = currency === 'USD'
    ? Number(configured.minUsd ?? defaults.minUsd)
    : Number(configured.minCdf ?? defaults.minCdf);
  return {
    action,
    partnerPricing,
    fee: roundMoney(Math.max(amount * percent / 100, minimum)),
    appName: String(app?.appName || ''),
  };
}

async function resolveActiveDeveloperApp(apiKey: string) {
  const hash = sha256(apiKey);
  const snapshot = await db.collection('developer_apps').where('apiKeyHash', '==', hash).limit(3).get();
  const active = snapshot.docs.filter((doc) => doc.data()?.status === 'active');
  if (active.length !== 1) throw new Error('UNAUTHORIZED');
  const appDoc = active[0];
  const app = appDoc.data() || {};
  const appId = String(app.appId || appDoc.id).trim().toUpperCase();
  const developerId = String(app.developerId || '').trim();
  if (!appId || !developerId) throw new Error('UNAUTHORIZED');
  const developerDoc = await db.doc(`developer_accounts/${developerId}`).get();
  if (!developerDoc.exists || developerDoc.data()?.status !== 'active') throw new Error('DEVELOPER_INACTIVE');
  return { appId, app, developerId, developer: developerDoc.data() || {} };
}

function normalizeCardReference(value: unknown) {
  const raw = normalize(value);
  if (!raw) return '';
  const native = raw.match(/(?:MARKET-CASH-CARD\s*:\s*)?(MCL-[A-Z0-9_-]{4,120})/i);
  return native?.[1]?.toUpperCase() || '';
}

async function canonicalCardIdentity(cardNumber: string) {
  if (!/^4585020002\d{6}$/.test(cardNumber)) return null;
  const registry = await db.doc(`card_number_registry/${cardNumber}`).get();
  if (!registry.exists) return null;
  const uid = String(registry.data()?.userId || '').trim();
  if (!uid) return null;
  const cardId = localCardIdForUid(uid);
  const cardDoc = await db.doc(`local_cards/${cardId}`).get();
  if (!cardDoc.exists) return null;
  const card = cardDoc.data() || {};
  return {
    uid,
    cardId,
    holder: normalize(card.cardHolder || card.cardHolderName || card.userName || 'CLIENT MARKET-CASH'),
    last4: cardNumber.slice(-4),
    expiry: normalize(card.expiryEnd),
    cardIdentifier: normalizeCardReference(card.cardIdentifier),
    status: String(card.status || ''),
    program: String(card.program || ''),
  };
}

async function resolveCardCapture(cardReference: unknown) {
  const identifier = normalizeCardReference(cardReference);
  if (!identifier) return null;
  const cards = await db.collection('local_cards').where('cardIdentifier', '==', identifier).limit(1).get();
  if (cards.empty) return null;
  const cardDoc = cards.docs[0];
  const card = cardDoc.data() || {};
  if (String(card.program || '') !== 'market_cash_local' || String(card.status || '') !== 'active') return null;
  const cardNumber = normalize(card.cardNumber).replace(/\D/g, '');
  if (!/^4585020002\d{6}$/.test(cardNumber)) return null;
  const cardHolder = normalize(card.cardHolder || card.cardHolderName || card.userName || 'CLIENT MARKET-CASH');
  const expiry = normalize(card.expiryEnd);
  if (!/^\d{2}\/\d{2}$/.test(expiry)) return null;
  return {
    cardId: String(card.cardId || cardDoc.id),
    userId: String(card.userId || ''),
    cardIdentifier: identifier,
    cardNumber,
    cardHolder,
    expiry,
    cardLast4: cardNumber.slice(-4),
  };
}

function createMandateToken() {
  const mandateId = `md_${randomBytes(10).toString('hex')}`;
  const secret = randomBytes(24).toString('hex');
  return { mandateId, secretHash: sha256(secret), token: `mcm_${mandateId}.${secret}` };
}

function parseMandateToken(value: unknown) {
  const token = normalize(value);
  const match = token.match(/^mcm_(md_[a-f0-9]{20})\.([a-f0-9]{48})$/i);
  if (!match) throw new Error('MANDATE_INVALID');
  return { mandateId: match[1].toLowerCase(), secret: match[2].toLowerCase(), token };
}

async function loadMandate(tokenValue: unknown, appId: string) {
  const parsed = parseMandateToken(tokenValue);
  const ref = db.doc(`payment_mandates/${parsed.mandateId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('MANDATE_NOT_FOUND');
  const mandate = snap.data() || {};
  if (mandate.appId !== appId || mandate.secretHash !== sha256(parsed.secret)) throw new Error('MANDATE_INVALID');
  return { ref, mandateId: parsed.mandateId, mandate };
}

async function resolveCardForMandate(body: Record<string, any>, appId: string) {
  const cardReference = normalizeCardReference(body.cardReference);
  if (cardReference) {
    const card = await resolveCardCapture(cardReference);
    if (!card) throw new Error('CARD_REFERENCE_NOT_FOUND');
    const originalExternalReference = normalize(body.originalExternalReference);
    if (originalExternalReference.length < 6 || originalExternalReference.length > 120) throw new Error('REFERENCE_INVALID');
    const originalTxId = `devpay_${sha256(`${appId}:${originalExternalReference}`).slice(0, 36)}`;
    const originalTx = await db.doc(`wallet_transactions/${originalTxId}`).get();
    if (!originalTx.exists || originalTx.data()?.status !== 'settled') throw new Error('ORIGINAL_PAYMENT_NOT_FOUND');
    if (String(originalTx.data()?.appId || '') !== appId || String(originalTx.data()?.cardId || '') !== card.cardId) throw new Error('ORIGINAL_PAYMENT_MISMATCH');
    const createdAt = Number(originalTx.data()?.createdAt || 0);
    if (!createdAt || Date.now() - createdAt > 2 * 60 * 60 * 1000) throw new Error('ORIGINAL_PAYMENT_TOO_OLD');
    if (!expiryIsCurrent(card.expiry)) throw new Error('CARD_EXPIRED');
    return card;
  }

  const cardNumber = normalize(body.cardNumber).replace(/\D/g, '');
  const holder = normalizeUpper(body.cardHolder);
  const expiry = normalize(body.expiry);
  const cvv = normalize(body.cvv);
  if (!/^4585020002\d{6}$/.test(cardNumber)) throw new Error('CARD_INVALID');
  if (!/^\d{3}$/.test(cvv)) throw new Error('CVV_INVALID');
  if (!/^\d{2}\/\d{2}$/.test(expiry)) throw new Error('EXPIRY_INVALID');

  const identity = await canonicalCardIdentity(cardNumber);
  if (!identity) throw new Error('CARD_NOT_FOUND');
  if (identity.status !== 'active' || identity.program !== 'market_cash_local') throw new Error('CARD_INACTIVE');
  if (!identity.cardIdentifier) throw new Error('CARD_REFERENCE_NOT_FOUND');
  if (normalizeUpper(identity.holder) !== holder) throw new Error('HOLDER_MISMATCH');
  if (identity.expiry.replace(/\s/g, '') !== expiry.replace(/\s/g, '')) throw new Error('EXPIRY_MISMATCH');
  if (!expiryIsCurrent(identity.expiry)) throw new Error('CARD_EXPIRED');
  const security = await db.doc(`user_security/${identity.uid}`).get();
  if (security.data()?.localTransactionCvvHash !== sha256(cvv)) throw new Error('CVV_INVALID');
  return {
    cardId: identity.cardId,
    userId: identity.uid,
    cardIdentifier: identity.cardIdentifier,
    cardNumber,
    cardHolder: identity.holder,
    expiry: identity.expiry,
    cardLast4: identity.last4,
  };
}

async function createMandate(params: { appId: string; app: any; developerId: string; body: Record<string, any> }) {
  const card = await resolveCardForMandate(params.body, params.appId);
  const token = createMandateToken();
  const recurringAllowed = params.body.allowRecurring === true;
  const consentVersion = normalize(params.body.consentVersion || 'billing-v1').slice(0, 80);
  const now = Date.now();
  await db.doc(`payment_mandates/${token.mandateId}`).set({
    mandateId: token.mandateId,
    secretHash: token.secretHash,
    appId: params.appId,
    developerId: params.developerId,
    clientId: card.userId,
    cardId: card.cardId,
    cardIdentifier: card.cardIdentifier,
    cardLast4: card.cardLast4,
    cardHolder: card.cardHolder,
    expiry: card.expiry,
    status: 'active',
    recurringAllowed,
    consentVersion,
    consentSource: 'developer_app',
    consentAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await db.collection('audit_events').add({
    actorId: params.developerId || params.appId,
    actorType: 'developer_app',
    action: 'MARKET_CASH_PAYMENT_MANDATE_CREATED',
    resourceId: token.mandateId,
    appId: params.appId,
    cardLast4: card.cardLast4,
    recurringAllowed,
    createdAt: now,
  }).catch(() => undefined);
  return {
    status: 'created',
    mandateCreated: true,
    mandateId: token.mandateId,
    mandateToken: token.token,
    cardReference: card.cardIdentifier,
    cardLast4: card.cardLast4,
    cardHolder: card.cardHolder,
    expiry: card.expiry,
    recurringAllowed,
  };
}

async function updateMandateConsent(params: { appId: string; developerId: string; body: Record<string, any> }) {
  const loaded = await loadMandate(params.body.mandateToken, params.appId);
  if (loaded.mandate.status !== 'active') throw new Error('MANDATE_INACTIVE');
  const recurringAllowed = params.body.allowRecurring === true;
  const now = Date.now();
  await loaded.ref.set({
    recurringAllowed,
    consentVersion: normalize(params.body.consentVersion || loaded.mandate.consentVersion || 'billing-v1').slice(0, 80),
    consentAt: now,
    updatedAt: now,
  }, { merge: true });
  await db.collection('audit_events').add({
    actorId: params.developerId || params.appId,
    actorType: 'developer_app',
    action: recurringAllowed ? 'MARKET_CASH_RECURRING_CONSENT_ENABLED' : 'MARKET_CASH_RECURRING_CONSENT_DISABLED',
    resourceId: loaded.mandateId,
    appId: params.appId,
    cardLast4: loaded.mandate.cardLast4,
    createdAt: now,
  }).catch(() => undefined);
  return { status: 'updated', mandateId: loaded.mandateId, recurringAllowed };
}

async function revokeMandate(params: { appId: string; developerId: string; body: Record<string, any> }) {
  const loaded = await loadMandate(params.body.mandateToken, params.appId);
  const now = Date.now();
  await loaded.ref.set({ status: 'revoked', recurringAllowed: false, revokedAt: now, updatedAt: now }, { merge: true });
  await db.collection('audit_events').add({
    actorId: params.developerId || params.appId,
    actorType: 'developer_app',
    action: 'MARKET_CASH_PAYMENT_MANDATE_REVOKED',
    resourceId: loaded.mandateId,
    appId: params.appId,
    cardLast4: loaded.mandate.cardLast4,
    createdAt: now,
  }).catch(() => undefined);
  return { status: 'revoked', mandateId: loaded.mandateId };
}

async function chargeMandate(params: { appId: string; app: any; developerId: string; developer: any; body: Record<string, any> }) {
  const loaded = await loadMandate(params.body.mandateToken, params.appId);
  if (loaded.mandate.status !== 'active') throw new Error('MANDATE_INACTIVE');
  if (loaded.mandate.recurringAllowed !== true) throw new Error('RECURRING_NOT_AUTHORIZED');

  const currency = parseCurrency(params.body.currency);
  const amount = parseAmount(params.body.amount);
  const externalReference = parseExternalReference(params.body.externalReference);
  const reason = normalize(params.body.reason || `Paiement automatique ${params.app.appName}`);
  const feeData = await feeFor(params.app, params.developer, amount, currency);
  const totalDebit = roundMoney(amount + feeData.fee);
  const txId = `devpay_${sha256(`${params.appId}:${externalReference}`).slice(0, 36)}`;
  const txRef = db.doc(`wallet_transactions/${txId}`);
  const cardRef = db.doc(`local_cards/${loaded.mandate.cardId}`);
  const cardWalletRef = db.doc(`card_wallet_accounts/${cardAccountId(loaded.mandate.cardId, currency)}`);
  const developerWalletRef = db.doc(`developer_wallet_accounts/${developerWalletId(params.developerId, currency)}`);
  const revenueRef = db.doc(`platform_revenue_accounts/${revenueWalletId(currency)}`);

  return db.runTransaction(async tx => {
    const [existing, mandateSnap, cardSnap, cardWallet, developerWallet, revenue] = await Promise.all([
      tx.get(txRef), tx.get(loaded.ref), tx.get(cardRef), tx.get(cardWalletRef), tx.get(developerWalletRef), tx.get(revenueRef),
    ]);
    if (existing.exists) {
      const data = existing.data() || {};
      if (data.status !== 'settled') throw new Error('PAYMENT_CONFLICT');
      return {
        approved: true,
        status: 'approved',
        duplicate: true,
        reference: data.reference,
        externalReference,
        amount: Number(data.amount || amount),
        currency,
        feeAmount: Number(data.feeAmount || 0),
        totalDebited: Number(data.totalDebited || amount),
        cardBalanceAfter: Number(data.cardBalanceAfter || data.balanceAfter || 0),
      };
    }
    const currentMandate = mandateSnap.data() || {};
    if (currentMandate.status !== 'active' || currentMandate.recurringAllowed !== true) throw new Error('MANDATE_INACTIVE');
    if (!cardSnap.exists || cardSnap.data()?.status !== 'active') throw new Error('CARD_INACTIVE');
    const card = cardSnap.data() || {};
    const currentIdentifier = normalizeCardReference(card.cardIdentifier);
    if (!currentIdentifier || currentIdentifier !== currentMandate.cardIdentifier) throw new Error('CARD_INVALID');
    const expiry = normalize(card.expiryEnd);
    if (!expiryIsCurrent(expiry)) throw new Error('CARD_EXPIRED');
    if (expiry.replace(/\s/g, '') !== String(currentMandate.expiry || '').replace(/\s/g, '')) throw new Error('EXPIRY_MISMATCH');
    if (!cardWallet.exists || cardWallet.data()?.status !== 'active') throw new Error('CARD_ACCOUNT_INACTIVE');
    if (!developerWallet.exists || developerWallet.data()?.status !== 'active') throw new Error('DEVELOPER_WALLET_INACTIVE');

    const cardBalance = Number(cardWallet.data()?.availableBalance || 0);
    if (cardBalance < totalDebit) throw new Error('INSUFFICIENT_FUNDS');
    const developerBalance = Number(developerWallet.data()?.availableBalance || 0);
    const revenueBalance = Number(revenue.data()?.availableBalance || 0);
    const now = Date.now();
    const reference = `MC-REC-${now}-${randomBytes(3).toString('hex').toUpperCase()}`;
    const cardBalanceAfter = roundMoney(cardBalance - totalDebit);
    const developerBalanceAfter = roundMoney(developerBalance + amount);
    const revenueAfter = roundMoney(revenueBalance + feeData.fee);

    tx.update(cardWalletRef, {
      availableBalance: cardBalanceAfter,
      ledgerBalance: roundMoney(Number(cardWallet.data()?.ledgerBalance || cardBalance) - totalDebit),
      updatedAt: now,
    });
    tx.update(developerWalletRef, {
      availableBalance: developerBalanceAfter,
      ledgerBalance: roundMoney(Number(developerWallet.data()?.ledgerBalance || developerBalance) + amount),
      updatedAt: now,
    });
    tx.set(revenueRef, {
      id: revenueRef.id,
      currency,
      availableBalance: revenueAfter,
      ledgerBalance: revenueAfter,
      updatedAt: now,
      createdAt: revenue.data()?.createdAt || now,
    }, { merge: true });

    const record = {
      id: txId,
      reference,
      externalReference,
      type: 'developer_card_payment',
      status: 'settled',
      currency,
      amount,
      feeAmount: feeData.fee,
      totalDebited: totalDebit,
      netAmount: amount,
      clientId: currentMandate.clientId,
      userId: currentMandate.clientId,
      userIds: [currentMandate.clientId],
      cardId: currentMandate.cardId,
      developerId: params.developerId,
      appId: params.appId,
      developerName: String(params.developer.companyName || params.app.appName || 'Application partenaire'),
      appName: String(params.app.appName || ''),
      reason,
      rail: 'market_cash_api',
      source: 'MARKET_CASH_RECURRING',
      recurring: true,
      storedCredential: true,
      mandateId: loaded.mandateId,
      pricingTier: feeData.partnerPricing ? 'wholesale' : 'direct',
      feeAction: feeData.action,
      cardLast4: currentMandate.cardLast4,
      balanceBefore: cardBalance,
      balanceAfter: cardBalanceAfter,
      cardBalanceBefore: cardBalance,
      cardBalanceAfter,
      developerBalanceAfter,
      adminVisible: true,
      createdAt: now,
      updatedAt: now,
    };
    tx.set(txRef, record);
    tx.update(loaded.ref, { lastUsedAt: now, updatedAt: now });
    tx.set(db.collection('ledger_entries').doc(), {
      transactionId: txId,
      cardWalletId: cardWalletRef.id,
      userId: currentMandate.clientId,
      direction: 'debit',
      amount: totalDebit,
      currency,
      entryType: 'client_card_recurring_payment',
      createdAt: now,
    });
    tx.set(db.collection('ledger_entries').doc(), {
      transactionId: txId,
      developerWalletId: developerWalletRef.id,
      developerId: params.developerId,
      direction: 'credit',
      amount,
      currency,
      entryType: 'developer_recurring_sale',
      createdAt: now,
    });
    tx.set(db.collection('ledger_entries').doc(), {
      transactionId: txId,
      revenueWalletId: revenueRef.id,
      direction: 'credit',
      amount: feeData.fee,
      currency,
      entryType: 'market_cash_fee',
      createdAt: now,
    });
    tx.set(db.collection('notifications').doc(), {
      userId: currentMandate.clientId,
      title: 'Paiement automatique Market-Cash',
      message: `${amount} ${currency} payé automatiquement à ${String(params.developer.companyName || params.app.appName || 'Application partenaire')}. Frais: ${feeData.fee} ${currency}. Réf: ${reference}.`,
      type: 'success',
      category: 'transaction',
      transactionId: txId,
      read: false,
      createdAt: now,
    });
    tx.set(db.collection('audit_events').doc(), {
      actorId: params.developerId || params.appId,
      actorType: 'developer_app',
      action: 'MARKET_CASH_RECURRING_PAYMENT',
      resourceId: txId,
      result: 'success',
      clientId: currentMandate.clientId,
      appId: params.appId,
      mandateId: loaded.mandateId,
      amount,
      feeAmount: feeData.fee,
      currency,
      createdAt: now,
    });

    return {
      approved: true,
      status: 'approved',
      duplicate: false,
      reference,
      externalReference,
      amount,
      currency,
      feeAmount: feeData.fee,
      totalDebited: totalDebit,
      cardBalanceAfter,
    };
  });
}

const failureLabel=(code:string)=>({INSUFFICIENT_FUNDS:'Solde insuffisant',CARD_INVALID:'Carte invalide',CARD_NOT_FOUND:'Carte introuvable',CARD_INACTIVE:'Carte inactive',CARD_ACCOUNT_INACTIVE:'Compte carte inactif',CVV_INVALID:'Code de sécurité incorrect',EXPIRY_INVALID:'Date d’expiration invalide',EXPIRY_MISMATCH:'Date d’expiration incorrecte',CARD_EXPIRED:'Carte expirée',DEVELOPER_WALLET_INACTIVE:'Compte bénéficiaire indisponible',MANDATE_INVALID:'Autorisation de paiement invalide',MANDATE_INACTIVE:'Autorisation de paiement inactive',RECURRING_NOT_AUTHORIZED:'Paiement automatique non autorisé'} as Record<string,string>)[code]||'Paiement refusé';

async function recordPaymentOutcome(params:{appId:string;app:any;body:Record<string,any>;identity:any;payload:any;approved:boolean}){
  const {appId,app,body,identity,payload,approved}=params;
  if(!identity?.uid)return;
  const externalReference=normalize(body.externalReference);
  if(!externalReference)return;
  const currency=String(body.currency||'USD').toUpperCase()==='CDF'?'CDF':'USD';
  const amount=Number(body.amount||0);
  const canonicalTxId=`devpay_${sha256(`${appId}:${externalReference}`).slice(0,36)}`;
  const now=Date.now();

  if(approved){
    const ref=db.doc(`wallet_transactions/${canonicalTxId}`);
    const snap=await ref.get();
    if(!snap.exists)return;
    const current=snap.data()||{};
    const userIds=Array.from(new Set([...(Array.isArray(current.userIds)?current.userIds:[]),identity.uid]));
    await ref.set({userIds,balanceAfter:current.balanceAfter??current.cardBalanceAfter,updatedAt:Number(current.updatedAt||now)},{merge:true});
    return;
  }

  const code=String(payload?.code||'MARKET_CASH_PAYMENT_DECLINED');
  const failureId=`devfail_${sha256(`${appId}:${externalReference}`).slice(0,36)}`;
  const wallet=await db.doc(`card_wallet_accounts/${cardAccountId(identity.cardId,currency)}`).get();
  const balance=Number(wallet.data()?.availableBalance||0);
  const developerId=String(app.developerId||'');
  const developer=developerId?await db.doc(`developer_accounts/${developerId}`).get():null;
  const developerName=String(developer?.data()?.companyName||app.appName||'Application partenaire');
  const message=`${amount} ${currency} chez ${developerName} : ${failureLabel(code)}. Aucun débit effectué. Solde carte : ${currency==='CDF'?balance.toLocaleString('fr-FR',{maximumFractionDigits:0}):balance.toFixed(2)} ${currency}.`;
  const record={id:failureId,attemptOf:canonicalTxId,externalReference,type:'developer_card_payment',status:'failed',failureCode:code,currency,amount,clientId:identity.uid,userId:identity.uid,userIds:[identity.uid],cardId:identity.cardId,cardLast4:identity.last4,developerId,appId,developerName,appName:String(app.appName||''),reason:normalize(body.reason),rail:'market_cash_api',source:'API_KEY',balanceBefore:balance,balanceAfter:balance,cardBalanceBefore:balance,cardBalanceAfter:balance,adminVisible:true,createdAt:now,updatedAt:now};
  const batch=db.batch();
  batch.set(db.doc(`wallet_transactions/${failureId}`),record,{merge:true});
  batch.set(db.doc(`notifications/payment_${failureId}`),{userId:identity.uid,title:'Paiement Market-Cash refusé',message,type:'error',category:'transaction',transactionId:failureId,read:false,createdAt:now},{merge:true});
  batch.set(db.doc(`audit_events/payment_${failureId}`),{actorId:developerId||appId,actorType:'developer_app',action:'MARKET_CASH_API_CARD_PAYMENT',resourceId:failureId,result:'failed',failureCode:code,clientId:identity.uid,appId,amount,currency,createdAt:now},{merge:true});
  await batch.commit();
}

function statusForError(code: string) {
  if (code === 'UNAUTHORIZED') return 401;
  if (code === 'DEVELOPER_INACTIVE') return 403;
  if (code === 'MANDATE_NOT_FOUND' || code === 'CARD_REFERENCE_NOT_FOUND' || code === 'ORIGINAL_PAYMENT_NOT_FOUND') return 404;
  if (code === 'RECURRING_NOT_AUTHORIZED') return 403;
  if (['INSUFFICIENT_FUNDS','CARD_INACTIVE','CARD_ACCOUNT_INACTIVE','CARD_EXPIRED','DEVELOPER_WALLET_INACTIVE','MANDATE_INACTIVE'].includes(code)) return 402;
  if (['CURRENCY_INVALID','AMOUNT_INVALID','REFERENCE_INVALID','CARD_INVALID','CVV_INVALID','EXPIRY_INVALID','EXPIRY_MISMATCH','HOLDER_MISMATCH','MANDATE_INVALID','ORIGINAL_PAYMENT_MISMATCH','ORIGINAL_PAYMENT_TOO_OLD'].includes(code)) return 400;
  return 500;
}

export const marketCashApiCardPaymentByKey = onRequest({ region: REGION }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {res.status(405).json({ status: 'error', approved: false, code: 'METHOD_NOT_ALLOWED' });return;}

  try {
    const apiKey = readApiKey(req);
    if (!apiKey) throw new Error('UNAUTHORIZED');
    const {appId,app,developerId,developer}=await resolveActiveDeveloperApp(apiKey);
    const body = { ...(req.body || {}) } as Record<string, any>;
    const operation = String(body.operation || '').trim();

    if (operation === 'resolve-card') {
      const card = await resolveCardCapture(body.cardReference);
      if (!card) {
        res.status(404).json({ status: 'error', resolved: false, code: 'CARD_REFERENCE_NOT_FOUND' });
        return;
      }
      await db.collection('audit_events').add({
        actorId: developerId || appId,
        actorType: 'developer_app',
        action: 'MARKET_CASH_CARD_REFERENCE_RESOLVED',
        resourceId: card.cardId,
        appId,
        cardLast4: card.cardLast4,
        createdAt: Date.now(),
      }).catch(() => undefined);
      res.status(200).json({
        status: 'resolved',
        resolved: true,
        cardNumber: card.cardNumber,
        cardHolder: card.cardHolder,
        expiry: card.expiry,
        cardLast4: card.cardLast4,
      });
      return;
    }

    if (operation === 'create-mandate') {
      const result = await createMandate({ appId, app, developerId, body });
      res.status(200).json(result);
      return;
    }

    if (operation === 'update-mandate-consent') {
      const result = await updateMandateConsent({ appId, developerId, body });
      res.status(200).json(result);
      return;
    }

    if (operation === 'revoke-mandate') {
      const result = await revokeMandate({ appId, developerId, body });
      res.status(200).json(result);
      return;
    }

    if (operation === 'charge-mandate') {
      const result = await chargeMandate({ appId, app, developerId, developer, body });
      res.status(200).json(result);
      return;
    }

    const cardNumber = normalize(body.cardNumber).replace(/\D/g, '');
    const identity = await canonicalCardIdentity(cardNumber);
    if (identity?.holder) body.cardHolder = identity.holder;

    const upstream = await fetch(LEGACY_PAYMENT_ENDPOINT, {
      method: 'POST',
      headers: {Authorization: `Bearer ${apiKey}`,'x-market-cash-app-id': appId,'Content-Type': 'application/json',Accept: 'application/json','User-Agent': 'market-cash/api-key-bridge'},
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let payload:any={};
    let parsedPayload=false;
    try{payload=JSON.parse(text);parsedPayload=true}catch{payload={}}
    const approved=upstream.ok&&payload?.approved===true&&payload?.status==='approved';
    await recordPaymentOutcome({appId,app,body,identity,payload,approved}).catch(error=>console.warn('[MARKET_CASH_PAYMENT_OUTCOME_AUDIT_ERROR]',String((error as any)?.message||error)));

    if (approved && identity?.cardIdentifier) {
      res.status(upstream.status).json({
        ...payload,
        cardReference: identity.cardIdentifier,
        cardLast4: identity.last4,
        cardHolder: identity.holder,
        expiry: identity.expiry,
      });
      return;
    }

    if (parsedPayload) {
      res.status(upstream.status).json(payload);
      return;
    }
    const contentType = upstream.headers.get('content-type') || 'text/plain; charset=utf-8';
    res.status(upstream.status);res.set('Content-Type', contentType);res.send(text);
  } catch (error: any) {
    const code = String(error?.message || 'INTERNAL_ERROR');
    const status = statusForError(code);
    console.warn('[MARKET_CASH_API_KEY_BRIDGE_ERROR]', code);
    res.status(status).json({ status: 'declined', approved: false, code, message: failureLabel(code) });
  }
});
