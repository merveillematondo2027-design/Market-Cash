import{httpsCallable}from'firebase/functions';
import{functions}from'../firebase/config';

export type DeveloperBusinessType='direct_developer'|'api_provider';
export type DeveloperAccountStatus='pending'|'active'|'rejected'|'suspended';
export interface DeveloperDashboard{developer:any|null;apps:any[];wallets:Record<string,any>;transactions:any[]}

const call=<T=any>(name:string,data?:any)=>httpsCallable<any,T>(functions,name)(data).then(r=>r.data);
export const developerBusinessService={
  apply:(input:{companyName:string;contactEmail:string;businessType:DeveloperBusinessType;website?:string;reason?:string})=>call<{developerId:string;status:DeveloperAccountStatus;businessType:DeveloperBusinessType}>('createDeveloperAccount',input),
  dashboard:()=>call<DeveloperDashboard>('getMyDeveloperDashboard'),
  access:()=>call<any>('getMyBusinessAccess'),
  registerApp:(appName:string)=>call<{appId:string;apiKey:string;appName:string;note:string}>('registerDeveloperApp',{appName}),
  updateAppSettings:(input:{appId:string;apiEnabled:boolean;enabledFeatures:string[];allowedCurrencies:string[]})=>call<{ok:boolean;appId:string;status:string;apiEnabled:boolean;enabledFeatures:string[];allowedCurrencies:string[]}>('updateDeveloperAppSettings',input),
  createSubDeveloper:(input:{companyName:string;contactEmail:string;externalReference?:string})=>call<{subDeveloperId:string;status:string}>('partnerCreateSubDeveloper',input),
  listSubDevelopers:()=>call<{developers:any[]}>('partnerListSubDevelopers'),
};
