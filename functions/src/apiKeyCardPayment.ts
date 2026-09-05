import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';

if (!getApps().length) initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const LEGACY_PAYMENT_ENDPOINT = 'https://europe-west1-automarket-fintech.cloudfunctions.net/marketCashApiCardPayment';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const normalize = (value: unknown) => String(value || '').trim();

function readApiKey(req: any) {
  const authorization = normalize(req.header('authorization'));
  const headerKey = normalize(req.header('x-market-cash-api-key'));
  return authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : headerKey;
}

async function resolveActiveDeveloperApp(apiKey: string) {
  const hash = sha256(apiKey);
  const snapshot = await db.collection('developer_apps')
    .where('apiKeyHash', '==', hash)
    .limit(3)
    .get();

  const active = snapshot.docs.filter((doc) => doc.data()?.status === 'active');
  if (active.length !== 1) throw new Error('UNAUTHORIZED');

  const app = active[0];
  const appId = String(app.data()?.appId || app.id).trim().toUpperCase();
  if (!appId) throw new Error('UNAUTHORIZED');
  return appId;
}

/**
 * Compatibility endpoint for server-to-server integrations that store only
 * the private Market-Cash API key. The API key is resolved to its active
 * developer app server-side, then the request is forwarded to the canonical
 * card-payment endpoint, which remains responsible for card validation,
 * balance debiting, fees, ledger entries and idempotency.
 *
 * No card or CVV data is logged or persisted by this bridge.
 */
export const marketCashApiCardPaymentByKey = onRequest({ region: REGION }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', approved: false, code: 'METHOD_NOT_ALLOWED' });
    return;
  }

  try {
    const apiKey = readApiKey(req);
    if (!apiKey) throw new Error('UNAUTHORIZED');

    const appId = await resolveActiveDeveloperApp(apiKey);
    const upstream = await fetch(LEGACY_PAYMENT_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'x-market-cash-app-id': appId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'market-cash/api-key-bridge',
      },
      body: JSON.stringify(req.body || {}),
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    res.status(upstream.status);
    res.set('Content-Type', contentType);
    res.send(text);
  } catch (error: any) {
    const code = String(error?.message || 'INTERNAL_ERROR');
    const status = code === 'UNAUTHORIZED' ? 401 : 500;
    console.warn('[MARKET_CASH_API_KEY_BRIDGE_ERROR]', code);
    res.status(status).json({ status: 'declined', approved: false, code });
  }
});
