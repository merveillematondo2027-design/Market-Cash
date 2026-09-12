from pathlib import Path

# CardProductFace: add balance overlay support
p=Path('src/components/CardProductFace.tsx'); s=p.read_text()
s=s.replace("interface Props{variant:CardProductVariant;holder?:string;number?:string;expiryStart?:string;expiryEnd?:string;cvv?:string;qrData?:string;revealed?:boolean;side?:'front'|'back';showRevealButton?:boolean;onToggleReveal?:()=>void;onFlip?:()=>void;className?:string}","interface Props{variant:CardProductVariant;holder?:string;number?:string;expiryStart?:string;expiryEnd?:string;cvv?:string;qrData?:string;revealed?:boolean;side?:'front'|'back';showRevealButton?:boolean;onToggleReveal?:()=>void;onFlip?:()=>void;className?:string;balanceText?:string;balanceVisible?:boolean;onToggleBalance?:()=>void}")
s=s.replace("export default function CardProductFace({variant,holder,number,expiryStart,expiryEnd,cvv,qrData,revealed=false,side='front',showRevealButton=true,onToggleReveal,onFlip,className=''}:Props)","export default function CardProductFace({variant,holder,number,expiryStart,expiryEnd,cvv,qrData,revealed=false,side='front',showRevealButton=true,onToggleReveal,onFlip,className='',balanceText,balanceVisible=false,onToggleBalance}:Props)")
needle="<div className=\"my-auto py-2\"><p className=\"whitespace-nowrap font-mono text-[1.03rem] font-semibold tracking-[.13em] sm:text-[1.28rem]\">{numberText(number,revealed)}</p></div>"
replace=needle+"{balanceText&&<div className=\"mb-2 flex items-center justify-between rounded-xl bg-black/15 px-3 py-2 backdrop-blur-sm\"><div><p className={`text-[5.5px] font-black uppercase tracking-[.14em] ${s.muted}`}>Solde</p><p className=\"mt-0.5 text-[11px] font-black\">{balanceVisible?balanceText:'••••••'}</p></div>{onToggleBalance&&<button type=\"button\" onClick={e=>{e.preventDefault();e.stopPropagation();onToggleBalance()}} className=\"grid h-8 w-8 place-items-center rounded-lg bg-white/10\">{balanceVisible?<EyeOff size={14}/>:<Eye size={14}/>}</button>}</div>}"
if needle not in s: raise SystemExit('CardProductFace number block not found')
s=s.replace(needle,replace,1); p.write_text(s)

# SecurityConfirmModal: optional biometric path
p=Path('src/components/SecurityConfirmModal.tsx'); s=p.read_text()
s=s.replace("import{KeyRound,X}from'lucide-react';","import{Fingerprint,KeyRound,X}from'lucide-react';\nimport{useAuthStore}from'../store/authStore';\nimport{deviceSecurityService}from'../services/deviceSecurityService';")
s=s.replace("  onConfirm:(pin:string)=>Promise<void>|void;\n}","  onConfirm:(pin:string)=>Promise<void>|void;\n  onBiometric?:()=>Promise<void>|void;\n}")
s=s.replace("export default function SecurityConfirmModal({open,title='Confirmer avec votre code secret',subtitle='Ce code protège les actions sensibles de votre application Market-Cash.',busy=false,onClose,onConfirm}:Props){\n  const[pin,setPin]=useState('');", "export default function SecurityConfirmModal({open,title='Confirmer avec votre code secret',subtitle='Ce code protège les actions sensibles de votre application Market-Cash.',busy=false,onClose,onConfirm,onBiometric}:Props){\n  const{user}=useAuthStore();\n  const[pin,setPin]=useState('');\n  const[bioBusy,setBioBusy]=useState(false);\n  const[bioAvailable,setBioAvailable]=useState(false);")
s=s.replace("  useEffect(()=>{if(!open)setPin('')},[open]);", "  useEffect(()=>{if(!open)setPin('');if(open&&user?.useBiometrics&&onBiometric)void deviceSecurityService.platformAvailable().then(setBioAvailable)},[open,user?.useBiometrics,onBiometric]);")
needle="      <button disabled={busy||!valid} className=\"mt-4 w-full rounded-2xl bg-blue-950 py-4 font-black text-white shadow-sm disabled:opacity-40\">{busy?'Vérification…':'Confirmer'}</button>"
replace=needle+"{user?.useBiometrics&&onBiometric&&bioAvailable&&<><div className=\"my-3 flex items-center gap-3 text-[10px] font-black uppercase text-slate-300\"><span className=\"h-px flex-1 bg-slate-200\"/>ou<span className=\"h-px flex-1 bg-slate-200\"/></div><button type=\"button\" disabled={busy||bioBusy} onClick={async()=>{setBioBusy(true);try{await deviceSecurityService.verify(user.uid);await onBiometric()}finally{setBioBusy(false)}}} className=\"flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-blue-200 bg-blue-50 py-4 font-black text-blue-950 disabled:opacity-40\"><Fingerprint size={20}/>{bioBusy?'Vérification…':'Empreinte / Face ID'}</button></>}"
if needle not in s: raise SystemExit('Security modal button not found')
s=s.replace(needle,replace,1); p.write_text(s)

