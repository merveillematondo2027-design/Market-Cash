import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const PARSE_VERSION = 2;

type PaymentProvider = 'MPESA' | 'AIRTEL_MONEY' | 'ORANGE_MONEY' | 'AFRIMONEY' | 'UNKNOWN';
type Currency = 'USD' | 'CDF' | 'UNKNOWN';

const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const normalizePhone = (value: unknown) => {
  let phone = clean(value).replace(/[^0-9+]/g, '');
  if (phone.startsWith('00243')) phone = `+${phone.slice(2)}`;
  if (phone.startsWith('243')) phone = `+${phone}`;
  if (phone.startsWith('0') && phone.length >= 10) phone = `+243${phone.slice(1)}`;
  return phone;
};

async function requireAdmin(request: any) {
  const uid = clean(request.auth?.uid);
  if (!uid) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists || snap.data()?.role !== 'admin_general') {
    throw new HttpsError('permission-denied', 'Administrateur général requis.');
  }
  return uid;
}

function detectProvider(sender: string, body: string): PaymentProvider {
  const source = `${sender} ${body}`.toLowerCase().replace(/[._]/g, ' ');
  if (/m\s*[- ]?\s*pesa|mpesa|vodacom(?:\s*-?\s*rdc)?|m-pesa/.test(source)) return 'MPESA';
  if (/airtel\s*(?:money)?|airtelmoney/.test(source)) return 'AIRTEL_MONEY';
  if (/orange\s*(?:money)?|orangemoney/.test(source)) return 'ORANGE_MONEY';
  if (/afri\s*money|afrimoney|africell/.test(source)) return 'AFRIMONEY';
  return 'UNKNOWN';
}

function parseCurrency(body: string): Currency {
  if (/\bUSD\b|US\s*\$|\$\s*US|\$/i.test(body)) return 'USD';
  if (/\bCDF\b|\bFC\b|\bFCFA\b|FRANCS?\s+(?:CONGOLAIS|CONGOLAIS(?:ES)?)|\bFRANCS?\b/i.test(body)) return 'CDF';
  return 'UNKNOWN';
}

