import{httpsCallable}from'firebase/functions';
import{functions}from'../firebase/config';
export type ProfessionalAccountType='agent'|'marchand'|'developer_direct'|'api_partner';
const call=<T=any>(name:string,data?:any)=>httpsCallable<any,T>(functions,name)(data).then(r=>r.data);
export const businessUpgradeService={
 submit:(data:any)=>call('submitBusinessUpgrade',data),
 review:(data:{userId:string;decision:'approved'|'rejected';rejectionReason?:string})=>call('reviewBusinessUpgrade',data),
};
