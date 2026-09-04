import React from 'react';
import { CreditCard, Wifi } from 'lucide-react';

export type CardProductVariant = 'local' | 'standard' | 'gold';

interface CardProductFaceProps {
  variant: CardProductVariant;
  holder?: string;
  number?: string;
  className?: string;
}

const config: Record<CardProductVariant, {
  title: string;
  subtitle: string;
  network: string;
  shell: string;
  accent: string;
  muted: string;
  chip: string;
}> = {
  local: {
    title: 'MARKET-CASH',
    subtitle: 'LOCALE • USD / CDF',
    network: 'LOCAL',
    shell: 'border-blue-300/35 bg-gradient-to-br from-[#1765f2] via-[#0d4dcc] to-[#082a70]',
    accent: 'text-amber-300',
    muted: 'text-blue-100',
    chip: 'from-amber-100 via-amber-300 to-amber-500',
  },
  standard: {
    title: 'MARKET-CASH',
    subtitle: 'VISA STANDARD',
    network: 'VISA',
    shell: 'border-slate-300/25 bg-gradient-to-br from-[#293451] via-[#141d35] to-[#070b15]',
    accent: 'text-slate-200',
    muted: 'text-slate-300',
    chip: 'from-slate-100 via-slate-300 to-slate-500',
  },
  gold: {
    title: 'MARKET-CASH',
    subtitle: 'VISA GOLD',
    network: 'VISA GOLD',
    shell: 'border-amber-400/35 bg-gradient-to-br from-[#262116] via-[#15130f] to-[#050505]',
    accent: 'text-amber-300',
    muted: 'text-amber-100/75',
    chip: 'from-amber-100 via-yellow-400 to-amber-600',
  },
};

function maskedNumber(value?: string) {
  const digits = String(value || '').replace(/\D/g, '');
  const last4 = digits.slice(-4);
  return last4 ? `•••• •••• •••• ${last4}` : '•••• •••• •••• ••••';
}

export function maskCardHolder(value?: string) {
  const name = String(value || 'CLIENT MARKET-CASH').trim().toUpperCase();
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => `${part.charAt(0)}${'•'.repeat(Math.max(2, Math.min(6, part.length - 1)))}`)
    .join(' ');
}

export default function CardProductFace({ variant, holder, number, className = '' }: CardProductFaceProps) {
  const style = config[variant];

  return (
    <div className={`relative aspect-[1.586/1] w-full overflow-hidden rounded-[1.55rem] border p-5 text-white shadow-[0_24px_52px_-30px_rgba(15,23,42,0.85)] ${style.shell} ${className}`}>
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-black/25 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/75 to-transparent" />

      <div className="relative z-10 flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-black tracking-[0.04em]">
              MARKET<span className={variant === 'local' ? 'text-amber-300' : style.accent}>-CASH</span>
            </p>
            <p className={`mt-1 text-[8px] font-black uppercase tracking-[0.22em] ${style.muted}`}>{style.subtitle}</p>
          </div>
          <CreditCard size={23} className={style.accent} strokeWidth={2.1} />
        </div>

        <div>
          <div className="flex items-center gap-3">
            <div className={`relative h-9 w-12 overflow-hidden rounded-lg bg-gradient-to-br ${style.chip} shadow-inner`}>
              <span className="absolute inset-y-0 left-1/2 w-px bg-black/20" />
              <span className="absolute inset-x-0 top-1/2 h-px bg-black/20" />
            </div>
            <Wifi size={22} className="rotate-90 text-white/90" />
          </div>
          <p className="mt-5 whitespace-nowrap font-mono text-[1.08rem] font-black tracking-[0.13em] drop-shadow sm:text-xl">
            {maskedNumber(number)}
          </p>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className={`text-[7px] font-bold uppercase tracking-[0.16em] ${style.muted}`}>Titulaire</p>
            <p className="mt-1 truncate text-[11px] font-black tracking-wide">{maskCardHolder(holder)}</p>
          </div>
          <p className={`shrink-0 text-right text-sm font-black italic ${variant === 'gold' ? 'text-amber-300' : 'text-white'}`}>{style.network}</p>
        </div>
      </div>
    </div>
  );
}
