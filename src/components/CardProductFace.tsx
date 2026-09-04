import React from 'react';
import { Eye,EyeOff,RotateCcw,Wifi } from 'lucide-react';

export type CardProductVariant='local'|'standard'|'gold';

interface CardProductFaceProps{
  variant:CardProductVariant;
  holder?:string;
  number?:string;
  expiryStart?:string;
  expiryEnd?:string;
  cvv?:string;
  revealed?:boolean;
  side?:'front'|'back';
  showRevealButton?:boolean;
  onToggleReveal?:()=>void;
  onFlip?:()=>void;
  className?:string;
}

const cfg={
  local:{subtitle:'CARTE LOCALE • USD / CDF',network:'LOCAL',shell:'from-[#1768ff] via-[#0c4bc8] to-[#062560]',accent:'text-[#ffd54a]',muted:'text-blue-100',chip:'from-[#ffe98f] via-[#f6c431] to-[#c98b08]'},
  standard:{subtitle:'VISA STANDARD',network:'VISA',shell:'from-[#263451] via-[#121b31] to-[#050914]',accent:'text-slate-100',muted:'text-slate-300',chip:'from-[#f4f7fb] via-[#bcc8d8] to-[#73829b]'},
  gold:{subtitle:'VISA GOLD',network:'VISA',shell:'from-[#2a2417] via-[#11100d] to-[#030303]',accent:'text-[#e9bd57]',muted:'text-amber-100/75',chip:'from-[#fff1a7] via-[#d8a62a] to-[#8b5c08]'},
}as const;

const digits=(value?:string)=>String(value||'').replace(/\D/g,'');
const formatNumber=(value?:string,revealed=false)=>{
  const raw=digits(value);
  const last4=raw.slice(-4)||'••••';
  if(!revealed)return `•••• •••• •••• ${last4}`;
  return raw.length>=12?raw.replace(/(\d{4})(?=\d)/g,'$1 '):'•••• •••• •••• ••••';
};
const maskedHolder=(value?:string)=>String(value||'CLIENT MARKET-CASH').trim().toUpperCase().split(/\s+/).filter(Boolean).map(part=>`${part.charAt(0)}${'•'.repeat(Math.max(3,Math.min(7,part.length-1)))}`).join(' ');
const shownHolder=(value?:string,revealed=false)=>revealed?String(value||'CLIENT MARKET-CASH').trim().toUpperCase():maskedHolder(value);
const shownDate=(value?:string,revealed=false)=>revealed&&value?value:'••/••';
const shownCvv=(value?:string,revealed=false)=>revealed&&/^\d{3,4}$/.test(String(value||''))?String(value):'•••';

function Chip({className}:{className:string}){return <div className={`relative h-10 w-14 overflow-hidden rounded-[9px] border border-white/25 bg-gradient-to-br ${className} shadow-[inset_0_1px_1px_rgba(255,255,255,.65),0_4px_10px_rgba(0,0,0,.18)]`}><span className="absolute inset-y-0 left-[38%] w-px bg-black/20"/><span className="absolute inset-y-0 left-[68%] w-px bg-black/15"/><span className="absolute inset-x-0 top-1/2 h-px bg-black/20"/><span className="absolute left-[38%] top-1/2 h-[35%] w-[30%] border-b border-r border-black/15"/></div>}

function Brand({variant}:{variant:CardProductVariant}){return <div><div className="text-[15px] font-black tracking-[.035em] sm:text-[17px]"><span>MARKET</span><span className={variant==='standard'?'text-slate-100':variant==='gold'?'text-[#e9bd57]':'text-[#ffd54a]'}>-CASH</span></div><div className="mt-1 h-[2px] w-9 rounded-full bg-white/50"/></div>}

