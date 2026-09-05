import{httpsCallable}from'firebase/functions';import{functions}from'../firebase/config';
const call=<Req,Res>(name:string,data:Req)=>httpsCallable<Req,Res>(functions,name)(data).then(r=>r.data);
export const professionalBusinessService={
 getIdentity:()=>call<Record<string,never>,{professionalId:string}>('getMyProfessionalIdentity',{}),
 developerToLocalCard:(input:{currency:'USD'|'CDF';amount:number})=>call<typeof input,{ok:boolean;transactionId:string;feeAmount:number;totalDebited:number}>('developerTransferToLocalCard',input),
};
