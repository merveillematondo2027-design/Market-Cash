import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) initializeApp();
const db = getFirestore();

export type FeeCurrency = 'USD' | 'CDF';
export type FeeAction = 'merchant_payment' | 'market_cash_transfer' | 'wallet_to_card' | 'agent_cash_in' | 'agent_cash_out' | 'mobile_money_withdrawal' | 'bank_withdrawal';

export const DEFAULT_TRANSACTION_FEES: Record<FeeAction,{percent:number;minUsd:number;minCdf:number;chargedTo:string}> = {
  merchant_payment: { percent: 2.0, minUsd: 0.10, minCdf: 250, chargedTo: 'payer' },
  market_cash_transfer: { percent: 1.5, minUsd: 0.05, minCdf: 150, chargedTo: 'sender' },
  wallet_to_card: { percent: 0, minUsd: 0, minCdf: 0, chargedTo: 'none' },
  agent_cash_in: { percent: 1.0, minUsd: 0.05, minCdf: 100, chargedTo: 'platform_commission' },
  agent_cash_out: { percent: 3.5, minUsd: 0.15, minCdf: 350, chargedTo: 'client' },
  mobile_money_withdrawal: { percent: 4.0, minUsd: 0.20, minCdf: 500, chargedTo: 'client' },
  bank_withdrawal: { percent: 3.0, minUsd: 0.20, minCdf: 500, chargedTo: 'client' },
};

const roundMoney=(value:number)=>Math.round(value*100)/100;
export async function transactionFee(action:FeeAction,currency:FeeCurrency,amount:number){
  const configured=(await db.doc('app_settings/transaction_fees').get()).data() || {};
  const base=DEFAULT_TRANSACTION_FEES[action];
  const override=(configured as any)[action] || {};
  const percent=Number.isFinite(Number(override.percent))?Number(override.percent):base.percent;
  const minUsd=Number.isFinite(Number(override.minUsd))?Number(override.minUsd):base.minUsd;
  const minCdf=Number.isFinite(Number(override.minCdf))?Number(override.minCdf):base.minCdf;
  if(action==='wallet_to_card'||override.enabled===false) return 0;
  const minimum=currency==='USD'?minUsd:minCdf;
  return roundMoney(Math.max(amount*percent/100,minimum));
}

export function transactionRevenueAccountId(currency:FeeCurrency){return `market_cash_transaction_fees_${currency.toLowerCase()}`;}
export const roundTransactionMoney=roundMoney;
