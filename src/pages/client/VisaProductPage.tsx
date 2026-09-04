import React,{useEffect,useMemo,useState}from'react';
import{ArrowLeft,CheckCircle2,Copy,CreditCard,Eye,EyeOff,FileCheck2,ShieldCheck,Truck,X,Zap}from'lucide-react';
import{Link}from'react-router-dom';
import{collection,doc,onSnapshot,query,setDoc,where}from'firebase/firestore';
import{getDownloadURL,ref,uploadBytes}from'firebase/storage';
import toast from'react-hot-toast';
import{auth,db,storage}from'../../firebase/config';
import{useAuthStore}from'../../store/authStore';
import{cardService,CardPricingSettings,DEFAULT_CARD_PRICING}from'../../services/cardService';
import{PaymentMethodItem}from'../../types';
import{removeUndefined}from'../../lib/firestoreUtils';

type VisaTier='standard'|'gold';
type FlowStep='options'|'identity'|'payment'|'proof'|'done';
const MAX_FILE=5*1024*1024;
const IMAGE_TYPES=['image/jpeg','image/jpg','image/png','image/webp'];

const masked=(value?:string)=>{const digits=String(value||'').replace(/\D/g,'');return digits?`•••• •••• •••• ${digits.slice(-4)}`:'•••• •••• •••• ••••'};
const titleFor=(tier:VisaTier)=>tier==='gold'?'Market-Cash Visa Gold':'Market-Cash Visa Standard';

