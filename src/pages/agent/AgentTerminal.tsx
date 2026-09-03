import React,{useEffect,useRef,useState}from'react';
import{ArrowDownLeft,ArrowUpRight,Camera,CreditCard,KeyRound,Radio,Search,ShieldCheck,UserRound,WalletCards,X}from'lucide-react';
import toast from'react-hot-toast';
import{AgentClientLookup,agentWalletService,LocalCardWithdrawalLookup,WalletServerSnapshot}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

const newKey=()=>`agent_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
const money=(value:number,currency:WalletCurrency)=>currency==='CDF'?`${Number(value||0).toLocaleString('fr-FR')} CDF`:`${Number(value||0).toFixed(2)} USD`;
const amountValue=(value:string)=>Number(String(value||'').replace(',','.'));

function marketCashIdFromPayload(raw:string){
  const text=String(raw||'').trim();
  try{
    const parsed=JSON.parse(text);
    const candidate=String(parsed?.marketCashId||parsed?.walletId||parsed?.id||'').toUpperCase();
    const match=candidate.match(/MCW-[A-F0-9]{10}/);
    if(match)return match[0];
  }catch{}
  return text.toUpperCase().match(/MCW-[A-F0-9]{10}/)?.[0]||'';
}

function cardReferenceFromPayload(raw:string){
  const text=String(raw||'').trim();
  try{
    const parsed=JSON.parse(text);
    const candidate=String(parsed?.cardIdentifier||parsed?.cardNumber||parsed?.cardId||'').trim();
    if(candidate)return candidate;
  }catch{}
  const trackOne=text.match(/%B(\d{12,19})\^/i);
  const trackTwo=text.match(/;(\d{12,19})=/);
  if(trackOne?.[1])return trackOne[1];
  if(trackTwo?.[1])return trackTwo[1];
  const prefixed=text.match(/(?:MARKET-CASH-CARD|MC-CARD)[:|\s-]+([A-Za-z0-9_-]{4,120})/i);
  if(prefixed?.[1])return prefixed[1];
  const digits=text.replace(/\D/g,'');
  if(/^\d{12,19}$/.test(digits))return digits;
  return text;
}

function normalizeLiveCardInput(raw:string){
  if(raw.includes('^')||raw.includes('='))return cardReferenceFromPayload(raw);
  return raw.slice(0,120);
}

export default function AgentTerminal(){
  const[marketCashId,setMarketCashId]=useState('');
  const[client,setClient]=useState<AgentClientLookup|null>(null);
  const[cardReference,setCardReference]=useState('');
  const[withdrawalCard,setWithdrawalCard]=useState<LocalCardWithdrawalLookup|null>(null);
  const[agent,setAgent]=useState<WalletServerSnapshot|null>(null);
  const[currency,setCurrency]=useState<WalletCurrency>('CDF');
  const[amount,setAmount]=useState('');
  const[pin,setPin]=useState('');
  const[mode,setMode]=useState<'cash_in'|'cash_out'>('cash_in');
  const[loading,setLoading]=useState(false);
  const[scannerPurpose,setScannerPurpose]=useState<'deposit'|'withdraw'|null>(null);

  const refreshAgent=()=>agentWalletService.getMyWallets().then(setAgent).catch(()=>{});
  useEffect(()=>{refreshAgent();},[]);

  const switchMode=(next:'cash_in'|'cash_out')=>{
    setMode(next);setClient(null);setWithdrawalCard(null);setAmount('');setPin('');setMarketCashId('');setCardReference('');
  };

  const findClient=async()=>{
    const n=amountValue(amount);
    if(!Number.isFinite(n)||n<=0)return toast.error('Saisissez d’abord le montant du dépôt.');
    setLoading(true);
    try{
      const data=await agentWalletService.lookupAgentClient(marketCashId);
      setClient(data);toast.success('Client Market-Cash trouvé');
    }catch(e:any){setClient(null);toast.error(e?.message||'Client introuvable');}
    finally{setLoading(false)}
  };

  const findCard=async(referenceOverride?:string)=>{
    const reference=String(referenceOverride??cardReference).trim();
    if(!reference)return toast.error('Numéro ou identifiant de carte requis.');
    setLoading(true);
    try{
      const data=await agentWalletService.lookupLocalCardForWithdrawal(reference);
      setCardReference(reference);setWithdrawalCard(data);toast.success('Carte locale reconnue');
    }catch(e:any){setWithdrawalCard(null);toast.error(e?.message||'Carte locale introuvable');}
    finally{setLoading(false)}
  };

  const submitDeposit=async()=>{
    if(!client)return toast.error('Vérifiez d’abord le client.');
    const n=amountValue(amount);
    if(!Number.isFinite(n)||n<=0)return toast.error('Montant invalide');
    if(pin.length<4)return toast.error('Code secret agent requis');
    setLoading(true);
    try{
      const result=await agentWalletService.cashInToMarketCashId({marketCashId:client.marketCashId,currency,amount:n,pin,idempotencyKey:newKey()});
      toast.success(`Dépôt confirmé · ${result.reference}`);
      setAmount('');setPin('');setMarketCashId('');setClient(null);
      await refreshAgent();
    }catch(e:any){toast.error(e?.message||'Dépôt refusé');}
    finally{setLoading(false)}
  };

  const submitWithdrawal=async()=>{
    if(!withdrawalCard)return toast.error('Vérifiez d’abord la carte locale.');
    const n=amountValue(amount);
    if(!Number.isFinite(n)||n<=0)return toast.error('Montant invalide');
    if(pin.length<4)return toast.error('Le client doit saisir son code secret.');
    setLoading(true);
    try{
      const result=await agentWalletService.cashOutFromLocalCard({cardReference:withdrawalCard.cardIdentifier||cardReference,currency,amount:n,clientPin:pin,idempotencyKey:newKey()});
      toast.success(`Retrait confirmé · ${result.reference}`);
      setPin('');setCardReference('');setWithdrawalCard(null);setAmount('');
      await refreshAgent();
    }catch(e:any){toast.error(e?.message||'Retrait refusé');}
    finally{setLoading(false)}
  };

  const scanCardNfc=async()=>{
    const Reader=(globalThis as any).NDEFReader;
    if(!Reader){toast.error('NFC Web non disponible sur ce téléphone ou ce navigateur. Utilisez le numéro de carte ou le QR.');return;}
    try{
      const reader=new Reader();
      const controller=new AbortController();
      await reader.scan({signal:controller.signal});
      toast('Approchez la carte locale Market-Cash du téléphone.');
      reader.onreading=(event:any)=>{
        let raw='';
        try{
          for(const record of event.message?.records||[]){
            if(record.recordType==='text')raw+=new TextDecoder(record.encoding||'utf-8').decode(record.data);
            else if(record.data)raw+=new TextDecoder().decode(record.data);
          }
        }catch{}
        const reference=cardReferenceFromPayload(raw);
        if(!reference){toast.error('Carte NFC lue, mais aucun identifiant Market-Cash reconnu.');return;}
        controller.abort();
        setCardReference(reference);setWithdrawalCard(null);
        toast.success('Carte détectée par NFC');
        void findCard(reference);
      };
      reader.onreadingerror=()=>toast.error('Lecture NFC impossible. Réessayez ou saisissez la carte manuellement.');
    }catch(e:any){toast.error(e?.message||'Impossible d’activer la lecture NFC.');}
  };

  const handleScanResult=(raw:string)=>{
    if(scannerPurpose==='deposit'){
      const id=marketCashIdFromPayload(raw);
      if(!id){toast.error('Ce QR ne contient pas un ID MCW valide.');return;}
      setMarketCashId(id);setClient(null);toast.success('ID Market-Cash scanné');
    }else if(scannerPurpose==='withdraw'){
      const reference=cardReferenceFromPayload(raw);
      if(!reference){toast.error('Ce QR ne contient pas une carte Market-Cash valide.');return;}
      setCardReference(reference);setWithdrawalCard(null);toast.success('Carte scannée');
      void findCard(reference);
    }
    setScannerPurpose(null);
  };

  const float=agent?.wallets?.[currency]?.availableBalance||0;

  return <div className="mx-auto max-w-xl space-y-4 p-4 md:p-8">
    <header><p className="text-xs font-black uppercase tracking-wider text-amber-600">Terminal Market-Cash · espèces</p><h1 className="text-2xl font-black text-blue-950">Dépôt & retrait client</h1><p className="mt-1 text-sm leading-6 text-slate-500">Dépôt : ID exact MCW du client + montant, avec confirmation par le code agent. Retrait : carte locale Market-Cash + montant, puis le client saisit son propre code au terminal.</p></header>

    <section className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1"><button onClick={()=>switchMode('cash_in')} className={`flex items-center justify-center gap-2 rounded-xl p-3 text-sm font-black ${mode==='cash_in'?'bg-emerald-600 text-white shadow-sm':'text-slate-600'}`}><ArrowDownLeft size={18}/> Dépôt</button><button onClick={()=>switchMode('cash_out')} className={`flex items-center justify-center gap-2 rounded-xl p-3 text-sm font-black ${mode==='cash_out'?'bg-amber-400 text-blue-950 shadow-sm':'text-slate-600'}`}><ArrowUpRight size={18}/> Retrait</button></section>

    <section className="rounded-3xl bg-blue-950 p-5 text-white shadow-lg"><div className="flex items-start justify-between"><div><p className="text-[10px] font-black uppercase tracking-wider text-blue-200">Agent flottant disponible</p><p className="mt-1 text-3xl font-black">{money(Number(float),currency)}</p></div><WalletCards className="text-amber-400"/></div><div className="mt-4 inline-flex rounded-xl bg-white/10 p-1"><button onClick={()=>setCurrency('CDF')} className={`rounded-lg px-4 py-2 text-xs font-black ${currency==='CDF'?'bg-white text-blue-950':''}`}>CDF</button><button onClick={()=>setCurrency('USD')} className={`rounded-lg px-4 py-2 text-xs font-black ${currency==='USD'?'bg-white text-blue-950':''}`}>USD</button></div></section>

    {mode==='cash_in'?<DepositPanel marketCashId={marketCashId} setMarketCashId={value=>{setMarketCashId(value);setClient(null)}} client={client} loading={loading} onFind={findClient} currency={currency} amount={amount} setAmount={setAmount} pin={pin} setPin={setPin} onSubmit={submitDeposit} onScan={()=>setScannerPurpose('deposit')}/>:<WithdrawalPanel cardReference={cardReference} setCardReference={value=>{setCardReference(value);setWithdrawalCard(null)}} card={withdrawalCard} loading={loading} onFind={()=>void findCard()} currency={currency} amount={amount} setAmount={setAmount} pin={pin} setPin={setPin} onSubmit={submitWithdrawal} onScan={()=>setScannerPurpose('withdraw')} onNfc={scanCardNfc}/>} 

    {scannerPurpose&&<QrScannerModal onValue={handleScanResult} onClose={()=>setScannerPurpose(null)}/>} 
  </div>;
}

function DepositPanel({marketCashId,setMarketCashId,client,loading,onFind,currency,amount,setAmount,pin,setPin,onSubmit,onScan}:{marketCashId:string;setMarketCashId:(v:string)=>void;client:AgentClientLookup|null;loading:boolean;onFind:()=>void;currency:WalletCurrency;amount:string;setAmount:(v:string)=>void;pin:string;setPin:(v:string)=>void;onSubmit:()=>void;onScan:()=>void}){
  const n=amountValue(amount);
  const ready=/^MCW-[A-F0-9]{10}$/.test(marketCashId.trim().toUpperCase())&&Number.isFinite(n)&&n>0;
  return <section className="space-y-4 rounded-3xl border bg-white p-5 shadow-sm">
    <div><label className="text-xs font-black text-slate-500">ID Market-Cash exact du client</label><div className="mt-2 flex gap-2"><input value={marketCashId} onChange={e=>setMarketCashId(e.target.value.toUpperCase().replace(/\s/g,'').slice(0,14))} placeholder="MCW-XXXXXXXXXX" className="min-w-0 flex-1 rounded-2xl border p-3 font-mono font-black uppercase outline-none focus:border-blue-500"/><button type="button" onClick={onScan} className="grid w-14 place-items-center rounded-2xl border bg-blue-50 text-blue-950" title="Scanner le QR du wallet"><Camera size={20}/></button></div><p className="mt-2 text-[11px] leading-5 text-slate-500">Le terminal utilise l’identifiant réservé <b>MCW-…</b>. Le numéro de recharge n’est plus demandé ici. Vous pouvez aussi scanner le QR du wallet.</p></div>
    <label className="block"><span className="text-xs font-black text-slate-500">Montant à déposer ({currency})</span><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={currency==='CDF'?'Ex. 50000':'Ex. 10'} className="mt-1 w-full rounded-2xl border p-4 text-xl font-black outline-none focus:border-blue-500"/></label>
    <button disabled={loading||!ready} onClick={onFind} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-950 py-3 font-black text-white disabled:opacity-40"><Search size={18}/>{loading?'Vérification…':'Vérifier le client'}</button>
    {client&&<><ClientCard client={client}/><AgentPin pin={pin} setPin={setPin}/><div className="flex gap-2 rounded-2xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900"><ShieldCheck size={16} className="mt-0.5 shrink-0"/>L’agent confirme le dépôt avec son code secret. Le serveur débite le float agent et crédite le wallet {currency} du client.</div><button disabled={loading||pin.length<4} onClick={onSubmit} className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-50">{loading?'Traitement…':`Confirmer le dépôt · ${money(n,currency)}`}</button></>}
  </section>;
}

function WithdrawalPanel({cardReference,setCardReference,card,loading,onFind,currency,amount,setAmount,pin,setPin,onSubmit,onScan,onNfc}:{cardReference:string;setCardReference:(v:string)=>void;card:LocalCardWithdrawalLookup|null;loading:boolean;onFind:()=>void;currency:WalletCurrency;amount:string;setAmount:(v:string)=>void;pin:string;setPin:(v:string)=>void;onSubmit:()=>void;onScan:()=>void;onNfc:()=>void}){
  const n=amountValue(amount);
  const ready=cardReference.trim().length>=4&&Number.isFinite(n)&&n>0;
  return <section className="space-y-4 rounded-3xl border bg-white p-5 shadow-sm">
    <label className="block"><span className="text-xs font-black text-slate-500">Montant à retirer ({currency})</span><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={currency==='CDF'?'Ex. 50000':'Ex. 20'} className="mt-1 w-full rounded-2xl border p-4 text-xl font-black outline-none focus:border-blue-500"/></label>
    <div><label className="text-xs font-black text-slate-500">Numéro / identifiant de la carte locale Market-Cash</label><div className="mt-2 grid grid-cols-[1fr_52px_52px] gap-2"><input value={cardReference} onChange={e=>setCardReference(normalizeLiveCardInput(e.target.value))} autoComplete="off" placeholder="Numéro de carte" className="min-w-0 rounded-2xl border p-3 font-mono outline-none focus:border-blue-500"/><button type="button" onClick={onNfc} className="grid place-items-center rounded-2xl border bg-amber-50 text-amber-800" title="Lire la carte par NFC"><Radio size={20}/></button><button type="button" onClick={onScan} className="grid place-items-center rounded-2xl border bg-blue-50 text-blue-950" title="Scanner le QR de la carte"><Camera size={20}/></button></div><p className="mt-2 text-[11px] leading-5 text-slate-500">Le client peut présenter sa carte : saisie du numéro, lecteur/swipe compatible, NFC Market-Cash ou QR. Les données reconnues remplissent ce champ automatiquement.</p></div>
    <button disabled={loading||!ready} onClick={onFind} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-950 py-3 font-black text-white disabled:opacity-40"><Search size={18}/>{loading?'Lecture…':'Vérifier la carte'}</button>
    {card&&<><CardSummary card={card}/><ClientPin pin={pin} setPin={setPin}/><div className="flex gap-2 rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-950"><ShieldCheck size={16} className="mt-0.5 shrink-0"/><span>Le retrait est débité de la <b>carte locale {currency}</b>, pas du wallet principal. Passez le terminal au client pour qu’il saisisse lui-même son code secret avant de remettre les espèces.</span></div><button disabled={loading||pin.length<4} onClick={onSubmit} className="w-full rounded-2xl bg-amber-400 py-4 font-black text-blue-950 disabled:opacity-50">{loading?'Traitement…':`Confirmer le retrait · ${money(n,currency)}`}</button></>}
  </section>;
}

function ClientCard({client}:{client:AgentClientLookup}){return <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-emerald-700"><UserRound/></div><div className="min-w-0"><h2 className="truncate font-black text-slate-950">{client.displayName}</h2><p className="font-mono text-xs font-black text-blue-950">{client.marketCashId}</p><p className="text-[11px] text-slate-500">{client.phone||'Téléphone non renseigné'}</p></div></div></div>}

function CardSummary({card}:{card:LocalCardWithdrawalLookup}){return <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-amber-700"><CreditCard/></div><div className="min-w-0"><h2 className="truncate font-black text-slate-950">{card.cardHolder||card.clientName}</h2><p className="text-sm font-black text-blue-950">{card.maskedNumber}</p><p className="truncate font-mono text-[10px] text-slate-500">{card.cardIdentifier}</p></div></div></div>}

function AgentPin({pin,setPin}:{pin:string;setPin:(v:string)=>void}){return <label className="block"><span className="flex items-center gap-1 text-xs font-black text-slate-500"><KeyRound size={14}/> Code secret agent</span><input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} type="password" inputMode="numeric" placeholder="••••" className="mt-1 w-full rounded-2xl border p-4 text-center font-black tracking-[.35em] outline-none focus:border-blue-500"/></label>}

function ClientPin({pin,setPin}:{pin:string;setPin:(v:string)=>void}){return <label className="block rounded-2xl border-2 border-amber-300 bg-white p-3"><span className="flex items-center justify-center gap-2 text-xs font-black uppercase text-amber-800"><KeyRound size={15}/> Code secret du client</span><input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} type="password" inputMode="numeric" autoComplete="off" placeholder="••••" className="mt-2 w-full rounded-xl border p-4 text-center text-xl font-black tracking-[.35em] outline-none focus:border-amber-500"/><p className="mt-2 text-center text-[10px] text-slate-500">Le client saisit lui-même son code au terminal. L’agent ne doit pas le demander à voix haute.</p></label>}

function QrScannerModal({onValue,onClose}:{onValue:(value:string)=>void;onClose:()=>void}){
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const[message,setMessage]=useState('Ouverture de la caméra…');

  useEffect(()=>{
    let stream:MediaStream|null=null;
    let frame=0;
    let stopped=false;
    const start=async()=>{
      try{
        const Detector=(globalThis as any).BarcodeDetector;
        if(!Detector)throw new Error('QR_NOT_SUPPORTED');
        stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
        const video=videoRef.current;
        if(!video)return;
        video.srcObject=stream;
        await video.play();
        const detector=new Detector({formats:['qr_code']});
        setMessage('Placez le QR dans le cadre');
        const loop=async()=>{
          if(stopped)return;
          try{
            const codes=await detector.detect(video);
            const raw=String(codes?.[0]?.rawValue||'');
            if(raw){stopped=true;onValue(raw);return;}
          }catch{}
          frame=requestAnimationFrame(loop);
        };
        frame=requestAnimationFrame(loop);
      }catch(e:any){
        setMessage(e?.message==='QR_NOT_SUPPORTED'?'Scan QR non pris en charge par ce navigateur.':'Caméra indisponible. Autorisez la caméra ou saisissez la donnée manuellement.');
      }
    };
    void start();
    return()=>{stopped=true;cancelAnimationFrame(frame);stream?.getTracks().forEach(track=>track.stop());};
  },[]);

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/80 p-4"><div className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase text-blue-950">Scanner QR Market-Cash</p><p className="text-[11px] text-slate-500">{message}</p></div><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700"><X size={20}/></button></div><div className="relative mt-4 overflow-hidden rounded-2xl bg-black"><video ref={videoRef} playsInline muted className="aspect-square w-full object-cover"/><div className="pointer-events-none absolute inset-8 rounded-3xl border-2 border-white/80"/></div><button onClick={onClose} className="mt-4 w-full rounded-2xl bg-slate-100 py-3 text-sm font-black text-slate-700">Annuler</button></div></div>;
}
