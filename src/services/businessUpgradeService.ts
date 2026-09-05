import{httpsCallable}from'firebase/functions';
import{functions}from'../firebase/config';
export type ProfessionalAccountType='agent'|'marchand'|'developer_direct'|'api_partner';
function readableError(error:any){const details=error?.details;const reason=typeof details==='string'?details:details?.reason||details?.message;const message=String(reason||error?.message||'').trim();const code=String(error?.code||'');if(message&&message!=='internal [0]'&&message!=='internal')return message;if(code.includes('unauthenticated'))return'Votre session a expiré. Reconnectez-vous puis réessayez.';if(code.includes('permission-denied'))return'Vous n’avez pas l’autorisation nécessaire pour cette opération.';if(code.includes('already-exists'))return'Une demande professionnelle est déjà en cours de vérification.';if(code.includes('failed-precondition'))return'Votre compte ne remplit pas encore les conditions requises.';if(code.includes('invalid-argument'))return'Certaines informations de la demande sont invalides ou incomplètes.';return"La demande n’a pas pu être enregistrée. Réessayez après quelques secondes."}
const call=async<T=any>(name:string,data?:any)=>{try{return(await httpsCallable<any,T>(functions,name)(data)).data}catch(error:any){console.error('[BUSINESS_UPGRADE_CALL_ERROR]',{name,code:error?.code,message:error?.message,details:error?.details});throw new Error(readableError(error))}};
export const businessUpgradeService={
 submit:(data:any)=>call('submitBusinessUpgrade',data),
 review:(data:{userId:string;decision:'approved'|'rejected';rejectionReason?:string})=>call('reviewBusinessUpgrade',data),
};
