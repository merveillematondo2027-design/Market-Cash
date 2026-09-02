import { createHash } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();
const db = getFirestore();
const REGION = 'europe-west1';
const CURRENCIES = ['USD', 'CDF'] as const;
type Currency = typeof CURRENCIES[number];

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const walletId = (uid: string, currency: Currency) => `wallet_${currency.toLowerCase()}_${uid}`;
const rechargeNumberForUid = (uid: string) =>
  (BigInt(`0x${sha256(uid).slice(0, 15)}`) % 100000000000n).toString().padStart(11, '0');

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

async function ensureWalletDocs(uid: string, accountType: 'client' | 'agent' | 'business' = 'client') {
  const rechargeNumber = rechargeNumberForUid(uid);
  const now = Date.now();
  const batch = db.batch();
  for (const currency of CURRENCIES) {
    const ref = db.doc(`wallet_accounts/${walletId(uid, currency)}`);
    if (!(await ref.get()).exists) {
      batch.set(ref, {
        id: ref.id,
        userId: uid,
        accountType,
        currency,
        availableBalance: 0,
        ledgerBalance: 0,
        heldBalance: 0,
        status: 'active',
        rechargeNumber,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  const mapping = db.doc(`wallet_recharge_numbers/${rechargeNumber}`);
  if (!(await mapping.get()).exists) batch.set(mapping, { userId: uid, rechargeNumber, createdAt: now });
  await batch.commit();
  return rechargeNumber;
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
  const rechargeNumber = await ensureWalletDocs(uid, isAgent ? 'agent' : 'client');
  return { ok: true, rechargeNumber, isAgent, wallets: await getWalletSnapshot(uid) };
});

export const getMyWallets = onCall({ region: REGION }, async (request) => {
  const uid = requireAuth(request);
  const isAgent = (await db.doc(`agent_profiles/${uid}`).get()).data()?.status === 'active';
  const rechargeNumber = await ensureWalletDocs(uid, isAgent ? 'agent' : 'client');
  return { rechargeNumber, isAgent, wallets: await getWalletSnapshot(uid) };
});

export const adminRegisterAgent = onCall({ region: REGION }, async (request) => {
  const adminUid = requireAuth(request);
  await requireAdmin(adminUid);
  const agentUid = String(request.data?.agentUid || '');
  const user = await db.doc(`users/${agentUid}`).get();
  if (!user.exists) throw new HttpsError('not-found', 'Utilisateur introuvable.');
  const now = Date.now();
  await db.doc(`agent_profiles/${agentUid}`).set(
    { userId: agentUid, status: 'active', createdBy: adminUid, createdAt: now, updatedAt: now },
    { merge: true },
  );
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
  return {
    userId,
    displayName: user.displayName || 'Client',
    phone: user.phone || '',
    rechargeNumber,
    balances: { USD: wallets.USD?.availableBalance || 0, CDF: wallets.CDF?.availableBalance || 0 },
  };
});

async function executeAgentTransfer(input: {
  agentUid: string;
  clientUid: string;
  currency: Currency;
  amount: number;
  direction: 'cash_in' | 'cash_out';
  pin: string;
  idempotencyKey: string;
}) {
  const { agentUid, clientUid, currency, amount, direction, pin, idempotencyKey } = input;
  const txRef = db.doc(`wallet_transactions/${idempotencyKey}`);

  return db.runTransaction(async (tx) => {
    const existing = await tx.get(txRef);
    if (existing.exists) return { duplicate: true, ...existing.data() };

    const agentUserRef = db.doc(`users/${agentUid}`);
    const clientUserRef = db.doc(`users/${clientUid}`);
    const agentWalletRef = db.doc(`wallet_accounts/${walletId(agentUid, currency)}`);
    const clientWalletRef = db.doc(`wallet_accounts/${walletId(clientUid, currency)}`);
    const [agentUser, clientUser, agentWallet, clientWallet] = await Promise.all([
      tx.get(agentUserRef), tx.get(clientUserRef), tx.get(agentWalletRef), tx.get(clientWalletRef),
    ]);

    if (!agentUser.exists || !clientUser.exists) throw new HttpsError('not-found', 'Compte introuvable.');
    if (agentUser.data()?.pinHash !== sha256(pin)) throw new HttpsError('permission-denied', 'Code secret agent incorrect.');
    if (!agentWallet.exists || !clientWallet.exists) throw new HttpsError('failed-precondition', 'Portefeuille non initialisé.');

    const agent = agentWallet.data()!;
    const client = clientWallet.data()!;
    if (agent.status !== 'active' || client.status !== 'active') throw new HttpsError('failed-precondition', 'Portefeuille indisponible.');

    const debitRef = direction === 'cash_in' ? agentWalletRef : clientWalletRef;
    const creditRef = direction === 'cash_in' ? clientWalletRef : agentWalletRef;
    const debit = direction === 'cash_in' ? agent : client;
    const credit = direction === 'cash_in' ? client : agent;
    if (Number(debit.availableBalance || 0) < amount) {
      throw new HttpsError('failed-precondition', direction === 'cash_in' ? 'Solde agent insuffisant.' : 'Solde client insuffisant.');
    }

    const now = Date.now();
    const reference = `MC-${direction === 'cash_in' ? 'DEP' : 'RET'}-${now}`;
    tx.update(debitRef, {
      availableBalance: Number(debit.availableBalance) - amount,
      ledgerBalance: Number(debit.ledgerBalance) - amount,
      updatedAt: now,
    });
    tx.update(creditRef, {
      availableBalance: Number(credit.availableBalance) + amount,
      ledgerBalance: Number(credit.ledgerBalance) + amount,
      updatedAt: now,
    });

    const record = {
      id: idempotencyKey,
      reference,
      type: direction,
      status: 'settled',
      currency,
      amount,
      agentId: agentUid,
      clientId: clientUid,
      sourceWalletId: debitRef.id,
      destinationWalletId: creditRef.id,
      rail: 'agent_terminal',
      createdAt: now,
      updatedAt: now,
    };
    tx.set(txRef, record);
    tx.set(db.collection('ledger_entries').doc(), { transactionId: idempotencyKey, walletId: debitRef.id, direction: 'debit', amount, currency, createdAt: now });
    tx.set(db.collection('ledger_entries').doc(), { transactionId: idempotencyKey, walletId: creditRef.id, direction: 'credit', amount, currency, createdAt: now });
    tx.set(db.collection('audit_events').doc(), {
      actorId: agentUid,
      actorType: 'agent',
      action: direction === 'cash_in' ? 'AGENT_CASH_IN' : 'AGENT_CASH_OUT',
      resourceId: idempotencyKey,
      result: 'success',
      clientId: clientUid,
      amount,
      currency,
      createdAt: now,
    });
    return { ok: true, reference, transactionId: idempotencyKey };
  });
}

async function resolveClient(rechargeNumber: string) {
  const mapping = await db.doc(`wallet_recharge_numbers/${rechargeNumber}`).get();
  if (!mapping.exists) throw new HttpsError('not-found', 'Client introuvable.');
  return mapping.data()!.userId as string;
}

export const agentCashIn = onCall({ region: REGION }, async (request) => {
  const agentUid = requireAuth(request);
  await requireAgent(agentUid);
  const recharge = String(request.data?.rechargeNumber || '').replace(/\D/g, '');
  return executeAgentTransfer({
    agentUid,
    clientUid: await resolveClient(recharge),
    currency: parseCurrency(request.data?.currency),
    amount: parseAmount(request.data?.amount),
    direction: 'cash_in',
    pin: String(request.data?.pin || ''),
    idempotencyKey: String(request.data?.idempotencyKey || `cashin_${agentUid}_${Date.now()}`),
  });
});

export const agentCashOut = onCall({ region: REGION }, async (request) => {
  const agentUid = requireAuth(request);
  await requireAgent(agentUid);
  const recharge = String(request.data?.rechargeNumber || '').replace(/\D/g, '');
  return executeAgentTransfer({
    agentUid,
    clientUid: await resolveClient(recharge),
    currency: parseCurrency(request.data?.currency),
    amount: parseAmount(request.data?.amount),
    direction: 'cash_out',
    pin: String(request.data?.pin || ''),
    idempotencyKey: String(request.data?.idempotencyKey || `cashout_${agentUid}_${Date.now()}`),
  });
});

export const getAgentHistory = onCall({ region: REGION }, async (request) => {
  const agentUid = requireAuth(request);
  await requireAgent(agentUid);
  const snap = await db.collection('wallet_transactions').where('agentId', '==', agentUid).orderBy('createdAt', 'desc').limit(50).get();
  return { transactions: snap.docs.map((d) => d.data()) };
});

export const adminFundAgentFloat = onCall({ region: REGION }, async (request) => {
  const adminUid = requireAuth(request);
  await requireAdmin(adminUid);
  const agentUid = String(request.data?.agentUid || '');
  const currency = parseCurrency(request.data?.currency);
  const amount = parseAmount(request.data?.amount);
  const reason = String(request.data?.reason || '').trim();
  if (reason.length < 5) throw new HttpsError('invalid-argument', 'Motif obligatoire.');
  await requireAgent(agentUid);
  await ensureWalletDocs(agentUid, 'agent');

  const ref = db.doc(`wallet_accounts/${walletId(agentUid, currency)}`);
  const id = `fund_${agentUid}_${Date.now()}`;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const wallet = snap.data()!;
    const now = Date.now();
    tx.update(ref, {
      availableBalance: Number(wallet.availableBalance || 0) + amount,
      ledgerBalance: Number(wallet.ledgerBalance || 0) + amount,
      updatedAt: now,
    });
    tx.set(db.doc(`wallet_transactions/${id}`), {
      id,
      reference: `MC-FLOAT-${now}`,
      type: 'agent_float_funding',
      status: 'settled',
      currency,
      amount,
      agentId: agentUid,
      approvedBy: adminUid,
      reason,
      createdAt: now,
      updatedAt: now,
    });
    tx.set(db.collection('audit_events').doc(), {
      actorId: adminUid,
      action: 'AGENT_FLOAT_FUNDED',
      agentId: agentUid,
      amount,
      currency,
      reason,
      createdAt: now,
    });
  });
  return { ok: true, transactionId: id };
});
