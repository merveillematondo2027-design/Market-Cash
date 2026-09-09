import {agentWalletService,ClientSecurityOverview,WalletServerSnapshot} from './agentWalletService';
import {cardSecurityService,VisaCardSummary} from './cardSecurityService';
import {localCardPairService,LocalPairCardSummary} from './localCardPairService';
import {cardCache,cardCacheKeys} from './cardCache';

export interface ClientStartupSnapshot{
  uid:string;
  warmedAt:number;
  wallet:WalletServerSnapshot|null;
  marketCashId:string;
  localCards:LocalPairCardSummary[];
  visaCards:VisaCardSummary[];
  security:ClientSecurityOverview|null;
  walletLoaded:boolean;
  identityLoaded:boolean;
  localLoaded:boolean;
  visaLoaded:boolean;
  securityLoaded:boolean;
}

const FRESH_MS=30_000;
const memory=new Map<string,ClientStartupSnapshot>();
const inflight=new Map<string,Promise<ClientStartupSnapshot>>();
const fulfilled=<T,>(result:PromiseSettledResult<T>):result is PromiseFulfilledResult<T>=>result.status==='fulfilled';

export const clientStartupCache={
  peek(uid:string){return memory.get(uid)||null},
  isFresh(uid:string,maxAgeMs=FRESH_MS){const value=memory.get(uid);return Boolean(value&&Date.now()-value.warmedAt<=maxAgeMs)},
  clear(uid?:string){if(uid){memory.delete(uid);inflight.delete(uid);return}memory.clear();inflight.clear()},
  warm(uid:string,force=false){
    const cached=memory.get(uid);
    if(!force&&cached&&Date.now()-cached.warmedAt<=FRESH_MS)return Promise.resolve(cached);
    const running=inflight.get(uid);if(running)return running;
    const task=(async()=>{
      const previous=memory.get(uid);
      const[walletResult,identityResult,localResult,visaResult,securityResult]=await Promise.allSettled([
        agentWalletService.ensureWalletProfile(),
        agentWalletService.getMyMarketCashIdentity(),
        localCardPairService.ensure(),
        cardSecurityService.getMyVisaCards(),
        agentWalletService.getClientSecurityOverview(),
      ]);
      const wallet=fulfilled(walletResult)?walletResult.value:previous?.wallet||null;
      const marketCashId=fulfilled(identityResult)?identityResult.value.marketCashId:previous?.marketCashId||'';
      const localCards=fulfilled(localResult)?localResult.value:previous?.localCards||[];
      const visaCards=fulfilled(visaResult)?visaResult.value:previous?.visaCards||[];
      const security=fulfilled(securityResult)?securityResult.value:previous?.security||null;
      if(fulfilled(localResult))cardCache.set(cardCacheKeys.local(uid),localCards);
      if(fulfilled(visaResult))cardCache.set(cardCacheKeys.visa(uid),visaCards);
      const next:ClientStartupSnapshot={
        uid,warmedAt:Date.now(),wallet,marketCashId,localCards,visaCards,security,
        walletLoaded:fulfilled(walletResult),identityLoaded:fulfilled(identityResult),
        localLoaded:fulfilled(localResult),visaLoaded:fulfilled(visaResult),securityLoaded:fulfilled(securityResult),
      };
      memory.set(uid,next);
      return next;
    })().finally(()=>inflight.delete(uid));
    inflight.set(uid,task);
    return task;
  },
};
