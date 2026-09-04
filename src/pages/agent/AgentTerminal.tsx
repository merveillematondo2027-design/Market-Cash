import React,{useRef,useState}from'react';
import{ArrowDownLeft,ArrowUpRight,Camera,CreditCard,KeyRound,Radio,QrCode,Search,UserRound,X}from'lucide-react';
import toast from'react-hot-toast';
import{AgentClientLookup,agentWalletService,LocalCardWithdrawalLookup}from'../../services/agentWalletService';
import{WalletCurrency}from'../../types/wallet';

const newKey=()=>`agent_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
const money=(value:number,currency:WalletCurrency)=>currency==='CDF'?`${Number(value||0).toLocaleString('fr-FR')} CDF`:`${Number(value||0).toFixed(2)} USD`;
const amountValue=(value:string)=>Number(String(value||'').replace(',','.'));

function sanitizeMarketCashSuffix(raw:string){
  return String(raw||'')
    .trim()
    .toUpperCase()
    .replace(/\s/g,'')
    .replace(/^MCW-?/,'')
    .replace(/[^A-Z0-9]/g,'')
    .slice(0,24);
}

function fullMarketCashId(raw:string){
  const suffix=sanitizeMarketCashSuffix(raw);
  return suffix?`MCW-${suffix}`:'';
}

function marketCashIdFromPayload(raw:string){
  const text=String(raw||'').trim();
  const find=(value:string)=>value.toUpperCase().match(/MCW-[A-Z0-9]{6,24}/)?.[0]||'';
  try{
    const parsed=JSON.parse(text);
    const candidate=String(parsed?.marketCashId||parsed?.walletId||parsed?.id||'');
    const match=find(candidate);
    if(match)return match;
  }catch{}
  return find(text);
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
  const[marketCashSuffix,setMarketCashSuffix]=useState('');
  const[client,setClient]=useState<AgentClientLookup|null>(null);
  const[cardReference,setCardReference]=useState('');
  const[withdrawalCard,setWithdrawalCard]=useState<LocalCardWithdrawalLookup|null>(null);
  const[currency,setCurrency]=useState<WalletCurrency>('CDF');
  const[amount,setAmount]=useState('');
  const[pin,setPin]=useState('');
  const[mode,setMode]=useState<'cash_in'|'cash_out'>('cash_in');
  const[loading,setLoading]=useState(false);
  const[scannerPurpose,setScannerPurpose]=useState<'deposit'|'withdraw'|null>(null);

  const switchMode=(next:'cash_in'|'cash_out')=>{
    setMode(next);
    setClient(null);
    setWithdrawalCard(null);
    setAmount('');
    setPin('');
    setMarketCashSuffix('');
    setCardReference('');
  };

  const findClient=async()=>{
    const n=amountValue(amount);
    const marketCashId=fullMarketCashId(marketCashSuffix);
    if(!marketCashId)return toast.error('Saisissez l’ID du client.');
    if(!Number.isFinite(n)||n<=0)return toast.error('Saisissez un montant valide.');
    setLoading(true);
    try{
      const data=await agentWalletService.lookupAgentClient(marketCashId);
      setClient(data);
      toast.success('Client Market-Cash trouvé');
    }catch(e:any){
      setClient(null);
      toast.error(e?.message||'Client introuvable');
    }finally{
      setLoading(false);
    }
  };

  const findCard=async(referenceOverride?:string)=>{
    const reference=String(referenceOverride??cardReference).trim();
    if(!reference)return toast.error('Numéro ou identifiant de carte requis.');
    setLoading(true);
    try{
      const data=await agentWalletService.lookupLocalCardForWithdrawal(reference);
      setCardReference(reference);
      setWithdrawalCard(data);
      toast.success('Carte locale reconnue');
    }catch(e:any){
      setWithdrawalCard(null);
      toast.error(e?.message||'Carte locale introuvable');
    }finally{
      setLoading(false);
    }
  };

  const submitDeposit=async()=>{
    if(!client)return toast.error('Vérifiez d’abord le client.');
    const n=amountValue(amount);
    if(!Number.isFinite(n)||n<=0)return toast.error('Montant invalide');
    if(pin.length<4)return toast.error('Code secret agent requis');
    setLoading(true);
    try{
      const result=await agentWalletService.cashInToMarketCashId({
        marketCashId:client.marketCashId,
        currency,
        amount:n,
        pin,
        idempotencyKey:newKey(),
      });
      toast.success(`Dépôt confirmé · ${result.reference}`);
      setAmount('');
      setPin('');
      setMarketCashSuffix('');
      setClient(null);
    }catch(e:any){
      toast.error(e?.message||'Dépôt refusé');
    }finally{
      setLoading(false);
    }
  };

  const submitWithdrawal=async()=>{
    if(!withdrawalCard)return toast.error('Vérifiez d’abord la carte locale.');
    const n=amountValue(amount);
    if(!Number.isFinite(n)||n<=0)return toast.error('Montant invalide');
    if(pin.length<4)return toast.error('Le client doit saisir son code secret.');
    setLoading(true);
    try{
      const result=await agentWalletService.cashOutFromLocalCard({
        cardReference:withdrawalCard.cardIdentifier||cardReference,
        currency,
        amount:n,
        clientPin:pin,
        idempotencyKey:newKey(),
      });
      toast.success(`Retrait confirmé · ${result.reference}`);
      setPin('');
      setCardReference('');
      setWithdrawalCard(null);
      setAmount('');
    }catch(e:any){
      toast.error(e?.message||'Retrait refusé');
    }finally{
      setLoading(false);
    }
  };

  const scanCardNfc=async()=>{
    const Reader=(globalThis as any).NDEFReader;
    if(!Reader){
      toast.error('NFC Web non disponible sur ce téléphone ou ce navigateur. Utilisez le numéro de carte ou le QR.');
      return;
    }
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
        if(!reference){
          toast.error('Carte NFC lue, mais aucun identifiant Market-Cash reconnu.');
          return;
        }
        controller.abort();
        setCardReference(reference);
        setWithdrawalCard(null);
        toast.success('Carte détectée par NFC');
        void findCard(reference);
      };
      reader.onreadingerror=()=>toast.error('Lecture NFC impossible. Réessayez ou saisissez la carte manuellement.');
    }catch(e:any){
      toast.error(e?.message||'Impossible d’activer la lecture NFC.');
    }
  };

  const handleScanResult=(raw:string)=>{
    if(scannerPurpose==='deposit'){
      const id=marketCashIdFromPayload(raw);
      if(!id){
        toast.error('Ce QR ne contient pas un ID MCW valide.');
        return;
      }
      setMarketCashSuffix(sanitizeMarketCashSuffix(id));
      setClient(null);
      toast.success('ID Market-Cash scanné');
    }else if(scannerPurpose==='withdraw'){
      const reference=cardReferenceFromPayload(raw);
      if(!reference){
        toast.error('Ce QR ne contient pas une carte Market-Cash valide.');
        return;
      }
      setCardReference(reference);
      setWithdrawalCard(null);
      toast.success('Carte scannée');
      void findCard(reference);
    }
    setScannerPurpose(null);
  };

  return <div className="mx-auto max-w-xl space-y-4 p-4 md:p-8">
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-black text-blue-950">Terminal</h1>
      <div className="inline-flex rounded-2xl bg-slate-100 p-1">
        <button type="button" onClick={()=>setCurrency('CDF')} className={`rounded-xl px-4 py-2 text-xs font-black transition ${currency==='CDF'?'bg-white text-blue-950 shadow-sm':'text-slate-500'}`}>CDF</button>
        <button type="button" onClick={()=>setCurrency('USD')} className={`rounded-xl px-4 py-2 text-xs font-black transition ${currency==='USD'?'bg-white text-blue-950 shadow-sm':'text-slate-500'}`}>USD</button>
      </div>
    </div>

    <section className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
      <button type="button" onClick={()=>switchMode('cash_in')} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3.5 text-sm font-black transition ${mode==='cash_in'?'bg-emerald-600 text-white shadow-sm':'text-slate-600'}`}><ArrowDownLeft size={18}/>Dépôt</button>
      <button type="button" onClick={()=>switchMode('cash_out')} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3.5 text-sm font-black transition ${mode==='cash_out'?'bg-amber-400 text-blue-950 shadow-sm':'text-slate-600'}`}><ArrowUpRight size={18}/>Retrait</button>
    </section>

    {mode==='cash_in'?<DepositPanel
      marketCashSuffix={marketCashSuffix}
      setMarketCashSuffix={value=>{setMarketCashSuffix(sanitizeMarketCashSuffix(value));setClient(null)}}
      client={client}
      loading={loading}
      onFind={findClient}
      currency={currency}
      amount={amount}
      setAmount={setAmount}
      pin={pin}
      setPin={setPin}
      onSubmit={submitDeposit}
      onScan={()=>setScannerPurpose('deposit')}
    />:<WithdrawalPanel
      cardReference={cardReference}
      setCardReference={value=>{setCardReference(value);setWithdrawalCard(null)}}
      card={withdrawalCard}
      loading={loading}
      onFind={()=>void findCard()}
      currency={currency}
      amount={amount}
      setAmount={setAmount}
      pin={pin}
      setPin={setPin}
      onSubmit={submitWithdrawal}
      onScan={()=>setScannerPurpose('withdraw')}
      onNfc={scanCardNfc}
    />}

    {scannerPurpose&&<QrScannerModal onValue={handleScanResult} onClose={()=>setScannerPurpose(null)}/>} 
  </div>;
}

function DepositPanel({marketCashSuffix,setMarketCashSuffix,client,loading,onFind,currency,amount,setAmount,pin,setPin,onSubmit,onScan}:{marketCashSuffix:string;setMarketCashSuffix:(v:string)=>void;client:AgentClientLookup|null;loading:boolean;onFind:()=>void;currency:WalletCurrency;amount:string;setAmount:(v:string)=>void;pin:string;setPin:(v:string)=>void;onSubmit:()=>void;onScan:()=>void}){
  const n=amountValue(amount);
  const ready=marketCashSuffix.length>=6&&Number.isFinite(n)&&n>0;
  return <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <div>
      <label className="text-xs font-black uppercase tracking-wide text-slate-500">ID client</label>
      <div className="mt-2 grid grid-cols-[auto_1fr_54px] gap-2">
        <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm font-black text-blue-950">MCW-</div>
        <input value={marketCashSuffix} onChange={e=>setMarketCashSuffix(e.target.value)} autoCapitalize="characters" autoComplete="off" placeholder="XXXXXXXXXX" className="min-w-0 rounded-2xl border border-slate-200 px-3 py-4 font-mono font-black uppercase text-blue-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/>
        <button type="button" onClick={onScan} className="grid place-items-center rounded-2xl border border-slate-200 bg-blue-50 text-blue-950 transition active:scale-95" aria-label="Scanner le QR du wallet" title="Scanner le QR du wallet"><QrCode size={22}/></button>
      </div>
    </div>

    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">Montant · {currency}</span>
      <input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="0" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-xl font-black text-blue-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/>
    </label>

    <button type="button" disabled={loading||!ready} onClick={onFind} className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-black transition ${ready&&!loading?'bg-blue-950 text-white shadow-sm active:scale-[.99]':'cursor-not-allowed bg-slate-200 text-slate-400'}`}><Search size={18}/>{loading?'Vérification…':'Continuer'}</button>

    {client&&<div className="space-y-4">
      <ClientCard client={client}/>
      <AgentPin pin={pin} setPin={setPin}/>
      <button type="button" disabled={loading||pin.length<4} onClick={onSubmit} className="w-full rounded-2xl bg-emerald-600 py-4 font-black text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40">{loading?'Traitement…':`Confirmer · ${money(n,currency)}`}</button>
    </div>}
  </section>;
}

