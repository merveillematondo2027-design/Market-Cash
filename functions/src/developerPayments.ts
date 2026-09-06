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
const billingAccountId = (developerId: string) => `billing_${developerId}`;
const apiRevenueId = (currency: Currency) => `market_cash_api_revenue_${currency.toLowerCase()}`;

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
  if (!CURRENCIES.includes(currency)) throw new Error('CURRENCY_INVALID');
  return currency;
}
function parseAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('AMOUNT_INVALID');
  return roundMoney(amount);
}

const DEFAULT_FEES = {
  merchant_payment: { percent: 2.0, minUsd: 0.10, minCdf: 250, chargedTo: 'payer' },
  market_cash_transfer: { percent: 1.5, minUsd: 0.05, minCdf: 150, chargedTo: 'sender' },
  wallet_to_card: { percent: 0.5, minUsd: 0.02, minCdf: 50, chargedTo: 'wallet' },
  agent_cash_in: { percent: 1.0, minUsd: 0.05, minCdf: 100, chargedTo: 'client' },
  agent_cash_out: { percent: 3.5, minUsd: 0.15, minCdf: 350, chargedTo: 'client' },
  mobile_money_withdrawal: { percent: 4.0, minUsd: 0.20, minCdf: 500, chargedTo: 'client' },
  bank_withdrawal: { percent: 3.0, minUsd: 0.20, minCdf: 500, chargedTo: 'client' },
} as const;
type FeeAction = keyof typeof DEFAULT_FEES;

async function developerApiPricing() {
  const configured = (await db.doc('app_settings/developer_api_pricing').get()).data() || {};
  const directPercent = Number(configured.directPercent);
  const wholesaleUsd = Number(configured.wholesaleUsd);
  return {
    directPercent: Number.isFinite(directPercent) && directPercent >= 0 && directPercent <= 100 ? directPercent : 2.5,
    wholesaleUsd: roundMoney(Number.isFinite(wholesaleUsd) && wholesaleUsd >= 0 ? wholesaleUsd : 0.05),
  };
}

async function ensureDeveloperWallets(developerId: string, uid: string) {
  const now = Date.now();
  const batch = db.batch();
  for (const currency of CURRENCIES) {
    const ref = db.doc(`developer_wallet_accounts/${developerWalletId(developerId, currency)}`);
    const snap = await ref.get();
    if (!snap.exists) batch.set(ref, {id:ref.id,developerId,userId:uid,currency,availableBalance:0,ledgerBalance:0,heldBalance:0,status:'active',createdAt:now,updatedAt:now});
  }
  await batch.commit();
}

export const createDeveloperAccount = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request), companyName = normalize(request.data?.companyName), contactEmail = normalize(request.data?.contactEmail);
  const businessType = normalize(request.data?.businessType) === 'api_provider' ? 'api_provider' : 'direct_developer';
  if (companyName.length < 2) throw new HttpsError('invalid-argument', 'Nom entreprise requis.');
  if (!/^\S+@\S+\.\S+$/.test(contactEmail)) throw new HttpsError('invalid-argument', 'Email invalide.');
  const developerId = developerAccountId(uid), ref = db.doc(`developer_accounts/${developerId}`), existing = await ref.get(), now = Date.now();
  if (existing.exists && existing.data()?.status === 'active' && existing.data()?.businessType !== businessType) throw new HttpsError('failed-precondition', 'Le type d’un compte Developer actif ne peut pas être changé sans validation administrative.');
  await ref.set({developerId,userId:uid,companyName,contactEmail,businessType,pricingTier:businessType==='api_provider'?'wholesale':'direct',partnerEnabled:existing.data()?.partnerEnabled||false,status:existing.data()?.status||'pending',createdAt:existing.data()?.createdAt||now,updatedAt:now},{merge:true});
  await ensureDeveloperWallets(developerId, uid);
  return { developerId, businessType, status: existing.data()?.status || 'pending' };
});

