import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';

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
  const source = `${sender} ${body}`.toLowerCase();
  if (/m[- ]?pesa|mpesa|vodacom/.test(source)) return 'MPESA';
  if (/airtel\s*money|airtel/.test(source)) return 'AIRTEL_MONEY';
  if (/orange\s*money|orange/.test(source)) return 'ORANGE_MONEY';
  if (/afrimoney|africell/.test(source)) return 'AFRIMONEY';
  return 'UNKNOWN';
}

function parseCurrency(body: string): Currency {
  if (/\bUSD\b|US\$|\$/i.test(body)) return 'USD';
  if (/\bCDF\b|\bFC\b|FRANCS?\s+CONGOLAIS/i.test(body)) return 'CDF';
  return 'UNKNOWN';
}

function parseAmount(body: string): number | null {
  const patterns = [
    /(?:USD|US\$|\$)\s*([0-9][0-9 .,'’]*)/i,
    /([0-9][0-9 .,'’]*)\s*(?:USD|US\$|\$|CDF|FC)\b/i,
    /(?:montant|amount)\s*[:=-]?\s*([0-9][0-9 .,'’]*)/i,
  ];
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (!match?.[1]) continue;
    const normalized = match[1]
      .replace(/[ '’]/g, '')
      .replace(/,(?=\d{1,2}\b)/, '.')
      .replace(/,/g, '');
    const amount = Number(normalized);
    if (Number.isFinite(amount) && amount >= 0) return amount;
  }
  return null;
}

function parsePhone(body: string): string {
  const international = body.match(/(?:\+|00)?243[0-9][0-9\s-]{7,12}/);
  if (international?.[0]) return normalizePhone(international[0]);
  const local = body.match(/\b0(?:8|9)[0-9][0-9\s-]{7,10}\b/);
  return local?.[0] ? normalizePhone(local[0]) : '';
}

function parseTransactionId(body: string): string {
  const labelled = body.match(/(?:transaction|trans(?:action)?\s*id|reference|référence|ref(?:erence)?|id)\s*[:#=-]?\s*([A-Z0-9_-]{5,40})/i);
  if (labelled?.[1]) return upper(labelled[1]);
  const token = body.match(/\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{8,24}\b/i);
  return token?.[0] ? upper(token[0]) : '';
}

function looksLikeIncomingPayment(body: string) {
  return /vous avez re[cç]u|you have received|received|paiement re[cç]u|payment received|cr[eé]dit[eé]|credited/i.test(body);
}

function parseSms(senderAddress: string, rawBody: string) {
  const provider = detectProvider(senderAddress, rawBody);
  const amount = parseAmount(rawBody);
  const currency = parseCurrency(rawBody);
  const customerPhone = parsePhone(rawBody);
  const transactionId = parseTransactionId(rawBody);
  const incoming = looksLikeIncomingPayment(rawBody);
  const parsed = provider !== 'UNKNOWN' && amount !== null && currency !== 'UNKNOWN' && incoming;
  return {
    provider,
    amount,
    currency,
    customerPhone,
    transactionId,
    direction: incoming ? 'incoming' : 'unknown',
    parseStatus: parsed ? 'ready' : 'review',
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
    metadata: { eventId: ref.id, provider: parsed.provider, parseStatus: parsed.parseStatus, deviceId },
    createdAt: now,
  });
  return { ok: true, duplicate: false, eventId: ref.id, event };
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