async function sha256(value:string){
  const bytes=new TextEncoder().encode(value);const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

export default function VisaProductPage({tier}:{tier:VisaTier}){
  const{user}=useAuthStore();
  const maxCards=tier==='gold'?1:4;
  const[cards,setCards]=useState<any[]>([]);
  const[requests,setRequests]=useState<any[]>([]);
  const[selectedId,setSelectedId]=useState('');
  const[revealed,setRevealed]=useState<Record<string,boolean>>({});
  const[revealId,setRevealId]=useState('');
  const[revealPin,setRevealPin]=useState('');
  const[flow,setFlow]=useState<FlowStep|null>(null);
  const[pricing,setPricing]=useState<CardPricingSettings>(DEFAULT_CARD_PRICING);
  const[methods,setMethods]=useState<PaymentMethodItem[]>([]);
  const[printRequested,setPrintRequested]=useState(false);
  const[urgent,setUrgent]=useState(false);
  const[identityFile,setIdentityFile]=useState<File|null>(null);
  const[proofFile,setProofFile]=useState<File|null>(null);
  const[busy,setBusy]=useState(false);
  const[rechargeCard,setRechargeCard]=useState<any|null>(null);
  const[deliveryCard,setDeliveryCard]=useState<any|null>(null);
  const[deliveryDate,setDeliveryDate]=useState('');
  const[deliveryAddress,setDeliveryAddress]=useState('');
  const[deliveryPhone,setDeliveryPhone]=useState(user?.phone||'');

  useEffect(()=>{
    if(!user?.uid)return;
    const stopCards=onSnapshot(query(collection(db,'cards'),where('userId','==',user.uid)),snap=>{
      const all=snap.docs.map(d=>({id:d.id,...d.data()})).filter((card:any)=>String(card.network||'visa').toLowerCase()==='visa');
      const filtered=all.filter((card:any)=>tier==='gold'?String(card.visaTier||'').toLowerCase()==='gold':String(card.visaTier||'standard').toLowerCase()!=='gold');
      setCards(filtered);setSelectedId(current=>filtered.some((c:any)=>c.id===current)?current:(filtered[0]?.id||''));
    });
    const stopRequests=onSnapshot(query(collection(db,'card_purchase_requests'),where('userId','==',user.uid)),snap=>{
      setRequests(snap.docs.map(d=>({id:d.id,...d.data()})).filter((r:any)=>tier==='gold'?String(r.visaTier||'').toLowerCase()==='gold':String(r.visaTier||'standard').toLowerCase()!=='gold').sort((a:any,b:any)=>Number(b.createdAt||0)-Number(a.createdAt||0)));
    });
    const stopPricing=cardService.subscribePricing(setPricing);
    const stopMethods=cardService.subscribePaymentMethods(list=>setMethods(list.filter(m=>m.active)));
    return()=>{stopCards();stopRequests();stopPricing();stopMethods()};
  },[tier,user?.uid]);

  const pendingCount=requests.filter(r=>r.status==='pending').length;
  const canObtain=cards.length+pendingCount<maxCards;
  const selected=cards.find(c=>c.id===selectedId)||cards[0]||null;
  const actualPrice=pricing.cardPrice===null?null:(pricing.cardPrice||0)+(printRequested?(pricing.printingPrice||0):0)+(urgent?(pricing.urgencyFee||0):0);
  const normalIdentityRequired=!urgent;

  const resetFlow=()=>{setFlow(null);setPrintRequested(false);setUrgent(false);setIdentityFile(null);setProofFile(null)};
  const openObtain=()=>{if(!canObtain)return toast.error(`Limite atteinte : ${maxCards} carte${maxCards>1?'s':''} maximum.`);setPrintRequested(false);setUrgent(false);setIdentityFile(null);setProofFile(null);setFlow('options')};

  const revealCard=async()=>{
    if(!revealId||!user||revealPin.length<4)return;
    setBusy(true);
    try{const hash=await sha256(revealPin);if(user.pinHash&&hash!==user.pinHash)throw new Error('PIN');setRevealed(v=>({...v,[revealId]:true}));setRevealId('');setRevealPin('');toast.success('Détails de la carte affichés.');}catch{toast.error('Code secret incorrect.');setRevealPin('')}finally{setBusy(false)}
  };

  const validateImage=(file:File|null,label:string)=>{
    if(!file)return false;if(!IMAGE_TYPES.includes(file.type.toLowerCase())){toast.error(`${label} : format image non supporté.`);return false}if(file.size>MAX_FILE){toast.error(`${label} : 5 Mo maximum.`);return false}return true;
  };

  const submitRequest=async()=>{
    if(!user||!auth.currentUser||!proofFile||actualPrice===null||actualPrice<=0)return;
    if(!canObtain)return toast.error('La limite de cartes est atteinte.');
    if(normalIdentityRequired&&!identityFile)return toast.error("Une pièce d'identité est obligatoire.");
    if(!validateImage(proofFile,'Preuve de paiement'))return;
    if(identityFile&&!validateImage(identityFile,"Pièce d'identité"))return;
    setBusy(true);
    try{
      const uid=auth.currentUser.uid;const now=Date.now();
      let identityUrl='';
      if(identityFile){const r=ref(storage,`identity-proofs/${uid}/${now}_${identityFile.name.replace(/[^a-zA-Z0-9.-]/g,'_')}`);await uploadBytes(r,identityFile,{contentType:identityFile.type});identityUrl=await getDownloadURL(r)}
      const p=ref(storage,`payment-proofs/${uid}/${now}_${proofFile.name.replace(/[^a-zA-Z0-9.-]/g,'_')}`);await uploadBytes(p,proofFile,{contentType:proofFile.type});const proofUrl=await getDownloadURL(p);
      const id=doc(collection(db,'card_purchase_requests')).id;
      const payload:any=removeUndefined({id,userId:uid,fullName:user.displayName||'Client Market-Cash',userName:user.displayName||'Client Market-Cash',userEmail:user.email||'',phone:user.phone||'',userPhone:user.phone||'',cardType:'virtual',visaTier:tier,cardName:titleFor(tier),provider:tier==='standard'?'vodacom':'market_cash_gold',physicalOption:urgent?'urgent':printRequested?'normal':'none',printRequested,urgentProcessing:urgent,isUrgent:urgent,identityRequired:normalIdentityRequired,identityProofUrl:identityUrl||undefined,identityProofFileName:identityFile?.name,identityVerified:false,pricingBreakdown:{cardPrice:pricing.cardPrice||0,printingPrice:printRequested?(pricing.printingPrice||0):0,urgencyFee:urgent?(pricing.urgencyFee||0):0},amount:actualPrice,currency:pricing.currency||'USD',paymentMethod:'Non spécifié',transactionReference:'Non spécifié',paymentReference:'Non spécifié',proofUrl,paymentProofUrl:proofUrl,proofFileName:proofFile.name,status:'pending',createdAt:now,updatedAt:now});
      await setDoc(doc(db,'card_purchase_requests',id),payload);setFlow('done');toast.success('Demande de carte enregistrée.');
    }catch(error:any){toast.error(error?.message||"Impossible d'enregistrer la demande.")}finally{setBusy(false)}
  };

  const submitDelivery=async()=>{
    if(!deliveryCard||!user||!deliveryDate||deliveryAddress.trim().length<5||deliveryPhone.trim().length<5)return;
    setBusy(true);
    try{await cardService.submitDeliveryRequest({cardId:deliveryCard.id,cardIdentifier:deliveryCard.cardIdentifier||deliveryCard.id,cardHolder:deliveryCard.cardHolder||user.displayName||'Client',userId:user.uid,userName:user.displayName||'Client',userEmail:user.email||'',userPhone:deliveryPhone.trim(),whatsapp:deliveryPhone.trim(),deliveryDate,deliveryAddress:deliveryAddress.trim()});toast.success('Demande de livraison envoyée.');setDeliveryCard(null);setDeliveryDate('');setDeliveryAddress('');}catch(error:any){toast.error(error?.message||'Demande de livraison impossible.')}finally{setBusy(false)}
  };

  return <div className="mx-auto max-w-4xl space-y-5 p-4 pb-28 md:p-8">
    <Link to="/client/cards" className="inline-flex items-center gap-2 text-sm font-black text-slate-500"><ArrowLeft size={17}/>Retour aux cartes</Link>
    <header className={`rounded-3xl p-5 ${tier==='gold'?'bg-slate-950 text-white':'bg-blue-50 text-blue-950'}`}><p className={`text-[10px] font-black uppercase tracking-[.18em] ${tier==='gold'?'text-amber-300':'text-blue-700'}`}>{tier==='gold'?'Produit Gold':'Produit international Standard'}</p><div className="mt-2 flex items-end justify-between gap-4"><div><h1 className="text-3xl font-black">{titleFor(tier)}</h1><p className={`mt-2 text-sm leading-6 ${tier==='gold'?'text-slate-300':'text-slate-600'}`}>{tier==='standard'?'Visa Standard : jusqu’à 4 cartes par client. Les cartes Standard conservent le circuit prévu avec le stock Vodacom.':'Visa Gold : une seule carte Gold par client.'}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${tier==='gold'?'bg-amber-300 text-slate-950':'bg-white text-blue-900'}`}>{cards.length} / {maxCards}</span></div></header>

    {cards.length>0?<section className="space-y-4">
      {cards.length>1&&<div className="flex gap-2 overflow-x-auto pb-1">{cards.map(card=><button key={card.id} onClick={()=>setSelectedId(card.id)} className={`shrink-0 rounded-2xl border px-4 py-3 text-left ${selectedId===card.id?'border-blue-600 bg-blue-50':'bg-white'}`}><p className="font-mono text-xs font-black">{masked(card.cardNumber)}</p><p className="mt-1 text-[10px] text-slate-500">{card.cardIdentifier}</p></button>)}</div>}
      {selected&&<div className={`relative overflow-hidden rounded-[1.8rem] border p-5 text-white shadow-xl ${tier==='gold'?'border-amber-300/30 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950':'border-blue-300/30 bg-gradient-to-br from-blue-950 via-indigo-900 to-blue-700'}`}><div className="flex justify-between"><div><p className="font-black tracking-wide">MARKET<span className="text-amber-300">-CASH</span></p><p className="mt-1 text-[8px] font-black uppercase tracking-[.18em] text-white/65">{tier==='gold'?'Visa Gold':'Visa Standard'}</p></div><button onClick={()=>revealed[selected.id]?setRevealed(v=>({...v,[selected.id]:false})):(setRevealId(selected.id),setRevealPin(''))} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10">{revealed[selected.id]?<EyeOff size={18}/>:<Eye size={18}/>}</button></div><div className="mt-12"><div className="h-9 w-12 rounded-lg bg-gradient-to-br from-amber-100 via-amber-300 to-amber-500"/><p className="mt-5 font-mono text-xl font-black tracking-[.13em]">{revealed[selected.id]?String(selected.cardNumber||'').replace(/(\d{4})(?=\d)/g,'$1 '):masked(selected.cardNumber)}</p></div><div className="mt-8 grid grid-cols-[1fr_auto_auto] items-end gap-4 text-xs"><div><p className="text-[7px] uppercase text-white/60">Titulaire</p><p className="mt-1 font-black">{selected.cardHolder||user?.displayName}</p></div><div><p className="text-[7px] uppercase text-white/60">Expire</p><p className="mt-1 font-black">{revealed[selected.id]?(selected.expiryEnd||selected.expiry||'--/--'):'••/••'}</p><p className="mt-1 text-[8px] text-white/60">CVV {revealed[selected.id]?(selected.cvv||'•••'):'•••'}</p></div><p className={`text-lg font-black italic ${tier==='gold'?'text-amber-300':'text-white'}`}>VISA</p></div></div>}
      {selected&&<div className="grid gap-3 sm:grid-cols-3"><button onClick={()=>setRechargeCard(selected)} className="rounded-2xl bg-amber-400 p-4 text-left text-blue-950"><CreditCard size={20}/><p className="mt-3 font-black">Recharger</p><p className="mt-1 text-[11px]">{tier==='standard'?'Circuit Vodacom':'Coordonnées de la carte'}</p></button><button onClick={()=>{setDeliveryCard(selected);setDeliveryPhone(user?.phone||'')}} className="rounded-2xl border bg-white p-4 text-left text-blue-950"><Truck size={20}/><p className="mt-3 font-black">Carte physique</p><p className="mt-1 text-[11px] text-slate-500">Préparer une livraison</p></button><div className="rounded-2xl border bg-white p-4 text-blue-950"><ShieldCheck size={20}/><p className="mt-3 font-black">Sécurité</p><p className="mt-1 text-[11px] text-slate-500">Détails protégés par code secret</p></div></div>}
    </section>:<section className="rounded-3xl border bg-white p-6 text-center"><CreditCard className="mx-auto text-blue-600" size={42}/><h2 className="mt-4 text-xl font-black text-slate-950">Aucune {tier==='gold'?'Visa Gold':'Visa Standard'} attribuée</h2><p className="mt-2 text-sm text-slate-500">La carte apparaîtra ici après validation et attribution.</p></section>}

    <section className="rounded-3xl border bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-950">Obtenir une carte</h2><p className="mt-1 text-xs text-slate-500">{canObtain?`${maxCards-cards.length-pendingCount} place${maxCards-cards.length-pendingCount>1?'s':''} disponible${maxCards-cards.length-pendingCount>1?'s':''}.`:'Limite atteinte ou demande déjà en cours.'}</p></div><button disabled={!canObtain} onClick={openObtain} className={`rounded-2xl px-5 py-3 text-sm font-black disabled:opacity-40 ${tier==='gold'?'bg-amber-400 text-slate-950':'bg-blue-600 text-white'}`}>Obtenir une carte</button></div>{requests.length>0&&<div className="mt-4 space-y-2 border-t pt-4">{requests.slice(0,4).map(r=><div key={r.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs"><span className="font-bold">{r.cardName||titleFor(tier)}</span><span className={`font-black ${r.status==='approved'?'text-emerald-700':r.status==='rejected'?'text-red-600':'text-amber-700'}`}>{r.status==='approved'?'Approuvée':r.status==='rejected'?'Refusée':'En traitement'}</span></div>)}</div>}</section>

    {flow&&<div className="fixed inset-0 z-[140] grid place-items-center bg-slate-950/70 p-3 backdrop-blur-sm"><div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider text-blue-700">{titleFor(tier)}</p><h2 className="mt-1 text-xl font-black">Obtenir une carte</h2></div><button onClick={resetFlow} className="rounded-xl bg-slate-100 p-2"><X size={18}/></button></div>
      {flow==='options'&&<div className="mt-5 space-y-3"><div className="rounded-2xl bg-blue-50 p-4"><div className="flex justify-between"><span className="font-black">Carte</span><b>{pricing.cardPrice??'—'} {pricing.currency}</b></div></div><button disabled={pricing.printingPrice===null} onClick={()=>setPrintRequested(v=>!v)} className={`w-full rounded-2xl border-2 p-4 text-left ${printRequested?'border-amber-500 bg-amber-50':'border-slate-200'}`}><div className="flex justify-between"><span><b>Impression physique</b><small className="mt-1 block text-slate-500">Option PVC / livraison</small></span><b>+{pricing.printingPrice??'—'} {pricing.currency}</b></div></button>{tier==='standard'&&<button disabled={pricing.urgencyFee===null} onClick={()=>setUrgent(v=>!v)} className={`w-full rounded-2xl border-2 p-4 text-left ${urgent?'border-red-500 bg-red-50':'border-slate-200'}`}><div className="flex justify-between"><span><b>Traitement urgent</b><small className="mt-1 block text-slate-500">Attribution rapide depuis le stock Visa Standard Vodacom.</small></span><Zap size={19}/></div></button>}<div className="rounded-2xl bg-slate-950 p-4 text-white"><div className="flex justify-between"><span>Total</span><b className="text-amber-300">{actualPrice??'—'} {pricing.currency}</b></div></div><button disabled={actualPrice===null} onClick={()=>setFlow('identity')} className="w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40">Continuer</button></div>}
      {flow==='identity'&&<div className="mt-5 space-y-4"><div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Nom : <b>{user?.displayName}</b><br/>Téléphone : <b>{user?.phone||'À compléter dans le profil'}</b></div>{normalIdentityRequired?<label className="block rounded-2xl border-2 border-dashed p-4"><span className="font-black">Pièce d’identité obligatoire</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setIdentityFile(e.target.files?.[0]||null)} className="mt-3 block w-full text-sm"/></label>:<div className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-800">Traitement urgent Standard : identité non exigée dans ce parcours existant.</div>}<div className="grid grid-cols-2 gap-3"><button onClick={()=>setFlow('options')} className="rounded-2xl bg-slate-100 py-3 font-black">Retour</button><button disabled={normalIdentityRequired&&!identityFile} onClick={()=>setFlow('payment')} className="rounded-2xl bg-blue-950 py-3 font-black text-white disabled:opacity-40">Continuer</button></div></div>}
      {flow==='payment'&&<div className="mt-5 space-y-4"><div className="rounded-2xl bg-blue-950 p-4 text-white"><div className="flex justify-between"><span>Montant</span><b className="text-amber-300">{actualPrice} {pricing.currency}</b></div></div><div className="space-y-2">{methods.map(m=><div key={m.id} className="rounded-2xl border bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">{m.network}</p><p className="mt-1 text-lg font-black text-blue-950">{m.number}</p><p className="text-xs text-slate-500">{m.beneficiary}</p></div>)}{methods.length===0&&<p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">Aucun moyen de paiement actif.</p>}</div><div className="grid grid-cols-2 gap-3"><button onClick={()=>setFlow('identity')} className="rounded-2xl bg-slate-100 py-3 font-black">Retour</button><button disabled={!methods.length} onClick={()=>setFlow('proof')} className="rounded-2xl bg-blue-950 py-3 font-black text-white disabled:opacity-40">Paiement effectué</button></div></div>}
      {flow==='proof'&&<div className="mt-5 space-y-4"><label className="block rounded-2xl border-2 border-dashed p-4"><span className="font-black">Preuve de paiement obligatoire</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setProofFile(e.target.files?.[0]||null)} className="mt-3 block w-full text-sm"/></label><div className="grid grid-cols-2 gap-3"><button onClick={()=>setFlow('payment')} disabled={busy} className="rounded-2xl bg-slate-100 py-3 font-black">Retour</button><button onClick={()=>void submitRequest()} disabled={!proofFile||busy} className="rounded-2xl bg-emerald-600 py-3 font-black text-white disabled:opacity-40">{busy?'Envoi…':'Confirmer la demande'}</button></div></div>}
      {flow==='done'&&<div className="py-10 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={52}/><h3 className="mt-4 text-2xl font-black">Demande enregistrée</h3><p className="mt-2 text-sm text-slate-500">Vous serez informé après vérification et attribution.</p><button onClick={resetFlow} className="mt-6 w-full rounded-2xl bg-blue-950 py-4 font-black text-white">Fermer</button></div>}
    </div></div>}

    {revealId&&<div className="fixed inset-0 z-[150] grid place-items-center bg-slate-950/70 p-4"><div className="w-full max-w-sm rounded-3xl bg-white p-6"><h2 className="text-center text-xl font-black">Afficher les détails</h2><p className="mt-2 text-center text-xs text-slate-500">Confirmez avec votre code secret.</p><input autoFocus value={revealPin} onChange={e=>setRevealPin(e.target.value.replace(/\D/g,'').slice(0,6))} type="password" inputMode="numeric" placeholder="••••" className="mt-5 w-full rounded-2xl border p-4 text-center text-xl font-black tracking-[.4em]"/><div className="mt-4 grid grid-cols-2 gap-3"><button onClick={()=>{setRevealId('');setRevealPin('')}} className="rounded-2xl bg-slate-100 py-3 font-black">Annuler</button><button disabled={revealPin.length<4||busy} onClick={()=>void revealCard()} className="rounded-2xl bg-blue-950 py-3 font-black text-white disabled:opacity-40">Confirmer</button></div></div></div>}

    {rechargeCard&&<div className="fixed inset-0 z-[150] grid place-items-center bg-slate-950/70 p-4"><div className="w-full max-w-sm rounded-3xl bg-white p-6"><div className="flex justify-between"><h2 className="text-xl font-black">Recharger la Visa</h2><button onClick={()=>setRechargeCard(null)}><X/></button></div><p className="mt-3 text-sm leading-6 text-slate-500">{tier==='standard'?'La Visa Standard conserve le parcours de recharge prévu avec Vodacom. Utilisez le numéro de recharge associé à cette carte.':'Utilisez les coordonnées de recharge associées à votre Visa Gold.'}</p><div className="mt-4 rounded-2xl bg-blue-950 p-5 text-white"><p className="text-[10px] font-black uppercase text-amber-300">Numéro de recharge</p><p className="mt-2 font-mono text-2xl font-black tracking-wider">{rechargeCard.rechargeNumber||'Non configuré'}</p><p className="mt-2 text-xs text-blue-200">{tier==='standard'?'Fournisseur : Vodacom':'Produit : Visa Gold'}</p></div>{rechargeCard.rechargeNumber&&<button onClick={()=>{navigator.clipboard.writeText(rechargeCard.rechargeNumber);toast.success('Numéro copié.')}} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 py-3 font-black text-blue-950"><Copy size={17}/>Copier</button>}</div></div>}

    {deliveryCard&&<div className="fixed inset-0 z-[150] grid place-items-center bg-slate-950/70 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6"><div className="flex justify-between"><h2 className="text-xl font-black">Préparer la livraison</h2><button onClick={()=>setDeliveryCard(null)}><X/></button></div><label className="mt-5 block text-xs font-black uppercase text-slate-500">Date souhaitée</label><input type="date" min={new Date().toISOString().split('T')[0]} value={deliveryDate} onChange={e=>setDeliveryDate(e.target.value)} className="mt-2 w-full rounded-2xl border p-4"/><label className="mt-4 block text-xs font-black uppercase text-slate-500">Adresse</label><input value={deliveryAddress} onChange={e=>setDeliveryAddress(e.target.value)} className="mt-2 w-full rounded-2xl border p-4"/><label className="mt-4 block text-xs font-black uppercase text-slate-500">WhatsApp</label><input value={deliveryPhone} onChange={e=>setDeliveryPhone(e.target.value)} className="mt-2 w-full rounded-2xl border p-4"/><button disabled={busy||!deliveryDate||deliveryAddress.trim().length<5||deliveryPhone.trim().length<5} onClick={()=>void submitDelivery()} className="mt-5 w-full rounded-2xl bg-blue-950 py-4 font-black text-white disabled:opacity-40"><Truck className="mr-2 inline" size={17}/>Confirmer la demande</button></div></div>}
  </div>;
}
