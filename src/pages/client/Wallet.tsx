import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowRight,
  Bell,
  CreditCard,
  Headphones,
  History,
  Nfc,
  QrCode,
  Send,
  ShieldCheck,
  Smartphone,
  UserRound,
  WalletCards,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { walletService } from '../../services/walletService';

const money = (value: number, currency: string) => `${value.toFixed(2)} ${currency}`;

export default function ClientWallet() {
  const { user } = useAuthStore();
  const wallet = useMemo(() => user?.uid ? walletService.getWalletPreview(user.uid) : null, [user?.uid]);
  const transactions = walletService.getTransactionsPreview();
  const qrPayload = useMemo(() => wallet ? `MARKET-CASH:WALLET:${wallet.localPaymentId}` : '', [wallet]);

  if (!wallet) {
    return (
      <div className="min-h-full bg-[#071022] p-5 text-white">
        <div className="rounded-3xl border border-red-400/20 bg-red-500/10 p-5 font-bold text-red-200">
          Portefeuille indisponible pour le moment.
        </div>
      </div>
    );
  }

  const reservePartnerAction = (label: string) => {
    toast(`${label} sera exécuté par GMH APIs dès que le backend et le connecteur partenaire seront activés.`, { icon: '⏳' });
  };

  const firstName = user?.displayName?.trim()?.split(' ')[0] || 'Client';
  const avatar = user?.avatar;

  const quickActions = [
    {
      label: 'Recharger',
      caption: 'Mobile Money',
      icon: Smartphone,
      iconClass: 'text-emerald-300',
      boxClass: 'bg-emerald-400/10',
      onClick: () => reservePartnerAction('Recharge Mobile Money'),
    },
    {
      label: 'Payer',
      caption: 'QR Market-Cash',
      icon: QrCode,
      iconClass: 'text-cyan-300',
      boxClass: 'bg-cyan-400/10',
      onClick: () => reservePartnerAction('Paiement QR Market-Cash'),
    },
    {
      label: 'Transférer',
      caption: 'Wallet à wallet',
      icon: Send,
      iconClass: 'text-violet-300',
      boxClass: 'bg-violet-400/10',
      onClick: () => reservePartnerAction('Transfert Market-Cash'),
    },
    {
      label: 'Visa',
      caption: 'Carte virtuelle',
      icon: CreditCard,
      iconClass: 'text-amber-300',
      boxClass: 'bg-amber-400/10',
      to: '/client/cards',
    },
    {
      label: 'Historique',
      caption: 'Mes opérations',
      icon: History,
      iconClass: 'text-indigo-300',
      boxClass: 'bg-indigo-400/10',
      onClick: () => document.getElementById('wallet-history')?.scrollIntoView({ behavior: 'smooth' }),
    },
    {
      label: 'Support',
      caption: 'Centre d’aide',
      icon: Headphones,
      iconClass: 'text-pink-300',
      boxClass: 'bg-pink-400/10',
      to: '/client/help',
    },
  ];

  return (
    <div className="min-h-full bg-[#071022] text-white pb-28">
      <div className="mx-auto max-w-6xl px-4 pt-4 md:px-8 md:pt-8 space-y-6">
        <section className="rounded-[26px] border border-white/10 bg-gradient-to-br from-[#0d1a38] via-[#0b1732] to-[#10172d] p-4 md:p-5 shadow-2xl shadow-black/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-amber-400/80 bg-blue-900 flex items-center justify-center">
                {avatar ? <img src={avatar} alt="Profil" className="h-full w-full object-cover" /> : <UserRound size={24} className="text-blue-200" />}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[15px] font-black text-white">Bonjour, {firstName}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="truncate">ID : {wallet.localPaymentId}</span>
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                  <span className="text-emerald-300">Wallet actif</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => toast('Vos notifications sont disponibles depuis la cloche principale Market-Cash.', { icon: '🔔' })}
              className="relative grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-slate-200"
              aria-label="Notifications"
            >
              <Bell size={20} />
            </button>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[28px] border border-blue-400/20 bg-gradient-to-br from-[#0c55b8] via-[#0b65d8] to-[#0c3f9b] p-5 shadow-2xl shadow-blue-950/40">
          <div className="absolute -right-14 -top-16 h-44 w-44 rounded-full bg-cyan-300/10 blur-2xl" />
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-100/80">Solde disponible</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">{money(wallet.availableBalance, wallet.currency)}</h1>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-blue-50">Comptable : {money(wallet.ledgerBalance, wallet.currency)}</span>
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-blue-50">Réservé : {money(wallet.heldBalance, wallet.currency)}</span>
              </div>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/10">
              <WalletCards size={28} className="text-amber-300" />
            </div>
          </div>
          <div className="relative z-10 mt-5 flex items-center gap-2 text-xs font-bold text-blue-100">
            <ShieldCheck size={15} /> Compte Market-Cash sécurisé
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Actions rapides</p>
              <h2 className="mt-1 text-xl font-black">Que voulez-vous faire ?</h2>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {quickActions.map((action) => {
              const Icon = action.icon;
              const content = (
                <>
                  <div className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl ${action.boxClass}`}>
                    <Icon size={23} className={action.iconClass} />
                  </div>
                  <div className="mt-3 text-sm font-black text-white">{action.label}</div>
                  <div className="mt-1 text-[10px] leading-tight text-slate-500">{action.caption}</div>
                </>
              );

              return action.to ? (
                <Link key={action.label} to={action.to} className="min-h-[126px] rounded-[22px] border border-white/10 bg-white/[0.045] p-3 text-center transition hover:border-blue-400/40 hover:bg-white/[0.07]">
                  {content}
                </Link>
              ) : (
                <button key={action.label} type="button" onClick={action.onClick} className="min-h-[126px] rounded-[22px] border border-white/10 bg-white/[0.045] p-3 text-center transition hover:border-blue-400/40 hover:bg-white/[0.07]">
                  {content}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Mes moyens de paiement</p>
              <h2 className="mt-1 text-xl font-black">Market-Cash</h2>
            </div>
            <Link to="/client/cards" className="flex items-center gap-1 text-xs font-black text-amber-300">Voir mes cartes <ArrowRight size={14} /></Link>
          </div>

          <Link to="/client/cards" className="block overflow-hidden rounded-[26px] border border-blue-400/20 bg-gradient-to-br from-[#0963d9] via-[#0955c0] to-[#07377d] p-5 shadow-xl shadow-blue-950/30">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-100/70">Virtuelle</p>
                <h3 className="mt-1 text-lg font-black">Carte Visa Market-Cash</h3>
              </div>
              <div className="text-2xl font-black italic tracking-tight">VISA</div>
            </div>
            <div className="mt-10 text-sm font-semibold tracking-[0.25em] text-blue-100">•••• •••• •••• ••••</div>
            <div className="mt-5 flex items-end justify-between text-[10px] text-blue-100/70">
              <div><div>TITULAIRE</div><div className="mt-1 text-xs font-black text-white">{user?.displayName || 'CLIENT MARKET-CASH'}</div></div>
              <div className="flex items-center gap-1 text-amber-300 font-black">Gérer <ArrowRight size={13} /></div>
            </div>
          </Link>

          <div className="rounded-[26px] border border-white/10 bg-white/[0.045] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Physique locale</p>
                <h3 className="mt-1 text-lg font-black">Carte Wallet Market-Cash</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">Pas une Visa. Elle sert aux paiements locaux Market-Cash par QR et, plus tard, NFC sur nos terminaux partenaires.</p>
              </div>
              <Nfc className="shrink-0 text-cyan-300" />
            </div>
            <div className="mt-4 flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="rounded-xl bg-white p-2"><QRCodeSVG value={qrPayload} size={78} /></div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Identifiant local</div>
                <div className="mt-1 break-all font-mono text-sm font-black text-white">{wallet.localPaymentId}</div>
                <div className="mt-2 flex items-center gap-1 text-[11px] font-bold text-emerald-300"><QrCode size={13} /> QR prêt</div>
              </div>
            </div>
          </div>
        </section>

        <section id="wallet-history" className="overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.045]">
          <div className="flex items-center justify-between border-b border-white/10 p-5">
            <div className="flex items-center gap-2"><History className="text-indigo-300" size={19} /><h2 className="font-black">Activité récente</h2></div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Temps réel</span>
          </div>
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">Aucune transaction wallet pour le moment.</div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] p-4 text-xs leading-relaxed text-amber-100/80">
          <strong className="text-amber-300">Infrastructure sécurisée :</strong> le solde reste géré par le futur backend ledger Market-Cash. M-Pesa, banque et émission Visa seront exécutés via GMH APIs lorsque les connecteurs partenaires seront activés.
        </section>
      </div>
    </div>
  );
}