function parseNumber(value: string): number | null {
  let text = value.trim().replace(/[’']/g, '').replace(/\s+/g, '');
  if (!text) return null;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const decimals = text.length - lastComma - 1;
    text = decimals === 1 || decimals === 2 ? text.replace(',', '.') : text.replace(/,/g, '');
  } else if ((text.match(/\./g) || []).length > 1) {
    const parts = text.split('.');
    const last = parts.pop() || '';
    text = last.length <= 2 ? `${parts.join('')}.${last}` : `${parts.join('')}${last}`;
  }
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function parseAmount(body: string): number | null {
  const patterns = [
    /(?:montant|amount|somme|valeur)\s*[:=\-]?\s*(?:USD|US\s*\$|\$|CDF|FC)?\s*([0-9][0-9 .,'’]*)/i,
    /(?:vous\s+avez\s+re[cç]u|vous\s+avez\s+recu|re[cç]u|recu|received|cr[eé]dit[eé]|credited)\D{0,30}(?:USD|US\s*\$|\$|CDF|FC)?\s*([0-9][0-9 .,'’]*)/i,
    /(?:USD|US\s*\$|\$|CDF|FC)\s*([0-9][0-9 .,'’]*)/i,
    /([0-9][0-9 .,'’]*)\s*(?:USD|US\s*\$|\$|CDF|FC)\b/i,
  ];
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (!match?.[1]) continue;
    const amount = parseNumber(match[1]);
    if (amount !== null) return amount;
  }
  return null;
}

function parsePhone(body: string): string {
  const contextual = body.match(/(?:de|from|par|exp[eé]diteur|sender|num[eé]ro|numero|t[eé]l[eé]phone|telephone)\s*[:=\-]?\s*((?:\+|00)?243[0-9\s-]{8,14}|0(?:8|9)[0-9\s-]{8,12})/i);
  if (contextual?.[1]) return normalizePhone(contextual[1]);
  const international = body.match(/(?:\+|00)?243[0-9][0-9\s-]{7,12}/);
  if (international?.[0]) return normalizePhone(international[0]);
  const local = body.match(/\b0(?:8|9)[0-9][0-9\s-]{7,10}\b/);
  return local?.[0] ? normalizePhone(local[0]) : '';
}

function parseTransactionId(body: string): string {
  const labelled = body.match(/(?:transaction(?:\s*id)?|trans(?:action)?\s*id|reference|r[eé]f[eé]rence|ref|r[eé]f|trx|txid|code)\s*[:#=\-]?\s*([A-Z0-9][A-Z0-9_\-/]{4,39})/i);
  if (labelled?.[1]) return upper(labelled[1]).replace(/[.,;:]$/, '');
  const candidates = body.match(/\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{8,24}\b/gi) || [];
  const token = candidates.find(value => !/^243\d+$/.test(value) && !/^0[89]\d+$/.test(value));
  return token ? upper(token) : '';
}

function looksLikeOutgoingPayment(body: string) {
  return /vous\s+avez\s+(?:envoy[eé]|transf[eé]r[eé]|pay[eé])|you\s+(?:sent|paid|transferred)|paiement\s+(?:effectu[eé]|envoy[eé])|transfert\s+(?:effectu[eé]|envoy[eé])/i.test(body);
}

function looksLikeIncomingPayment(body: string) {
  if (looksLikeOutgoingPayment(body)) return false;
  return /vous\s+avez\s+re[cç]u|vous\s+avez\s+recu|you\s+have\s+received|received\s+(?:from|payment)|paiement\s+re[cç]u|paiement\s+recu|payment\s+received|d[eé]p[oô]t\s+re[cç]u|depot\s+recu|cr[eé]dit[eé]|credited|votre\s+compte\s+a\s+[eé]t[eé]\s+cr[eé]dit[eé]/i.test(body);
}

function parseSms(senderAddress: string, rawBody: string) {
  const provider = detectProvider(senderAddress, rawBody);
  const amount = parseAmount(rawBody);
  const currency = parseCurrency(rawBody);
  const customerPhone = parsePhone(rawBody);
  const transactionId = parseTransactionId(rawBody);
  const incoming = looksLikeIncomingPayment(rawBody);
  const completeCore = provider !== 'UNKNOWN' && amount !== null && currency !== 'UNKNOWN' && incoming;
  let confidence = 0;
  if (provider !== 'UNKNOWN') confidence += 25;
  if (amount !== null) confidence += 25;
  if (currency !== 'UNKNOWN') confidence += 15;
  if (incoming) confidence += 20;
  if (customerPhone) confidence += 8;
  if (transactionId) confidence += 7;
  const missing: string[] = [];
  if (provider === 'UNKNOWN') missing.push('provider');
  if (amount === null) missing.push('amount');
  if (currency === 'UNKNOWN') missing.push('currency');
  if (!incoming) missing.push('incoming_direction');
  if (!customerPhone) missing.push('customerPhone');
  if (!transactionId) missing.push('transactionId');
  return {
    provider,
    amount,
    currency,
    customerPhone,
    transactionId,
    direction: incoming ? 'incoming' : 'unknown',
    parseStatus: completeCore ? 'ready' : 'review',
    parseConfidence: confidence,
    parseMissing: missing,
    parseVersion: PARSE_VERSION,
  };
}

export const paymentBridgeIngestSms = onCall({ region: REGION }, async request => {
  const actorId = await requireAdmin(request);
  const senderAddress = clean(request.data?.senderAddress).slice(0, 120);
  const rawBody = clean(request.data?.body).slice(0, 4000);
  const deviceId = clean(request.data?.deviceId).slice(0, 120) || 'market-cash-admin';
  const simSlot = Number(request.data?.simSlot ?? -1);
  const subscriptionId = Number(request.data?.subscriptionId ?? -1);
  const receivedAtInput = Number(request.data?.receivedAt || Date.now());
  const receivedAt = Number.isFinite(receivedAtInput) ? receivedAtInput : Date.now();

  if (!senderAddress || !rawBody) throw new HttpsError('invalid-argument', 'Expéditeur et contenu SMS requis.');

  const parsed = parseSms(senderAddress, rawBody);
  const fingerprint = sha256(`${deviceId}|${senderAddress}|${rawBody}|${receivedAt}`).slice(0, 40);
  const ref = db.doc(`payment_sms_events/${fingerprint}`);
  const existing = await ref.get();
  if (existing.exists) return { ok: true, duplicate: true, eventId: ref.id, event: existing.data() };

  const now = Date.now();
  const event = {
    source: 'android_sms_bridge',
    deviceId,
    senderAddress,
    rawBody,
    rawBodyHash: sha256(rawBody),
    simSlot: Number.isFinite(simSlot) ? simSlot : -1,
    subscriptionId: Number.isFinite(subscriptionId) ? subscriptionId : -1,
    receivedAt,
    createdAt: now,
    ingestedBy: actorId,
    consumed: false,
    status: parsed.parseStatus === 'ready' ? 'received' : 'review',
    ...parsed,
  };

  await ref.create(event);
  await db.collection('audit_events').add({
    actorId,
    action: 'PAYMENT_SMS_INGESTED',
    result: 'success',
    metadata: { eventId: ref.id, provider: parsed.provider, parseStatus: parsed.parseStatus, parseConfidence: parsed.parseConfidence, deviceId },
    createdAt: now,
  });
  return { ok: true, duplicate: false, eventId: ref.id, event };
});

export const adminReparsePaymentSms = onCall({ region: REGION }, async request => {
  const actorId = await requireAdmin(request);
  const requestedLimit = Math.max(1, Math.min(500, Number(request.data?.limit || 500)));
  const snap = await db.collection('payment_sms_events').orderBy('receivedAt', 'desc').limit(requestedLimit).get();
  let scanned = 0;
  let updated = 0;
  let ready = 0;
  let review = 0;
  let batch = db.batch();
  let operations = 0;
  const commitBatch = async () => {
    if (!operations) return;
    await batch.commit();
    batch = db.batch();
    operations = 0;
  };
  for (const doc of snap.docs) {
    const data = doc.data();
    const rawBody = clean(data.rawBody);
    if (!rawBody) continue;
    scanned += 1;
    const parsed = parseSms(clean(data.senderAddress), rawBody);
    if (parsed.parseStatus === 'ready') ready += 1; else review += 1;
    batch.update(doc.ref, {
      ...parsed,
      status: data.consumed ? 'consumed' : parsed.parseStatus === 'ready' ? 'received' : 'review',
      reparsedAt: Date.now(),
      updatedAt: Date.now(),
    });
    updated += 1;
    operations += 1;
    if (operations >= 400) await commitBatch();
  }
  await commitBatch();
  await db.collection('audit_events').add({ actorId, action: 'PAYMENT_SMS_REPARSED', result: 'success', metadata: { scanned, updated, ready, review, parseVersion: PARSE_VERSION }, createdAt: Date.now() });
  return { ok: true, scanned, updated, ready, review, parseVersion: PARSE_VERSION };
});

export const adminVerifyPaymentEvidence = onCall({ region: REGION }, async request => {
  const actorId = await requireAdmin(request);
  const transactionId = upper(request.data?.transactionId).slice(0, 80);
  const provider = upper(request.data?.provider).slice(0, 40);
  const currency = upper(request.data?.currency).slice(0, 10);
  const customerPhone = normalizePhone(request.data?.customerPhone);
  const amountInput = request.data?.amount;
  const amount = amountInput === '' || amountInput == null ? null : Number(amountInput);

  if (!transactionId && amount == null && !customerPhone) {
    throw new HttpsError('invalid-argument', 'Ajoutez au moins une référence, un montant ou un numéro client.');
  }

  const snap = transactionId
    ? await db.collection('payment_sms_events').where('transactionId', '==', transactionId).limit(20).get()
    : await db.collection('payment_sms_events').orderBy('receivedAt', 'desc').limit(200).get();

  const now = Date.now();
  const candidates = snap.docs.map(doc => {
    const data = doc.data();
    let score = 0;
    const checks: Record<string, boolean | null> = {
      transactionId: transactionId ? upper(data.transactionId) === transactionId : null,
      amount: amount != null && Number.isFinite(amount) ? Math.abs(Number(data.amount) - amount) < 0.000001 : null,
      currency: currency ? upper(data.currency) === currency : null,
      customerPhone: customerPhone ? normalizePhone(data.customerPhone) === customerPhone : null,
      provider: provider ? upper(data.provider) === provider : null,
      notConsumed: !Boolean(data.consumed),
      recent: Math.abs(now - Number(data.receivedAt || 0)) <= 7 * 24 * 60 * 60 * 1000,
    };
    if (checks.transactionId === true) score += 45;
    if (checks.amount === true) score += 20;
    if (checks.currency === true) score += 10;
    if (checks.customerPhone === true) score += 10;
    if (checks.provider === true) score += 5;
    if (checks.notConsumed === true) score += 5;
    if (checks.recent === true) score += 5;
    return { id: doc.id, ...data, score, checks };
  }).filter(candidate => {
    if (transactionId && candidate.checks.transactionId !== true) return false;
    if (amount != null && Number.isFinite(amount) && candidate.checks.amount !== true) return false;
    if (currency && candidate.checks.currency !== true) return false;
    if (customerPhone && candidate.checks.customerPhone !== true) return false;
    if (provider && candidate.checks.provider !== true) return false;
    return true;
  }).sort((a, b) => b.score - a.score).slice(0, 5);

  const best = candidates[0] || null;
  const verified = Boolean(best && best.checks.notConsumed === true && best.score >= (transactionId ? 80 : 50));
  await db.collection('audit_events').add({
    actorId,
    action: 'PAYMENT_SMS_VERIFICATION',
    result: verified ? 'success' : 'not_found',
    metadata: { transactionId: transactionId || null, amount, currency: currency || null, customerPhone: customerPhone || null, provider: provider || null, bestEventId: best?.id || null },
    createdAt: now,
  });
  return { verified, best, candidates };
});

export const adminConsumePaymentEvent = onCall({ region: REGION }, async request => {
  const actorId = await requireAdmin(request);
  const eventId = clean(request.data?.eventId);
  const orderId = clean(request.data?.orderId).slice(0, 120);
  const userId = clean(request.data?.userId).slice(0, 128);
  if (!eventId || !orderId) throw new HttpsError('invalid-argument', 'Événement et commande requis.');

  const ref = db.doc(`payment_sms_events/${eventId}`);
  const now = Date.now();
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Paiement SMS introuvable.');
    if (snap.data()?.consumed) throw new HttpsError('already-exists', 'Cette transaction a déjà été utilisée.');
    tx.update(ref, {
      consumed: true,
      status: 'consumed',
      consumedAt: now,
      consumedBy: actorId,
      matchedOrderId: orderId,
      matchedUserId: userId || null,
      updatedAt: now,
    });
  });
  await db.collection('audit_events').add({ actorId, targetUserId: userId || null, action: 'PAYMENT_SMS_CONSUMED', result: 'success', metadata: { eventId, orderId }, createdAt: now });
  return { ok: true, eventId, orderId };
});