function WithdrawalPanel({cardReference,setCardReference,card,loading,onFind,currency,amount,setAmount,pin,setPin,onSubmit,onScan,onNfc}:{cardReference:string;setCardReference:(v:string)=>void;card:LocalCardWithdrawalLookup|null;loading:boolean;onFind:()=>void;currency:WalletCurrency;amount:string;setAmount:(v:string)=>void;pin:string;setPin:(v:string)=>void;onSubmit:()=>void;onScan:()=>void;onNfc:()=>void}){
  const n=amountValue(amount);
  const ready=cardReference.trim().length>=4&&Number.isFinite(n)&&n>0;
  return <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">Montant · {currency}</span>
      <input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="0" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-xl font-black text-blue-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/>
    </label>

    <div>
      <label className="text-xs font-black uppercase tracking-wide text-slate-500">Carte locale</label>
      <div className="mt-2 grid grid-cols-[1fr_52px_52px] gap-2">
        <input value={cardReference} onChange={e=>setCardReference(normalizeLiveCardInput(e.target.value))} autoComplete="off" placeholder="Numéro de carte" className="min-w-0 rounded-2xl border border-slate-200 px-3 py-4 font-mono text-blue-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/>
        <button type="button" onClick={onNfc} className="grid place-items-center rounded-2xl border border-slate-200 bg-amber-50 text-amber-800 transition active:scale-95" aria-label="Lire la carte par NFC" title="NFC"><Radio size={21}/></button>
        <button type="button" onClick={onScan} className="grid place-items-center rounded-2xl border border-slate-200 bg-blue-50 text-blue-950 transition active:scale-95" aria-label="Scanner le QR de la carte" title="QR"><QrCode size={21}/></button>
      </div>
    </div>

    <button type="button" disabled={loading||!ready} onClick={onFind} className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-black transition ${ready&&!loading?'bg-blue-950 text-white shadow-sm active:scale-[.99]':'cursor-not-allowed bg-slate-200 text-slate-400'}`}><CreditCard size={18}/>{loading?'Lecture…':'Continuer'}</button>

    {card&&<div className="space-y-4">
      <CardSummary card={card}/>
      <ClientPin pin={pin} setPin={setPin}/>
      <button type="button" disabled={loading||pin.length<4} onClick={onSubmit} className="w-full rounded-2xl bg-amber-400 py-4 font-black text-blue-950 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40">{loading?'Traitement…':`Confirmer · ${money(n,currency)}`}</button>
    </div>}
  </section>;
}

function ClientCard({client}:{client:AgentClientLookup}){
  return <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-emerald-700"><UserRound/></div>
      <div className="min-w-0">
        <h2 className="truncate font-black text-slate-950">{client.displayName}</h2>
        <p className="font-mono text-xs font-black text-blue-950">{client.marketCashId}</p>
      </div>
    </div>
  </div>;
}

function CardSummary({card}:{card:LocalCardWithdrawalLookup}){
  return <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-amber-700"><CreditCard/></div>
      <div className="min-w-0">
        <h2 className="truncate font-black text-slate-950">{card.cardHolder||card.clientName}</h2>
        <p className="text-sm font-black text-blue-950">{card.maskedNumber}</p>
      </div>
    </div>
  </div>;
}

function AgentPin({pin,setPin}:{pin:string;setPin:(v:string)=>void}){
  return <label className="block">
    <span className="flex items-center gap-1 text-xs font-black uppercase tracking-wide text-slate-500"><KeyRound size={14}/>Code agent</span>
    <input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} type="password" inputMode="numeric" autoComplete="off" placeholder="••••" className="mt-2 w-full rounded-2xl border border-slate-200 p-4 text-center font-black tracking-[.35em] outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/>
  </label>;
}

function ClientPin({pin,setPin}:{pin:string;setPin:(v:string)=>void}){
  return <label className="block rounded-2xl border-2 border-amber-300 bg-white p-3">
    <span className="flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wide text-amber-800"><KeyRound size={15}/>Code client</span>
    <input value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))} type="password" inputMode="numeric" autoComplete="off" placeholder="••••" className="mt-2 w-full rounded-xl border border-slate-200 p-4 text-center text-xl font-black tracking-[.35em] outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"/>
  </label>;
}

function QrScannerModal({onValue,onClose}:{onValue:(value:string)=>void;onClose:()=>void}){
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const[message,setMessage]=useState('Ouverture de la caméra…');

  React.useEffect(()=>{
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
            if(raw){
              stopped=true;
              onValue(raw);
              return;
            }
          }catch{}
          frame=requestAnimationFrame(loop);
        };
        frame=requestAnimationFrame(loop);
      }catch(e:any){
        setMessage(e?.message==='QR_NOT_SUPPORTED'?'Scan QR non pris en charge par ce navigateur.':'Caméra indisponible. Autorisez la caméra ou saisissez la donnée manuellement.');
      }
    };
    void start();
    return()=>{
      stopped=true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track=>track.stop());
    };
  },[]);

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/80 p-4">
    <div className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl">
      <div className="flex items-center justify-between">
        <div><p className="text-xs font-black uppercase text-blue-950">Scanner QR</p><p className="text-[11px] text-slate-500">{message}</p></div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700"><X size={20}/></button>
      </div>
      <div className="relative mt-4 overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover"/>
        <div className="pointer-events-none absolute inset-8 rounded-3xl border-2 border-white/80"/>
      </div>
      <button type="button" onClick={onClose} className="mt-4 w-full rounded-2xl bg-slate-100 py-3 text-sm font-black text-slate-700">Annuler</button>
    </div>
  </div>;
}
