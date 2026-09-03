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
  balances: Partial<Record<WalletCurrency, number>>;
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

const call = <TReq,TRes>(name:string) => httpsCallable<TReq,TRes>(functions,name);

export const agentWalletService = {
  ensureWalletProfile: async() => (await call<Record<string,never>,WalletServerSnapshot & {ok:boolean}>('ensureWalletProfile')({})).data,
  getMyWallets: async() => (await call<Record<string,never>,WalletServerSnapshot>('getMyWallets')({})).data,
  getMyMarketCashIdentity: async() => (await call<Record<string,never>,MarketCashIdentity>('getMyMarketCashIdentity')({})).data,

  lookupMarketCashRecipient: async(marketCashId:string) => (await call<{marketCashId:string},MarketCashRecipient>('lookupMarketCashRecipient')({marketCashId})).data,
  transferMarketCash: async(input:{marketCashId:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('marketCashTransfer')(input)).data,

  lookupMerchantRecipient: async(marketCashId:string) => (await call<{marketCashId:string},MarketCashRecipient>('lookupMerchantRecipient')({marketCashId})).data,
  payMerchant: async(input:{marketCashId:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string;merchantName:string}>('merchantPayment')(input)).data,

  createWithdrawalAuthorization: async(input:{currency:WalletCurrency;amount:number;pin:string}) => (await call<typeof input,WithdrawalAuthorization>('createWithdrawalAuthorization')(input)).data,
  cancelWithdrawalAuthorization: async(authorizationId:string) => (await call<{authorizationId:string},{ok:boolean}>('cancelWithdrawalAuthorization')({authorizationId})).data,
  inspectWithdrawalAuthorization: async(code:string) => (await call<{code:string},WithdrawalInspection>('inspectWithdrawalAuthorization')({code})).data,
  redeemWithdrawalAuthorization: async(input:{code:string;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string;amount:number;currency:WalletCurrency}>('redeemWithdrawalAuthorization')(input)).data,

  getMyInternalCards: async() => (await call<Record<string,never>,{cards:InternalCardSummary[]}>('getMyInternalCards')({})).data.cards,
  fundInternalCard: async(input:{cardId:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('walletToInternalCard')(input)).data,
  getMyWalletHistory: async() => (await call<Record<string,never>,{transactions:any[]}>('getMyWalletHistory')({})).data.transactions,
  createWalletDeposit: async(input:{rail:'mobile_money'|'bank';currency:WalletCurrency;amount:number;network?:string;phone?:string;bank?:string;idempotencyKey:string}) => (await call<typeof input,WalletDepositRequest>('createWalletDeposit')(input)).data,

  lookupAgentClient: async(marketCashId:string) => (await call<{marketCashId:string},AgentClientLookup>('lookupAgentClientByMarketCashId')({marketCashId})).data,
  cashInToMarketCashId: async(input:{marketCashId:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('agentCashInByMarketCashId')(input)).data,
  lookupLocalCardForWithdrawal: async(cardReference:string) => (await call<{cardReference:string},LocalCardWithdrawalLookup>('lookupLocalCardForWithdrawal')({cardReference})).data,
  cashOutFromLocalCard: async(input:{cardReference:string;currency:WalletCurrency;amount:number;clientPin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string;amount:number;currency:WalletCurrency}>('agentCardCashOut')(input)).data,

  // Legacy terminal methods kept temporarily for older deployed clients.
  lookupClient: async(rechargeNumber:string) => (await call<{rechargeNumber:string},RechargeClientLookup>('lookupRechargeClient')({rechargeNumber})).data,
  cashIn: async(input:{rechargeNumber:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('agentCashIn')(input)).data,
  cashOut: async(input:{rechargeNumber:string;currency:WalletCurrency;amount:number;pin:string;idempotencyKey:string}) => (await call<typeof input,{ok:boolean;reference:string;transactionId:string}>('agentCashOut')(input)).data,
  getHistory: async() => (await call<Record<string,never>,{transactions:any[]}>('getAgentHistory')({})).data.transactions,
  registerAgent: async(agentUid:string) => (await call<{agentUid:string},{ok:boolean}>('adminRegisterAgent')({agentUid})).data,
  fundAgent: async(input:{agentUid:string;currency:WalletCurrency;amount:number;reason:string}) => (await call<typeof input,{ok:boolean;transactionId:string}>('adminFundAgentFloat')(input)).data,
};
