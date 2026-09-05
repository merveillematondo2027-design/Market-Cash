import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';
import { WalletCurrency } from '../types/wallet';

export interface RechargeClientLookup {
  userId: string;
  displayName: string;
  phone: string;
  rechargeNumber: string;
  balances: Record<WalletCurrency, number>;
}

export interface AgentClientLookup {
  userId: string;
  marketCashId: string;
  displayName: string;
  phone: string;
}

export interface LocalCardWithdrawalLookup {
  cardId: string;
  cardIdentifier: string;
  cardHolder: string;
  maskedNumber: string;
  clientName: string;
}

export interface WalletServerSnapshot {
  rechargeNumber: string;
  marketCashId?: string;
  legacyMarketCashId?: string;
  role?: string;
  isAgent: boolean;
  wallets: Record<WalletCurrency, {
    id: string;
    userId: string;
    accountType: string;
    currency: WalletCurrency;
    availableBalance: number;
    ledgerBalance: number;
    heldBalance: number;
    status: string;
    rechargeNumber: string;
    marketCashId?: string;
    updatedAt?: number;
  }>;
}

export interface MarketCashIdentity { marketCashId: string; }
export interface MarketCashRecipient { userId: string; marketCashId: string; displayName: string; legalName?: string; }
export interface WithdrawalAuthorization {
  ok: boolean;
  authorizationId: string;
  code: string;
  currency: WalletCurrency;
  amount: number;
  expiresAt: number;
}
export interface WithdrawalInspection {
  authorizationId: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  amount: number;
  currency: WalletCurrency;
  expiresAt: number;
}

export interface InternalCardSummary {
  cardId: string;
  cardIdentifier: string;
  cardHolder: string;
  maskedNumber: string;
  status: string;
  qrData?: string;
  expiryStart?: string;
  expiryEnd?: string;
  balances: Partial<Record<WalletCurrency, number>>;
}

export interface LocalCardSecureData {
  cardId: string;
  cardNumber: string;
  cardHolder: string;
  expiryStart: string;
  expiryEnd: string;
  cvv: string;
}

export interface ClientSecurityOverview {
  hasApplicationPin: boolean;
  hasLocalCvv: boolean;
  cvvVersion: number;
  cvvUpdatedAt: number;
}