export default function CardProductFace({variant,holder,number,expiryStart,expiryEnd,cvv,revealed=false,side='front',showRevealButton=true,onToggleReveal,onFlip,className=''}:CardProductFaceProps){
  const style=cfg[variant];
  const standardBack=variant==='standard'&&side==='back';
  return <div className={`relative aspect-[1.586/1] w-full overflow-hidden rounded-[1.65rem] border border-white/15 bg-gradient-to-br ${style.shell} p-5 text-white shadow-[0_30px_55px_-30px_rgba(2,6,23,.9)] ${className}`}>
    <div className="pointer-events-none absolute inset-0 opacity-[.17]" style={{backgroundImage:'radial-gradient(circle at 1px 1px,rgba(255,255,255,.6) 1px,transparent 0)',backgroundSize:'15px 15px',maskImage:'linear-gradient(125deg,transparent 8%,black 52%,transparent 93%)'}}/>
    <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl"/>
    <div className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-black/30 blur-3xl"/>
    {variant==='gold'&&<div className="pointer-events-none absolute inset-x-5 top-5 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent"/>}

    <div className="relative z-10 flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div><Brand variant={variant}/><p className={`mt-2 text-[7px] font-black uppercase tracking-[.24em] ${style.muted}`}>{style.subtitle}</p></div>
        <div className="flex items-center gap-2">
          {variant==='standard'&&onFlip&&<button type="button" onClick={e=>{e.preventDefault();e.stopPropagation();onFlip()}} className="grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-black/15 backdrop-blur" aria-label="Retourner la carte"><RotateCcw size={15}/></button>}
          {showRevealButton&&onToggleReveal&&<button type="button" onClick={e=>{e.preventDefault();e.stopPropagation();onToggleReveal()}} className="grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-black/20 backdrop-blur" aria-label={revealed?'Masquer les informations':'Afficher les informations'}>{revealed?<EyeOff size={16}/>:<Eye size={16}/>}</button>}
        </div>
      </div>

      {standardBack?<>
        <div className="-mx-5 mt-5 h-12 bg-black/85 shadow-inner"/>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-10 flex-1 rounded-md bg-gradient-to-r from-slate-100 via-white to-slate-200 p-2 text-right font-mono text-[9px] italic tracking-[.14em] text-slate-500">SIGNATURE AUTORISÉE</div>
          <div className="rounded-lg bg-white px-3 py-2 text-center text-slate-950"><p className="text-[7px] font-black uppercase text-slate-400">CVV</p><p className="font-mono text-sm font-black tracking-[.2em]">{shownCvv(cvv,revealed)}</p></div>
        </div>
        <div className="mt-auto flex items-end justify-between"><p className="max-w-[70%] text-[7px] leading-3 text-slate-300">Cette carte reste la propriété de Market-Cash. En cas de perte, bloquez-la depuis votre application.</p><p className="text-xl font-black italic tracking-[-.08em]">VISA</p></div>
      </>:<>
        <div className="mt-5 flex items-center justify-between">
          <div className="flex items-center gap-3"><Chip className={style.chip}/><Wifi size={24} className="rotate-90 text-white/90" strokeWidth={2.4}/></div>
          <div className={`text-right ${style.accent}`}><div className="text-[7px] font-black uppercase tracking-[.16em] opacity-80">{variant==='local'?'Market-Cash':'Worldwide'}</div><div className="mt-1 text-sm font-black italic">{style.network}</div></div>
        </div>
        <div className="my-auto py-3">
          <p className="whitespace-nowrap font-mono text-[1.08rem] font-semibold tracking-[.145em] drop-shadow sm:text-[1.32rem]">{formatNumber(number,revealed)}</p>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-3">
          <div className="min-w-0"><p className={`text-[6px] font-black uppercase tracking-[.18em] ${style.muted}`}>Titulaire</p><p className="mt-1 truncate text-[10px] font-black tracking-[.04em] sm:text-[11px]">{shownHolder(holder,revealed)}</p></div>
          {variant==='standard'?<div className="flex gap-3"><div><p className={`text-[6px] font-black uppercase tracking-[.14em] ${style.muted}`}>Du</p><p className="mt-1 font-mono text-[10px] font-black">{shownDate(expiryStart,revealed)}</p></div><div><p className={`text-[6px] font-black uppercase tracking-[.14em] ${style.muted}`}>Expire</p><p className="mt-1 font-mono text-[10px] font-black">{shownDate(expiryEnd,revealed)}</p></div></div>:<div><p className={`text-[6px] font-black uppercase tracking-[.14em] ${style.muted}`}>Expire</p><p className="mt-1 font-mono text-[10px] font-black">{shownDate(expiryEnd,revealed)}</p></div>}
          {variant!=='standard'&&<div><p className={`text-[6px] font-black uppercase tracking-[.14em] ${style.muted}`}>CVV</p><p className="mt-1 font-mono text-[10px] font-black tracking-[.16em]">{shownCvv(cvv,revealed)}</p></div>}
        </div>
      </>}
    </div>
  </div>;
}
