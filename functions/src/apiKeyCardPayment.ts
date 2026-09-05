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
const localCardIdForUid = (uid: string) => `local_${sha256(`local-card:${uid}`).slice(0, 24)}`;
const cardAccountId = (cardId: string, currency: string) => `card_${currency.toLowerCase()}_${cardId}`;

function readApiKey(req: any) {
  const authorization = normalize(req.header('authorization'));
  const headerKey = normalize(req.header('x-market-cash-api-key'));
  return authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : headerKey;
}

async function resolveActiveDeveloperApp(apiKey: string) {
  const hash = sha256(apiKey);
  const snapshot = await db.collection('developer_apps').where('apiKeyHash', '==', hash).limit(3).get();
  const active = snapshot.docs.filter((doc) => doc.data()?.status === 'active');
  if (active.length !== 1) throw new Error('UNAUTHORIZED');
  const appDoc = active[0];
  const app = appDoc.data() || {};
  const appId = String(app.appId || appDoc.id).trim().toUpperCase();
  if (!appId) throw new Error('UNAUTHORIZED');
  return { appId, app };
}

async function canonicalCardIdentity(cardNumber: string) {
  if (!/^4585020002\d{6}$/.test(cardNumber)) return null;
  const registry = await db.doc(`card_number_registry/${cardNumber}`).get();
  if (!registry.exists) return null;
  const uid = String(registry.data()?.userId || '').trim();
  if (!uid) return null;
  const cardId = localCardIdForUid(uid);
  const card = await db.doc(`local_cards/${cardId}`).get();
  if (!card.exists) return null;
  return { uid, cardId, holder: normalize(card.data()?.cardHolder || card.data()?.cardHolderName), last4: cardNumber.slice(-4) };
}

function normalizeCardReference(value: unknown) {
  const raw = normalize(value);
  if (!raw) return '';
  const native = raw.match(/(?:MARKET-CASH-CARD\s*:\s*)?(MCL-[A-Z0-9_-]{4,120})/i);
  return native?.[1]?.toUpperCase() || '';
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

const failureLabel=(code:string)=>({INSUFFICIENT_FUNDS:'Solde insuffisant',CARD_INVALID:'Carte invalide',CARD_NOT_FOUND:'Carte introuvable',CARD_INACTIVE:'Carte inactive',CARD_ACCOUNT_INACTIVE:'Compte carte inactif',CVV_INVALID:'Code de sécurité incorrect',EXPIRY_INVALID:'Date d’expiration invalide',EXPIRY_MISMATCH:'Date d’expiration incorrecte',DEVELOPER_WALLET_INACTIVE:'Compte bénéficiaire indisponible'} as Record<string,string>)[code]||'Paiement refusé';

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

export const marketCashApiCardPaymentByKey = onRequest({ region: REGION }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {res.status(405).json({ status: 'error', approved: false, code: 'METHOD_NOT_ALLOWED' });return;}

  try {
    const apiKey = readApiKey(req);
    if (!apiKey) throw new Error('UNAUTHORIZED');
    const {appId,app}=await resolveActiveDeveloperApp(apiKey);
    const body = { ...(req.body || {}) } as Record<string, any>;

    if (String(body.operation || '') === 'resolve-card') {
      const card = await resolveCardCapture(body.cardReference);
      if (!card) {
        res.status(404).json({ status: 'error', resolved: false, code: 'CARD_REFERENCE_NOT_FOUND' });
        return;
      }
      await db.collection('audit_events').add({
        actorId: String(app.developerId || appId),
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
    try{payload=JSON.parse(text)}catch{payload={}}
    const approved=upstream.ok&&payload?.approved===true&&payload?.status==='approved';
    await recordPaymentOutcome({appId,app,body,identity,payload,approved}).catch(error=>console.warn('[MARKET_CASH_PAYMENT_OUTCOME_AUDIT_ERROR]',String((error as any)?.message||error)));
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    res.status(upstream.status);res.set('Content-Type', contentType);res.send(text);
  } catch (error: any) {
    const code = String(error?.message || 'INTERNAL_ERROR');
    const status = code === 'UNAUTHORIZED' ? 401 : 500;
    console.warn('[MARKET_CASH_API_KEY_BRIDGE_ERROR]', code);
    res.status(status).json({ status: 'declined', approved: false, code });
  }
});