export const approveDeveloperAccount = onCall({ region: REGION }, async request => {
  const adminUid = requireAuth(request); await requireAdmin(adminUid);
  const developerId = normalizeUpper(request.data?.developerId), ref = db.doc(`developer_accounts/${developerId}`), snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Compte développeur introuvable.');
  const now = Date.now(), businessType = snap.data()?.businessType === 'api_provider' ? 'api_provider' : 'direct_developer';
  await ref.set({status:'active',partnerEnabled:businessType==='api_provider',pricingTier:businessType==='api_provider'?'wholesale':'direct',approvedBy:adminUid,approvedAt:now,updatedAt:now},{merge:true});
  const uid = String(snap.data()?.userId || '');
  if (uid) await db.doc(`users/${uid}`).set({role:businessType==='api_provider'?'api_partner':'developer',developerEnabled:true,apiProviderEnabled:businessType==='api_provider',businessAccountType:businessType,updatedAt:now},{merge:true});
  await db.collection('audit_events').add({actorId:adminUid,action:'DEVELOPER_ACCOUNT_APPROVED',developerId,businessType,createdAt:now});
  return { ok: true, developerId, businessType };
});

export const registerDeveloperApp = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request), developerId = developerAccountId(uid), developer = await db.doc(`developer_accounts/${developerId}`).get();
  if (!developer.exists || developer.data()?.status !== 'active') throw new HttpsError('failed-precondition', 'Compte développeur non approuvé.');
  const appName = normalize(request.data?.appName); if (appName.length < 2) throw new HttpsError('invalid-argument', 'Nom application requis.');
  const provider = developer.data()?.businessType === 'api_provider', appId = `${provider?'PAPP':'APP'}-${randomBytes(6).toString('hex').toUpperCase()}`, apiKey = `${provider?'mcp':'mck'}_live_${randomBytes(24).toString('hex')}`;
  const scopes = provider?['payments.create','transactions.read','balance.read','developers.create','developers.read']:['payments.create','transactions.read','balance.read'];
  const now = Date.now();
  await db.doc(`developer_apps/${appId}`).set({appId,developerId,userId:uid,appName,apiKeyHash:sha256(apiKey),status:'active',apiEnabled:true,scopes,enabledFeatures:scopes,businessType:provider?'api_provider':'direct_developer',pricingTier:provider?'wholesale':'direct',allowedCurrencies:[...CURRENCIES],createdAt:now,updatedAt:now});
  return { appId, apiKey, appName, scopes, note: 'Copiez cette clé maintenant. Market-Cash ne la réaffichera pas.' };
});

export const getMyDeveloperDashboard = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request), developerId = developerAccountId(uid);
  const [account, apps, transactions, usd, cdf] = await Promise.all([
    db.doc(`developer_accounts/${developerId}`).get(),
    db.collection('developer_apps').where('developerId','==',developerId).limit(30).get(),
    db.collection('wallet_transactions').where('developerId','==',developerId).limit(100).get(),
    db.doc(`developer_wallet_accounts/${developerWalletId(developerId,'USD')}`).get(),
    db.doc(`developer_wallet_accounts/${developerWalletId(developerId,'CDF')}`).get(),
  ]);
  if (!account.exists) return { developer:null,apps:[],wallets:{},transactions:[] };
  return {developer:account.data(),apps:apps.docs.map(d=>({...d.data(),apiKeyHash:undefined})),wallets:{USD:usd.data()||null,CDF:cdf.data()||null},transactions:transactions.docs.map(d=>d.data()).sort((a:any,b:any)=>Number(b.createdAt||0)-Number(a.createdAt||0))};
});