# Settings: save autolock through callable service
p=Path('src/pages/client/Settings.tsx'); s=p.read_text()
s=s.replace("const saveAutoLock=async(value:number)=>{setAutoLock(value);try{const now=Date.now();await updateDoc(doc(db,'users',user.uid),{securityAutoLockMinutes:value,updatedAt:now});setUser({...user,securityAutoLockMinutes:value,updatedAt:now});toast.success(`Verrouillage automatique : ${value} min`)}catch{toast.error('Impossible d’enregistrer la durée.')}};", "const saveAutoLock=async(value:number)=>{setAutoLock(value);try{const result=await deviceSecurityService.updatePreferences({securityAutoLockMinutes:value});setUser({...user,securityAutoLockMinutes:result.securityAutoLockMinutes,updatedAt:result.updatedAt});toast.success(`Verrouillage automatique : ${value} min`)}catch(error:any){toast.error(error?.message||'Impossible d’enregistrer la durée.')}};")
p.write_text(s)

# deviceSecurityService callable
p=Path('src/services/deviceSecurityService.ts'); s=p.read_text()
s=s.replace("const removePasskeys=httpsCallable(functions,'removeMyPasskeys');", "const removePasskeys=httpsCallable(functions,'removeMyPasskeys');\nconst updatePreferences=httpsCallable(functions,'updateSecurityPreferences');")
s=s.replace(" async remove(_uid:string){await removePasskeys({});sessionStorage.removeItem('marketcash_biometric_verified_at')},", " async remove(_uid:string){await removePasskeys({});sessionStorage.removeItem('marketcash_biometric_verified_at')},\n async updatePreferences(input:{securityAutoLockMinutes:number}){const res:any=await updatePreferences(input);return res.data as {securityAutoLockMinutes:number;updatedAt:number}},")
p.write_text(s)

# Local card service biometric reveal
p=Path('src/services/localCardPairService.ts'); s=p.read_text()
s=s.replace("  reveal:async(cardId:string,pin:string)=>(await call<{cardId:string;pin:string},LocalPairSecureData>('revealLocalCardV3')({cardId,pin})).data,", "  reveal:async(cardId:string,pin:string)=>(await call<{cardId:string;pin:string},LocalPairSecureData>('revealLocalCardV3')({cardId,pin})).data,\n  revealWithBiometric:async(cardId:string)=>(await call<{cardId:string;biometric:boolean},LocalPairSecureData>('revealLocalCardV3')({cardId,biometric:true})).data,")
p.write_text(s)

# CardDetail: balance on card, remove separate box, biometric callbacks
p=Path('src/pages/client/CardDetail.tsx'); s=p.read_text()
old="<CardProductFace variant={kind} holder={holder} number={number} expiryStart={expiryStart} expiryEnd={expiryEnd} cvv={cvv} qrData={qrData} revealed={detailsRevealed} side={standardSide} onToggleReveal={requestDetails} onFlip={kind==='standard'?()=>setStandardSide(s=>s==='front'?'back':'front'):undefined}/>"
new="<CardProductFace variant={kind} holder={holder} number={number} expiryStart={expiryStart} expiryEnd={expiryEnd} cvv={cvv} qrData={qrData} revealed={detailsRevealed} side={standardSide} onToggleReveal={requestDetails} onFlip={kind==='standard'?()=>setStandardSide(s=>s==='front'?'back':'front'):undefined} balanceText={kind==='local'?money(localBalance,currency):visaBalance===undefined?'Indisponible':money(visaBalance,currency)} balanceVisible={showBalance} onToggleBalance={requestBalance}/>"
if old not in s: raise SystemExit('CardDetail face not found')
s=s.replace(old,new,1)
start="{cardExists&&<><section className=\"mx-auto mt-5 max-w-xl rounded-[1.75rem] border bg-white p-5 shadow-sm\"><div className=\"flex items-center justify-between\"><div><p className=\"text-[10px] font-black uppercase tracking-[.16em] text-slate-400\">Solde de la carte</p><p className=\"mt-2 text-2xl font-black text-blue-950\">{!showBalance?'••••••':kind==='local'?money(localBalance,currency):visaBalance===undefined?'Indisponible':money(visaBalance,currency)}</p></div><button onClick={requestBalance} className=\"grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-blue-950\">{showBalance?<EyeOff size={21}/>:<Eye size={21}/>}</button></div></section>"
if start not in s: raise SystemExit('balance section not found')
s=s.replace(start,"{cardExists&&<>",1)
oldmodal="<SecurityConfirmModal open={!!securityAction} busy={securityBusy} onClose={()=>!securityBusy&&setSecurityAction(null)} onConfirm={confirmSecurity} title={securityAction==='balance'?'Afficher le solde':'Afficher les informations de la carte'} subtitle=\"Entrez le code secret de l’application.\"/>"
newmodal="<SecurityConfirmModal open={!!securityAction} busy={securityBusy} onClose={()=>!securityBusy&&setSecurityAction(null)} onConfirm={confirmSecurity} onBiometric={kind==='local'&&localCard?async()=>{if(securityAction==='balance'){setShowBalance(true);setSecurityAction(null);return}setSecurityBusy(true);try{setLocalSecure(await localCardPairService.revealWithBiometric(localCard.cardId));setDetailsRevealed(true);setSecurityAction(null)}finally{setSecurityBusy(false)}}:securityAction==='balance'?async()=>{setShowBalance(true);setSecurityAction(null)}:undefined} title={securityAction==='balance'?'Afficher le solde':'Afficher les informations de la carte'} subtitle=\"Utilisez votre PIN ou la biométrie de cet appareil.\"/>"
if oldmodal not in s: raise SystemExit('CardDetail modal not found')
s=s.replace(oldmodal,newmodal,1); p.write_text(s)

