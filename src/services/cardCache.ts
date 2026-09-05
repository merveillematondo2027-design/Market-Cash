const TTL=45_000;

type CacheEnvelope<T>={at:number;value:T};
const memory=new Map<string,CacheEnvelope<any>>();

function readStorage<T>(key:string):CacheEnvelope<T>|null{
  try{const raw=sessionStorage.getItem(key);if(!raw)return null;const parsed=JSON.parse(raw)as CacheEnvelope<T>;if(!parsed||Date.now()-Number(parsed.at||0)>TTL){sessionStorage.removeItem(key);return null}return parsed}catch{return null}
}

export const cardCache={
  get<T>(key:string):T|null{const mem=memory.get(key)as CacheEnvelope<T>|undefined;if(mem&&Date.now()-mem.at<=TTL)return mem.value;const stored=readStorage<T>(key);if(stored){memory.set(key,stored);return stored.value}return null},
  set<T>(key:string,value:T){const envelope={at:Date.now(),value};memory.set(key,envelope);try{sessionStorage.setItem(key,JSON.stringify(envelope))}catch{}},
  clear(key?:string){if(key){memory.delete(key);try{sessionStorage.removeItem(key)}catch{};return}memory.clear();try{Object.keys(sessionStorage).filter(k=>k.startsWith('mc_cards_')).forEach(k=>sessionStorage.removeItem(k))}catch{}},
};

export const cardCacheKeys={local:(uid:string)=>`mc_cards_local_${uid}`,visa:(uid:string)=>`mc_cards_visa_${uid}`,history:(uid:string)=>`mc_cards_history_${uid}`};