export const getTransactionFeeSchedule = onCall({ region: REGION }, async request => {
  requireAuth(request); const configured = (await db.doc('app_settings/transaction_fees').get()).data() || {};
  return { fees: Object.fromEntries(Object.entries(DEFAULT_FEES).map(([key,value])=>[key,{...value,...(configured as any)[key]}])) };
});
export const adminUpdateTransactionFees = onCall({ region: REGION }, async request => {
  const uid = requireAuth(request); await requireAdmin(uid); const input = request.data?.fees || {}, allowed:Record<string,any>={};
  for (const action of Object.keys(DEFAULT_FEES) as FeeAction[]) { if(!input[action])continue; const percent=Number(input[action].percent),minUsd=Number(input[action].minUsd),minCdf=Number(input[action].minCdf); if(![percent,minUsd,minCdf].every(Number.isFinite)||percent<0||percent>20||minUsd<0||minCdf<0)throw new HttpsError('invalid-argument',`Frais invalides: ${action}`); allowed[action]={percent,minUsd,minCdf,updatedAt:Date.now(),updatedBy:uid}; }
  await db.doc('app_settings/transaction_fees').set(allowed,{merge:true}); return {ok:true};
});

async function authenticateDeveloperApp(req:any){
  const appId=normalizeUpper(req.header('x-market-cash-app-id')),authorization=normalize(req.header('authorization')),headerKey=normalize(req.header('x-market-cash-api-key')),apiKey=authorization.toLowerCase().startsWith('bearer ')?authorization.slice(7).trim():headerKey;
  if(!appId||!apiKey)throw new Error('UNAUTHORIZED'); const appSnap=await db.doc(`developer_apps/${appId}`).get();
  if(!appSnap.exists||appSnap.data()?.status!=='active'||appSnap.data()?.apiEnabled===false||appSnap.data()?.apiKeyHash!==sha256(apiKey))throw new Error('UNAUTHORIZED');
  const app=appSnap.data()!,developerId=String(app.developerId||''),developer=await db.doc(`developer_accounts/${developerId}`).get();
  if(!developer.exists||developer.data()?.status!=='active')throw new Error('DEVELOPER_INACTIVE');
  const features=Array.isArray(app.enabledFeatures)?app.enabledFeatures:(Array.isArray(app.scopes)?app.scopes:[]); if(!features.includes('payments.create'))throw new Error('API_SCOPE_DENIED');
  return {appId,app,developerId,developer:developer.data()!};
}
function expiryMatches(stored:string,submitted:string){return stored.replace(/\s/g,'')===submitted.replace(/\s/g,'')}