export interface WalletDepositRequest {
  requestId: string;
  userId: string;
  walletId: string;
  rail: 'mobile_money' | 'bank';
  currency: WalletCurrency;
  amount: number;
  network?: string | null;
  phone?: string | null;
  bank?: string | null;
  orchestrator: 'MHT_APIS';
  integration?: 'mht' | 'reserved';
  status: string;
  providerReference?: string | null;
  pushRequested?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface VisaResetResult {
  ok: boolean;
  alreadyCompleted?: boolean;
  status?: string;
  resetCards?: number;
  deletedRequests?: number;
  deletedDeliveries?: number;
  deletedCardAccounts?: number;
}

const call = <TReq,TRes>(name:string) => httpsCallable<TReq,TRes>(functions,name);
const normalizeLocalCardReferenceForCallable=(value:string)=>{
  const trimmed=String(value||'').trim();
  if(/^MCL-[A-Z0-9_-]{4,120}$/i.test(trimmed))return `MARKET-CASH-CARD:${trimmed.toUpperCase()}`;
  return trimmed;
};

export const agentWalletService = {
  ensureWalletProfile: async() => (await call<Record<string,never>,WalletServerSnapshot & {ok:boolean}>('ensureWalletProfileV2')({})).data,
  getMyWallets: async() => (await call<Record<string,never>,WalletServerSnapshot>('getMyWalletsV2')({})).data,
  getMyAgentAccountSnapshot: async() => (await call<Record<string,never>,WalletServerSnapshot>('getMyWalletsV2')({})).data,
  getMyMarketCashIdentity: async() => (await call<Record<string,never>,MarketCashIdentity>('getMyMarketCashIdentityV2')({})).data,

  lookupMarketCashRecipient: async(marketCashId:string) => (await call<{marketCashId:string},MarketCashRecipient>('lookupMarketCashRecipientV2')({marketCashId})).data,
  transferMarketCash: async(input:{marketCashId:string;currency:WalletCurrency;amount:number;cvv:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('marketCashTransferWithCvv')(input)).data,

  lookupMerchantRecipient: async(marketCashId:string) => (await call<{marketCashId:string},MarketCashRecipient>('lookupMerchantRecipientV2')({marketCashId})).data,
  payMerchant: async(input:{cardId:string;marketCashId:string;currency:WalletCurrency;amount:number;cvv:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string;merchantName:string}>('merchantPaymentFromLocalCardWithCvvV2')(input)).data,

  createWithdrawalAuthorization: async(input:{currency:WalletCurrency;amount:number;pin:string}) => (await call<typeof input,WithdrawalAuthorization>('createWithdrawalAuthorization')(input)).data,
  cancelWithdrawalAuthorization: async(authorizationId:string) => (await call<{authorizationId:string},{ok:boolean}>('cancelWithdrawalAuthorization')({authorizationId})).data,
  inspectWithdrawalAuthorization: async(code:string) => (await call<{code:string},WithdrawalInspection>('inspectWithdrawalAuthorization')({code})).data,
  redeemWithdrawalAuthorization: async(input:{code:string;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string;amount:number;currency:WalletCurrency}>('redeemWithdrawalAuthorization')(input)).data,

  ensureLocalCard: async() => {
    const created=(await call<Record<string,never>,{ok:boolean;cardId:string;cardIdentifier:string}>('ensureLocalMarketCashCard')({})).data;
    await call<Record<string,never>,{ok:boolean;cardId:string;expiryStart:string;expiryEnd:string;cvvVersion:number}>('syncLocalCardSecurityProfile')({});
    return created;
  },
  getMyInternalCards: async() => (await call<Record<string,never>,{cards:InternalCardSummary[]}>('getMyLocalMarketCashCardsV3')({})).data.cards,
  fundInternalCard: async(input:{cardId:string;currency:WalletCurrency;amount:number;cvv:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('walletToLocalCardWithCvv')(input)).data,
  getMyWalletHistory: async() => (await call<Record<string,never>,{transactions:any[]}>('getMyWalletHistory')({})).data.transactions,
  createWalletDeposit: async(input:{rail:'mobile_money'|'bank';currency:WalletCurrency;amount:number;network?:string;phone?:string;bank?:string;idempotencyKey:string}) => (await call<typeof input,WalletDepositRequest>('createWalletDeposit')(input)).data,

  verifyApplicationSecret: async(pin:string) => (await call<{pin:string},{ok:boolean}>('verifyApplicationSecret')({pin})).data,
  getClientSecurityOverview: async() => (await call<Record<string,never>,ClientSecurityOverview>('getClientSecurityOverview')({})).data,
  revealLocalCardSecureData: async(pin:string) => (await call<{pin:string},LocalCardSecureData>('revealLocalCardSecureData')({pin})).data,
  rotateLocalCvv: async(pin:string) => (await call<{pin:string},{ok:boolean;cvv:string;version:number;updatedAt:number}>('rotateMarketCashLocalCvv')({pin})).data,
  changeApplicationPin: async(input:{currentPin:string;newPin:string}) => (await call<typeof input,{ok:boolean;pinChangedAt:number}>('changeApplicationPin')(input)).data,

  lookupAgentClient: async(marketCashId:string) => (await call<{marketCashId:string},AgentClientLookup>('lookupAgentClientByMarketCashIdV2')({marketCashId})).data,
  cashInToMarketCashId: async(input:{marketCashId:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('agentCashInByMarketCashIdV2')(input)).data,
  lookupLocalCardForWithdrawal: async(cardReference:string) => {
    const normalized=normalizeLocalCardReferenceForCallable(cardReference);
    return (await call<{cardReference:string},LocalCardWithdrawalLookup>('lookupLocalMarketCashCardForWithdrawal')({cardReference:normalized})).data;
  },
  cashOutFromLocalCard: async(input:{cardReference:string;currency:WalletCurrency;amount:number;clientCvv:string;idempotencyKey:string}) => {
    const payload={...input,cardReference:normalizeLocalCardReferenceForCallable(input.cardReference)};
    return (await call<typeof payload,{ok:boolean;reference:string;transactionId:string;amount:number;currency:WalletCurrency}>('agentLocalCardCashOutWithCvv')(payload)).data;
  },

  resetVisaTestDataOnce: async() => (await call<Record<string,never>,VisaResetResult>('adminResetVisaTestData')({})).data,

  // Legacy terminal methods kept only for older deployed clients. New UI does not use them.
  lookupClient: async(rechargeNumber:string) => (await call<{rechargeNumber:string},RechargeClientLookup>('lookupRechargeClient')({rechargeNumber})).data,
  cashIn: async(input:{rechargeNumber:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('agentCashIn')(input)).data,
  cashOut: async(input:{rechargeNumber:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('agentCashOut')(input)).data,
  getHistory: async() => (await call<Record<string,never>,{transactions:any[]}>('getAgentHistory')({})).data.transactions,
  registerAgent: async(agentUid:string) => (await call<{agentUid:string},{ok:boolean}>('adminRegisterAgent')({agentUid})).data,
  fundAgent: async(input:{agentUid:string;currency:WalletCurrency;amount:number;reason:string}) => (await call<typeof input,{ok:boolean;transactionId:string}>('adminFundAgentFloat')(input)).data,
};