# CardsHub: compact 3 horizontal tiles with card art cover
p=Path('src/pages/client/CardsHub.tsx'); s=p.read_text()
old="<div className=\"mt-7 grid gap-4 md:grid-cols-3\">\n      <CategoryTile to=\"/client/cards?section=local\" icon={<WalletCards size={27}/>} eyebrow=\"Réseau Market-Cash\" title=\"Market-Cash Locale\" description=\"Cartes USD et CDF pour payer, recharger et retirer chez les agents Market-Cash.\" meta={loadingLocal?'Préparation…':`${localCards.length} carte${localCards.length>1?'s':''} disponible${localCards.length>1?'s':''}`} tone=\"blue\"/>\n      <CategoryTile to=\"/client/cards?section=standard\" icon={<CreditCard size={27}/>} eyebrow=\"Visa\" title=\"Market-Cash Visa Standard\" description=\"Vos cartes Visa Standard, jusqu’à deux cartes par client selon validation.\" meta={loadingVisa?'Chargement…':`${standardCards.length}/2 active${standardCards.length>1?'s':''}`} tone=\"slate\"/>\n      <CategoryTile to=\"/client/cards?section=gold\" icon={<Sparkles size={27}/>} eyebrow=\"Visa Premium\" title=\"Market-Cash Visa Gold\" description=\"Une carte premium émise après vérification KYC et disponibilité du partenaire.\" meta={loadingVisa?'Chargement…':goldCards.length?'Carte active':'Non émise'} tone=\"gold\"/>\n    </div>"
new="<div className=\"mt-6 grid grid-cols-3 gap-2.5 sm:gap-4\">\n      <CategoryTile to=\"/client/cards?section=local\" variant=\"local\" title=\"Locale\" meta={loadingLocal?'…':`${localCards.length}`} />\n      <CategoryTile to=\"/client/cards?section=standard\" variant=\"standard\" title=\"Visa Standard\" meta={loadingVisa?'…':`${standardCards.length}/2`} />\n      <CategoryTile to=\"/client/cards?section=gold\" variant=\"gold\" title=\"Visa Gold\" meta={loadingVisa?'…':goldCards.length?'Active':'—'} />\n    </div>"
if old not in s: raise SystemExit('CardsHub categories block not found')
s=s.replace(old,new,1)
start=s.index("function CategoryTile(")
end=s.index("\n\nfunction LocalSection",start)
newfn="function CategoryTile({to,variant,title,meta}:{to:string;variant:CardProductVariant;title:string;meta:string}){return <Link to={to} className=\"group relative aspect-square min-w-0 overflow-hidden rounded-2xl border bg-slate-900 shadow-sm\"><div className=\"absolute inset-0 scale-[1.55]\"><CardProductFace variant={variant} showRevealButton={false} className=\"h-full w-full rounded-none border-0 shadow-none\"/></div><div className=\"absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/25 to-transparent\"/><ChevronRight className=\"absolute right-2 top-2 text-white/80\" size={17}/><div className=\"absolute inset-x-0 bottom-0 p-2.5 text-white\"><p className=\"text-[10px] font-black leading-tight sm:text-sm\">{title}</p><p className=\"mt-1 text-[9px] font-bold text-white/70\">{meta}</p></div></Link>}"
s=s[:start]+newfn+s[end:]; p.write_text(s)

print('patched')
