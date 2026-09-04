import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';
import { WalletCurrency } from '../types/wallet';

export interface AgentAdminWallet {
  id:string;
  currency:WalletCurrency;
  status:string;
  availableBalance:number;
  ledgerBalance:number;
  heldBalance:number;
  rechargeNumber:string;
  marketCashId:string;
  updatedAt:number;
}

export interface AgentAdminDetails {
  agent:{
    uid:string;
    displayName:string;
    email:string;
    phone:string;
    accountStatus:string;
    kycStatus:string;
    mustChangePin:boolean;
    pointName:string;
    legalName:string;
    activity:string;
    city:string;
    address:string;
    openingHours:string;
    approvedAt:number;
    rechargeNumber:string;
    marketCashId:string;
  };
  wallets:{CDF:AgentAdminWallet|null;USD:AgentAdminWallet|null};
  transactions:any[];
}

const getDetails=httpsCallable<{agentUid:string},AgentAdminDetails>(functions,'adminGetAgentDetails');
const fund=httpsCallable<{agentUid:string;currency:WalletCurrency;amount:number;reason:string},{ok:boolean;transactionId:string;reference:string;wallets:AgentAdminDetails['wallets']}>(functions,'adminFundAgentFloatV2');

export const agentAdminService={
  getDetails:async(agentUid:string)=>(await getDetails({agentUid})).data,
  fund:async(input:{agentUid:string;currency:WalletCurrency;amount:number;reason:string})=>(await fund(input)).data,
};