export const marketCashApiCardPayment = onRequest({ region: REGION }, async (req,res) => {
  res.set('Cache-Control','no-store'); if(req.method!=='POST'){res.status(405).json({status:'error',code:'METHOD_NOT_ALLOWED'});return}
  try{
    const auth=await authenticateDeveloperApp(req),currency=parseCurrency(req.body?.currency),amount=parseAmount(req.body?.amount),cardNumber=normalize(req.body?.cardNumber).replace(/\D/g,''),holder=normalizeUpper(req.body?.cardHolder),expiry=normalize(req.body?.expiry),cvv=normalize(req.body?.cvv),externalReference=normalize(req.body?.externalReference),reason=normalize(req.body?.reason||`Paiement ${auth.app.appName}`);
    const allowedCurrencies=Array.isArray(auth.app.allowedCurrencies)?auth.app.allowedCurrencies:CURRENCIES;if(!allowedCurrencies.includes(currency))throw new Error('CURRENCY_NOT_ALLOWED');
    if(!/^4585020002\d{6}$/.test(cardNumber))throw new Error('CARD_INVALID'); if(!/^\d{3}$/.test(cvv))throw new Error('CVV_INVALID'); if(!/^\d{2}\/\d{2}$/.test(expiry))throw new Error('EXPIRY_INVALID'); if(externalReference.length<6||externalReference.length>120)throw new Error('REFERENCE_INVALID');
    const registry=await db.doc(`card_number_registry/${cardNumber}`).get();if(!registry.exists)throw new Error('CARD_NOT_FOUND');
    const clientUid=String(registry.data()?.userId||''),cardId=localCardIdForUid(clientUid),txId=`devpay_${sha256(`${auth.appId}:${externalReference}`).slice(0,36)}`,cardRef=db.doc(`local_cards/${cardId}`),cardWalletRef=db.doc(`card_wallet_accounts/${cardAccountId(cardId,currency)}`),developerWalletRef=db.doc(`developer_wallet_accounts/${developerWalletId(auth.developerId,currency)}`),billingRef=db.doc(`developer_billing_accounts/${billingAccountId(auth.developerId)}`),apiRevenueRef=db.doc(`platform_revenue_accounts/${apiRevenueId(currency)}`),txRef=db.doc(`wallet_transactions/${txId}`),securityRef=db.doc(`user_security/${clientUid}`);
    const partner=auth.developer.businessType==='api_provider',pricing=await developerApiPricing();
    const result=await db.runTransaction(async tx=>{
      const refs=[tx.get(txRef),tx.get(cardRef),tx.get(cardWalletRef),tx.get(developerWalletRef),tx.get(apiRevenueRef),tx.get(securityRef)];
      if(partner)refs.push(tx.get(billingRef));
      const snapshots=await Promise.all(refs),existing=snapshots[0],cardSnap=snapshots[1],cardWallet=snapshots[2],developerWallet=snapshots[3],apiRevenue=snapshots[4],security=snapshots[5],billing=partner?snapshots[6]:null;
      if(existing.exists)return{duplicate:true,...existing.data()};
      if(!cardSnap.exists||cardSnap.data()?.status!=='active')throw new Error('CARD_INACTIVE');const card=cardSnap.data()!;
      if(String(card.cardNumber||'')!==cardNumber)throw new Error('CARD_INVALID');if(normalizeUpper(card.cardHolder||card.cardHolderName)!==holder)throw new Error('HOLDER_MISMATCH');if(!expiryMatches(String(card.expiryEnd||''),expiry))throw new Error('EXPIRY_MISMATCH');if(security.data()?.localTransactionCvvHash!==sha256(cvv))throw new Error('CVV_INVALID');
      if(!cardWallet.exists||cardWallet.data()?.status!=='active')throw new Error('CARD_ACCOUNT_INACTIVE');if(!developerWallet.exists||developerWallet.data()?.status!=='active')throw new Error('DEVELOPER_WALLET_INACTIVE');
      const cardBalance=Number(cardWallet.data()?.availableBalance||0);if(cardBalance<amount)throw new Error('INSUFFICIENT_FUNDS');
      let platformFee=0,billingAfter:number|null=null,billingModel='percentage_from_received_amount';
      if(partner){if(!billing?.exists||billing.data()?.status!=='active')throw new Error('API_BILLING_ACCOUNT_INACTIVE');const billingBalance=Number(billing.data()?.availableBalance||0);if(billingBalance<pricing.wholesaleUsd)throw new Error('API_BILLING_BALANCE_LOW');platformFee=pricing.wholesaleUsd;billingAfter=roundMoney(billingBalance-platformFee);billingModel='partner_prepaid_flat_per_successful_request';}
      else platformFee=roundMoney(amount*pricing.directPercent/100);
      const developerNet=partner?amount:roundMoney(Math.max(0,amount-platformFee));
      const developerBalance=Number(developerWallet.data()?.availableBalance||0),apiRevenueBalance=Number(apiRevenue.data()?.availableBalance||0),now=Date.now(),reference=`MC-PAY-${now}-${randomBytes(3).toString('hex').toUpperCase()}`,cardBalanceAfter=roundMoney(cardBalance-amount),developerBalanceAfter=roundMoney(developerBalance+developerNet),apiRevenueAfter=roundMoney(apiRevenueBalance+platformFee);
      tx.update(cardWalletRef,{availableBalance:cardBalanceAfter,ledgerBalance:roundMoney(Number(cardWallet.data()?.ledgerBalance||cardBalance)-amount),updatedAt:now});
      tx.update(developerWalletRef,{availableBalance:developerBalanceAfter,ledgerBalance:roundMoney(Number(developerWallet.data()?.ledgerBalance||developerBalance)+developerNet),updatedAt:now});
      if(partner&&billing&&billingAfter!==null)tx.update(billingRef,{availableBalance:billingAfter,ledgerBalance:roundMoney(Number(billing.data()?.ledgerBalance||Number(billing.data()?.availableBalance||0))-platformFee),lastUsageAt:now,updatedAt:now});
      tx.set(apiRevenueRef,{id:apiRevenueRef.id,currency,availableBalance:apiRevenueAfter,ledgerBalance:apiRevenueAfter,updatedAt:now,createdAt:apiRevenue.data()?.createdAt||now},{merge:true});
      const record={id:txId,reference,externalReference,type:'developer_card_payment',status:'settled',currency,amount,feeAmount:platformFee,clientFeeAmount:0,totalDebited:amount,netAmount:developerNet,apiUsageFeeUsd:partner?platformFee:0,platformFeeAmount:platformFee,platformFeeCurrency:partner?'USD':currency,directFeePercent:partner?0:pricing.directPercent,billingModel,clientId:clientUid,userId:clientUid,userIds:[clientUid],cardId,developerId:auth.developerId,appId:auth.appId,developerName:auth.developer.companyName,appName:auth.app.appName,reason,rail:'market_cash_api',source:partner?'API_PROVIDER':'MARKET_CASH_DIRECT',pricingTier:partner?'wholesale':'direct',cardLast4:cardNumber.slice(-4),cardBalanceAfter,developerBalanceAfter,billingBalanceAfter:billingAfter,adminVisible:true,createdAt:now,updatedAt:now};
      tx.set(txRef,record);tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,cardWalletId:cardWalletRef.id,userId:clientUid,direction:'debit',amount,currency,entryType:'client_card_payment',createdAt:now});tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,developerWalletId:developerWalletRef.id,developerId:auth.developerId,direction:'credit',amount:developerNet,currency,entryType:'developer_sale_net',createdAt:now});
      if(partner&&billingAfter!==null)tx.set(db.collection('developer_billing_transactions').doc(),{developerId:auth.developerId,appId:auth.appId,transactionId:txId,type:'api_usage',status:'settled',currency:'USD',amount:platformFee,direction:'debit',balanceAfter:billingAfter,createdAt:now});
      tx.set(db.collection('ledger_entries').doc(),{transactionId:txId,revenueWalletId:apiRevenueRef.id,direction:'credit',amount:platformFee,currency:partner?'USD':currency,entryType:partner?'market_cash_partner_api_usage_revenue':'market_cash_direct_api_percentage_revenue',createdAt:now});
      tx.set(db.collection('notifications').doc(),{userId:clientUid,title:'Paiement Market-Cash effectué',message:`${amount} ${currency} payé à ${auth.developer.companyName}. Réf: ${reference}.`,type:'success',category:'transaction',transactionId:txId,read:false,createdAt:now});
      tx.set(db.collection('audit_events').doc(),{actorId:auth.developerId,actorType:partner?'api_provider_app':'developer_app',action:'MARKET_CASH_API_CARD_PAYMENT',resourceId:txId,result:'success',clientId:clientUid,appId:auth.appId,amount,currency,platformFeeAmount:platformFee,platformFeeCurrency:partner?'USD':currency,directFeePercent:partner?0:pricing.directPercent,billingModel,pricingTier:partner?'wholesale':'direct',createdAt:now});
      return record;
    });
    res.status(200).json({status:'approved',approved:true,duplicate:Boolean((result as any).duplicate),reference:(result as any).reference,externalReference,amount,feeAmount:(result as any).feeAmount||0,netAmount:(result as any).netAmount??amount,totalDebited:amount,apiUsageFeeUsd:partner?pricing.wholesaleUsd:0,directFeePercent:partner?0:pricing.directPercent,currency,pricingTier:partner?'wholesale':'direct',developer:auth.developer.companyName,app:auth.app.appName});
  }catch(error:any){const code=String(error?.message||'INTERNAL_ERROR');const status=code==='UNAUTHORIZED'?401:['DEVELOPER_INACTIVE','API_SCOPE_DENIED'].includes(code)?403:['API_BILLING_BALANCE_LOW','API_BILLING_ACCOUNT_INACTIVE','INSUFFICIENT_FUNDS'].includes(code)?402:400;console.warn('[MARKET_CASH_API_CARD_PAYMENT_DECLINED]',code);res.status(status).json({status:'declined',approved:false,code})}
});
