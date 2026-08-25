/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Eye, EyeOff, Fingerprint, Copy } from 'lucide-react';
import { UserCard } from '../types';
import toast from 'react-hot-toast';

export interface MarketCashCardProps {
  card: UserCard | Partial<UserCard>;
  backgroundUrl?: string;
  mode?: 'client' | 'admin' | 'preview';
  isRevealed?: boolean;
  onToggleReveal?: () => void;
  showRevealButton?: boolean;
  useBiometrics?: boolean;
  className?: string;
}

export default function MarketCashCard({
  card,
  backgroundUrl,
  mode = 'client',
  isRevealed = false,
  onToggleReveal,
  showRevealButton = false,
  useBiometrics = false,
  className = ''
}: MarketCashCardProps) {
  const [imageError, setImageError] = useState(false);

  // Formatting helpers
  const getCardNumber = () => {
    const rawNumber = (card.cardNumber || '').replace(/\s+/g, '');
    if (!rawNumber) return '0000 0000 0000 0000';

    if (mode === 'client' && !isRevealed) {
      if (rawNumber.length >= 4) {
        const last4 = rawNumber.slice(-4);
        return `•••• •••• •••• ${last4}`;
      }
      return '•••• •••• •••• ••••';
    }

    // Format in blocks of 4
    return rawNumber.replace(/(\d{4})/g, '$1 ').trim();
  };

  const getHolderName = () => {
    const name = card.cardHolder || card.cardHolderName || card.userName;
    if (!name) return 'CLIENT EXEMPLE';
    if (mode === 'client' && !isRevealed && name.length > 2) {
      const parts = name.split(' ');
      if (parts.length > 1) {
        return `${parts[0]} ${parts[1][0]}.`;
      }
      return name;
    }
    return name.toUpperCase();
  };

  const getValidity = () => {
    if (card.validFrom && card.validUntil) {
      return `${card.validFrom} — ${card.validUntil}`;
    }
    if (card.expiryStart && card.expiryEnd) {
      return `${card.expiryStart} — ${card.expiryEnd}`;
    }
    if (card.expiry) {
      return card.expiry;
    }
    return '12/28 — 12/29';
  };

  const getCvv = () => {
    const cvv = card.cvv || '123';
    if (mode === 'client' && !isRevealed) {
      return '•••';
    }
    return cvv;
  };

  const getRechargeNumber = () => {
    const num = card.rechargeNumber || '0000000000';
    if (mode === 'client' && !isRevealed) {
      if (num.length >= 4) {
        return `••••••${num.slice(-4)}`;
      }
      return '••••••••••';
    }
    return num;
  };

  const getCardIdentifier = () => {
    return card.cardIdentifier || card.cardId || card.id || 'MC-DEMO-001';
  };

  const getQrValue = () => {
    if (card.qrData) return card.qrData;
    const identifier = getCardIdentifier();
    return identifier;
  };

  const hasCustomBackground = Boolean(backgroundUrl && !imageError);

  return (
    <div 
      className={`w-full aspect-[1.586/1] text-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 md:p-6 shadow-2xl shadow-blue-950/40 relative overflow-hidden flex flex-col justify-between select-none transition-transform duration-200 border border-blue-500/30 ${className}`}
      style={{
        backgroundColor: '#050B14'
      }}
    >
      {/* Background Graphic Layer */}
      {hasCustomBackground ? (
        <img 
          src={backgroundUrl} 
          alt="Card Background" 
          className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
          onError={() => {
            console.warn('[CARD_BACKGROUND_LOAD_FAILED] Falling back to default styling');
            setImageError(true);
          }}
        />
      ) : (
        /* Default Built-in Premium Midnight Blue / Black Gradient Background */
        <div className="absolute inset-0 bg-gradient-to-br from-[#050B14] via-[#09152A] to-[#0A2246] z-0 pointer-events-none">
          {/* Tone-on-tone Watermark AUTOMARKET RDC */}
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.035] pointer-events-none select-none">
            <span className="text-2xl sm:text-4xl md:text-5xl font-black tracking-[0.25em] text-white transform -rotate-12 uppercase">
              AUTOMARKET RDC
            </span>
          </div>
          {/* Subtle Metallic Sheen */}
          <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/[0.04] via-transparent to-blue-400/[0.08]" />
        </div>
      )}

      {/* Dynamic Overlay Content Layer */}
      
      {/* TOP ROW: Header Brand + Optional Eye/Reveal Toggle */}
      <div className="relative z-10 flex justify-between items-start">
        <div className="flex flex-col drop-shadow-md">
          <div className="text-xs sm:text-base md:text-lg font-black tracking-wider whitespace-nowrap leading-tight">
            <span className="text-white">MARKET</span>
            <span className="text-orange-500 font-black">-CASH</span>
          </div>
          <div className="text-[6.5px] sm:text-[8px] md:text-[9px] font-bold text-blue-200/90 tracking-widest uppercase mt-0.5">
            CARTE PRÉPAYÉE
          </div>
        </div>

        {/* Reveal Toggle for Client Mode */}
        {showRevealButton && onToggleReveal && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleReveal();
            }}
            className="p-1.5 sm:p-2 bg-white/10 hover:bg-white/20 active:scale-95 rounded-lg sm:rounded-xl border border-white/20 backdrop-blur-md transition-all cursor-pointer group shadow-sm"
            title={isRevealed ? "Masquer les informations" : "Afficher les informations"}
          >
            {isRevealed ? (
              <EyeOff size={14} className="text-orange-400 group-hover:scale-110 transition-transform" />
            ) : (
              <div className="flex items-center gap-1">
                <Eye size={14} className="text-white group-hover:scale-110 transition-transform" />
                {useBiometrics && <Fingerprint size={12} className="text-orange-400 opacity-90" />}
              </div>
            )}
          </button>
        )}
      </div>

      {/* MID-UPPER SECTION: Prominent Dynamic QR Code on Left & Contactless Waves */}
      <div className="relative z-10 flex items-center justify-between gap-2 my-auto">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* QR Code Container - Enhanced Size for optimal scanning */}
          <div className="bg-white p-1 sm:p-1.5 rounded-lg sm:rounded-xl shadow-lg shrink-0 flex items-center justify-center border-2 border-white">
            <QRCodeSVG 
              value={getQrValue()} 
              size={48}
              className="w-8 h-8 sm:w-11 sm:h-11 md:w-13 md:h-13"
              level="M"
            />
          </div>
          <div className="flex flex-col">
            <div className="text-[7px] sm:text-[8px] md:text-[9px] text-amber-400 font-black uppercase tracking-wider leading-tight drop-shadow-xs">
              SCANNER LA CARTE
            </div>
            <div className="text-[6px] sm:text-[7px] md:text-[7.5px] text-blue-200/80 font-mono mt-0.5">
              {getCardIdentifier()}
            </div>
          </div>
        </div>

        {/* Contactless symbol */}
        <div className="text-white/60 text-xs sm:text-sm font-mono pr-1 drop-shadow-xs">
          <span className="text-blue-300">)))</span>
        </div>
      </div>

      {/* CENTER ROW: Card Number (Large, Clear, High-Contrast) */}
      <div className="relative z-10 text-center py-0.5 sm:py-1">
        <div className="text-xs sm:text-base md:text-lg lg:text-xl font-mono font-black text-white tracking-[0.16em] sm:tracking-[0.22em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          {getCardNumber()}
        </div>
      </div>

      {/* BOTTOM SECTION: 3-Column Structured Information */}
      <div className="relative z-10 pt-1.5 sm:pt-2 border-t border-white/15 grid grid-cols-3 gap-1.5 sm:gap-2 items-end drop-shadow-xs">
        {/* Left Column: TITULAIRE & ID UNIQUE */}
        <div className="min-w-0">
          <div className="text-[6px] sm:text-[7px] md:text-[8px] text-blue-200 uppercase tracking-wider font-extrabold leading-none">
            TITULAIRE
          </div>
          <div className="text-[8.5px] sm:text-[10px] md:text-[11.5px] font-bold text-white truncate mt-0.5">
            {getHolderName()}
          </div>
          <div className="text-[6px] sm:text-[7px] md:text-[8px] text-amber-300 font-mono font-bold mt-0.5 truncate">
            ID: <span className="text-white font-extrabold">{getCardIdentifier()}</span>
          </div>
        </div>

        {/* Center Column: VALIDITÉ & CVV */}
        <div className="text-center min-w-0">
          <div className="text-[6px] sm:text-[7px] md:text-[8px] text-blue-200 uppercase tracking-wider font-extrabold leading-none">
            VALIDITÉ
          </div>
          <div className="text-[8px] sm:text-[9.5px] md:text-[10.5px] font-mono font-bold text-orange-400 whitespace-nowrap mt-0.5">
            {getValidity()}
          </div>
          <div className="text-[6px] sm:text-[7px] md:text-[8px] text-blue-300 font-mono mt-0.5">
            CVV: <span className="text-white font-bold">{getCvv()}</span>
          </div>
        </div>

        {/* Right Column: NUMÉRO DE RECHARGE & Vodacom M-pesa */}
        <div className="text-right min-w-0">
          <div className="text-[6px] sm:text-[7px] md:text-[8px] text-orange-400 uppercase tracking-wider font-extrabold leading-none">
            RECHARGE
          </div>
          <div className="text-[8px] sm:text-[9.5px] md:text-[10.5px] font-mono font-bold text-amber-200 truncate mt-0.5">
            {getRechargeNumber()}
          </div>
          <div className="text-[7.5px] sm:text-[9px] font-extrabold text-blue-100 tracking-wide mt-0.5">
            Vodacom M-pesa
          </div>
        </div>
      </div>
    </div>
  );
}
