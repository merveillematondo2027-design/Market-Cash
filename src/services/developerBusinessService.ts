import{httpsCallable}from'firebase/functions';
import{functions}from'../firebase/config';

export type DeveloperBusinessType='direct_developer'|'api_provider';
export type DeveloperAccountStatus='pending'|'active'|'rejected'|'suspended';
export type DeveloperCurrency='USD'|'CDF';
export interface DeveloperDashboard{developer:any|null;apps:any[];wallets:Record<string,any>;transactions:any[]}
export interface DeveloperLocalCardSecureData{cardId:string;cardNumber:string;cardHolder:string;expiryStart:string;expiryEnd:string;cvv:string}

const call=<T=any>(name:string,data?:any)=>httpsCallable<any,T>(functions,name)(data).then(r=>r.data);
let dashboardCache:{value:DeveloperDashboard;at:number}|null=null;
const invalidate=()=>{dashboardCache=null};
export const developerBusinessService={
  apply:(input:{companyName:string;contactEmail:string;businessType:DeveloperBusinessType;website?:string;reason?:string})=>call<{developerId:string;status:DeveloperAccountStatus;businessType:DeveloperBusinessType}>('createDeveloperAccount',input),
  dashboard:async(force=false)=>{
    if(!force&&dashboardCache&&Date.now()-dashboardCache.at<30000)return dashboardCache.value;
    try{await call('syncMyDeveloperRole')}catch(error){console.warn('[DEVELOPER_ROLE_SYNC_DEFERRED]',error)}
    const value=await call<DeveloperDashboard>('getMyDeveloperDashboard');dashboardCache={value,at:Date.now()};return value;
  },
  invalidate,
  access:()=>call<any>('getMyBusinessAccess'),
  registerApp:async(appName:string)=>{const r=await call<{appId:string;apiKey:string;appName:string;note:string}>('registerDeveloperApp',{appName});invalidate();return r},
  updateAppSettings:async(input:{appId:string;apiEnabled:boolean;enabledFeatures:string[];allowedCurrencies:string[]})=>{const r=await call<{ok:boolean;appId:string;status:string;apiEnabled:boolean;enabledFeatures:string[];allowedCurrencies:string[]}>('updateDeveloperAppSettings',input);invalidate();return r},
  deleteApp:async(appId:string)=>{const r=await call<{ok:boolean;appId:string;status:string}>('deleteDeveloperApp',{appId});invalidate();return r},
  billing:()=>call<{balance:number;currency:'USD';unitPrice:number;pricingTier:string;estimatedRequests:number}>('getMyDeveloperBilling'),
  revealLocalCard:(pin:string)=>call<DeveloperLocalCardSecureData>('developerRevealLocalCardSecureData',{pin}),
  transferWallet:(input:{marketCashId:string;currency:DeveloperCurrency;amount:number;cvv:string;idempotencyKey:string})=>call<{ok:boolean;reference:string;transactionId:string}>('developerWalletTransferWithCvv',input),
  topupLocalCard:(input:{currency:DeveloperCurrency;amount:number;cvv:string;idempotencyKey:string})=>call<{ok:boolean;reference:string;transactionId:string}>('developerWalletToLocalCardWithCvv',input),
  payMerchant:(input:{marketCashId:string;currency:DeveloperCurrency;amount:number;cvv:string;idempotencyKey:string})=>call<{ok:boolean;reference:string;transactionId:string;merchantName:string}>('developerMerchantPaymentWithCvv',input),
  fundBilling:async(amount:number,pin:string,idempotencyKey:string)=>{const r=await call<{ok:boolean;balance:number;debited:number;reference:string;transactionId:string}>('developerFundApiBillingFromWallet',{amount,pin,idempotencyKey});invalidate();return r},
  createSubDeveloper:(input:{companyName:string;contactEmail:string;externalReference?:string})=>call<{subDeveloperId:string;status:string}>('partnerCreateSubDeveloper',input),
  listSubDevelopers:()=>call<{developers:any[]}>('partnerListSubDevelopers'),
};
