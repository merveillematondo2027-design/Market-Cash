import { useMemo, useState, useEffect } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { AlertTriangle, CheckCircle2, CircleDollarSign, Clock3, CopyCheck, Database, MessageSquareText, RefreshCw, Search, ShieldCheck, Smartphone, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import PaymentSmsBridgePanel from '../../components/admin/PaymentSmsBridgePanel';
import { db, functions } from '../../firebase/config';

interface PaymentSmsEvent {
  id: string;
  provider?: string;
  amount?: number | null;
  currency?: string;
  customerPhone?: string;
  transactionId?: string;
  senderAddress?: string;
  rawBody?: string;
  simSlot?: number;
  receivedAt?: number;
  parseStatus?: 'ready' | 'review' | string;
  status?: string;
  consumed?: boolean;
  deviceId?: string;
}

type Tab = 'all' | 'ready' | 'review' | 'consumed';

const providerLabel = (provider?: string) => ({
  MPESA: 'M-Pesa',
  AIRTEL_MONEY: 'Airtel Money',
  ORANGE_MONEY: 'Orange Money',
  AFRIMONEY: 'Afrimoney',
}[provider || ''] || provider || 'Inconnu');

const money = (amount?: number | null, currency?: string) => amount == null ? '—' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(amount)} ${currency || ''}`.trim();
const dateTime = (value?: number) => value ? new Date(value).toLocaleString('fr-FR') : '—';

export default function PaymentControl() {
  const [events, setEvents] = useState<PaymentSmsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [form, setForm] = useState({ transactionId: '', amount: '', currency: 'USD', customerPhone: '', provider: '' });
  const [verification, setVerification] = useState<any>(null);

  useEffect(() => {
    const q = query(collection(db, 'payment_sms_events'), orderBy('receivedAt', 'desc'), limit(200));
    return onSnapshot(q, snapshot => {
      setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentSmsEvent)));
      setLoading(false);
    }, error => {
      console.error('[PAYMENT_CONTROL_SNAPSHOT]', error);
      setLoading(false);
      toast.error('Impossible de charger le contrôle des paiements.');
    });
  }, []);

  const stats = useMemo(() => ({
    total: events.length,
    ready: events.filter(event => event.parseStatus === 'ready' && !event.consumed).length,
    review: events.filter(event => event.parseStatus === 'review' && !event.consumed).length,
    consumed: events.filter(event => event.consumed).length,
  }), [events]);

  const filtered = useMemo(() => events.filter(event => {
    if (tab === 'ready') return event.parseStatus === 'ready' && !event.consumed;
    if (tab === 'review') return event.parseStatus === 'review' && !event.consumed;
    if (tab === 'consumed') return Boolean(event.consumed);
    return true;
  }), [events, tab]);

  const verify = async () => {
    setChecking(true);
    setVerification(null);
    try {
      const call = httpsCallable(functions, 'adminVerifyPaymentEvidence');
      const result = await call({
        transactionId: form.transactionId.trim(),
        amount: form.amount.trim() ? Number(form.amount) : null,
        currency: form.currency,
        customerPhone: form.customerPhone.trim(),
        provider: form.provider,
      });
      const data = result.data as any;
      setVerification(data);
      data?.verified ? toast.success('Paiement réel retrouvé et vérifié.') : toast.error('Aucune correspondance certaine trouvée.');
    } catch (error: any) {
      console.error('[PAYMENT_VERIFY]', error);
      toast.error(error?.message || 'Vérification impossible.');
    } finally {
      setChecking(false);
    }
  };

  const cards = [
    { label: 'SMS reçus', value: stats.total, icon: MessageSquareText, note: '200 derniers événements' },
    { label: 'Prêts à rapprocher', value: stats.ready, icon: CheckCircle2, note: 'Lecture automatique complète' },
    { label: 'À examiner', value: stats.review, icon: AlertTriangle, note: 'Information manquante ou ambiguë' },
    { label: 'Déjà utilisés', value: stats.consumed, icon: CopyCheck, note: 'Protégés contre le double usage' },
  ];

  return <div className="space-y-6">
    <section className="overflow-hidden rounded-3xl bg-slate-950 p-5 text-white shadow-sm sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-amber-400"><ShieldCheck size={16}/>Contrôle des paiements</div>
          <h1 className="text-2xl font-black sm:text-3xl">Market-Cash Payment Control</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Centre de rapprochement entre les paiements déclarés par les clients et les SMS réellement reçus sur les SIM marchandes Market-Cash.</p>
        </div>
        <div className="grid min-w-[260px] grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs">
          <div className="rounded-xl bg-white/5 p-3"><Smartphone size={17} className="mb-2 text-amber-400"/><div className="font-black">Bridge Android</div><div className="mt-1 text-slate-400">Canal SMS sécurisé</div></div>
          <div className="rounded-xl bg-white/5 p-3"><Database size={17} className="mb-2 text-amber-400"/><div className="font-black">Cloud sync</div><div className="mt-1 text-slate-400">Rapprochement central</div></div>
        </div>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(card => { const Icon = card.icon; return <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><div className="text-xs font-bold text-slate-500">{card.label}</div><div className="mt-1 text-3xl font-black text-slate-950">{card.value}</div></div><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-950"><Icon size={20}/></div></div><div className="mt-3 text-[11px] text-slate-400">{card.note}</div></div> })}
    </section>

    <PaymentSmsBridgePanel />

    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-center gap-2"><Search size={19} className="text-blue-950"/><div><h2 className="font-black text-slate-950">Vérifier une preuve client</h2><p className="text-xs text-slate-500">Market-Cash cherche une transaction réellement reçue avant toute validation.</p></div></div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <input value={form.transactionId} onChange={e => setForm(v => ({ ...v, transactionId: e.target.value }))} placeholder="Référence transaction" className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-950" />
        <input value={form.amount} onChange={e => setForm(v => ({ ...v, amount: e.target.value }))} type="number" min="0" step="0.01" placeholder="Montant" className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-950" />
        <select value={form.currency} onChange={e => setForm(v => ({ ...v, currency: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-950"><option value="USD">USD</option><option value="CDF">CDF</option></select>
        <input value={form.customerPhone} onChange={e => setForm(v => ({ ...v, customerPhone: e.target.value }))} placeholder="Téléphone client" className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-950" />
        <select value={form.provider} onChange={e => setForm(v => ({ ...v, provider: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-950"><option value="">Tous opérateurs</option><option value="MPESA">M-Pesa</option><option value="AIRTEL_MONEY">Airtel Money</option><option value="ORANGE_MONEY">Orange Money</option><option value="AFRIMONEY">Afrimoney</option></select>
      </div>
      <button onClick={() => void verify()} disabled={checking} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-950 px-4 py-3 text-sm font-black text-white disabled:opacity-60 sm:w-auto">{checking ? <RefreshCw size={17} className="animate-spin"/> : <ShieldCheck size={17}/>}Vérifier dans les SMS réels</button>
      {verification && <div className={`mt-4 rounded-2xl border p-4 ${verification.verified ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
        <div className="flex items-center gap-2 font-black">{verification.verified ? <CheckCircle2 size={19} className="text-emerald-600"/> : <XCircle size={19} className="text-rose-600"/>}{verification.verified ? 'PAIEMENT VÉRIFIÉ' : 'AUCUNE CORRESPONDANCE CERTAINE'}</div>
        {verification.best && <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-slate-500">Opérateur</span><div className="font-black">{providerLabel(verification.best.provider)}</div></div><div><span className="text-slate-500">Montant</span><div className="font-black">{money(verification.best.amount, verification.best.currency)}</div></div><div><span className="text-slate-500">Référence</span><div className="font-black">{verification.best.transactionId || '—'}</div></div><div><span className="text-slate-500">Score</span><div className="font-black">{verification.best.score}/100</div></div></div>}
      </div>}
    </section>

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-black text-slate-950">Flux des SMS de paiement</h2><p className="text-xs text-slate-500">Seuls les événements synchronisés par le téléphone Market-Cash sont affichés ici.</p></div><div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{(['all','ready','review','consumed'] as Tab[]).map(item => <button key={item} onClick={() => setTab(item)} className={`rounded-lg px-3 py-2 text-xs font-black ${tab === item ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-500'}`}>{item === 'all' ? 'Tous' : item === 'ready' ? 'Prêts' : item === 'review' ? 'À vérifier' : 'Utilisés'}</button>)}</div></div></div>
      {loading ? <div className="flex items-center justify-center p-12 text-sm text-slate-500"><RefreshCw size={18} className="mr-2 animate-spin"/>Chargement…</div> : filtered.length === 0 ? <div className="p-12 text-center"><MessageSquareText size={32} className="mx-auto text-slate-300"/><div className="mt-3 font-black text-slate-700">Aucun SMS de paiement</div><p className="mt-1 text-xs text-slate-400">Les nouveaux paiements apparaîtront automatiquement après synchronisation du téléphone admin.</p></div> : <div className="divide-y divide-slate-100">{filtered.map(event => <article key={event.id} className="p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr_1.2fr_1.1fr_auto] lg:items-center">
          <div><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${event.consumed ? 'bg-slate-400' : event.parseStatus === 'ready' ? 'bg-emerald-500' : 'bg-amber-500'}`}/><span className="font-black text-slate-950">{providerLabel(event.provider)}</span></div><div className="mt-1 text-xs text-slate-500">SIM {typeof event.simSlot === 'number' && event.simSlot >= 0 ? event.simSlot + 1 : '—'} · {event.senderAddress || 'expéditeur inconnu'}</div></div>
          <div><div className="text-lg font-black text-slate-950">{money(event.amount, event.currency)}</div><div className="text-xs text-slate-400">{event.customerPhone || 'Numéro non extrait'}</div></div>
          <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Référence</div><div className="mt-1 break-all text-sm font-black text-slate-700">{event.transactionId || 'À identifier'}</div></div>
          <div><div className="flex items-center gap-1 text-xs font-bold text-slate-500"><Clock3 size={14}/>{dateTime(event.receivedAt)}</div><div className={`mt-1 text-[11px] font-black ${event.consumed ? 'text-slate-500' : event.parseStatus === 'ready' ? 'text-emerald-600' : 'text-amber-600'}`}>{event.consumed ? 'TRANSACTION UTILISÉE' : event.parseStatus === 'ready' ? 'PRÊT À RAPPROCHER' : 'EXAMEN REQUIS'}</div></div>
          <button onClick={() => setExpanded(expanded === event.id ? null : event.id)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">{expanded === event.id ? 'Masquer' : 'Voir SMS'}</button>
        </div>
        {expanded === event.id && <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-200"><div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-amber-400"><MessageSquareText size={14}/>SMS original conservé pour audit</div><div className="whitespace-pre-wrap break-words">{event.rawBody || 'Contenu indisponible.'}</div><div className="mt-3 border-t border-white/10 pt-3 text-[10px] text-slate-500">Device: {event.deviceId || '—'} · Event: {event.id}</div></div>}
      </article>)}</div>}
    </section>

    <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950"><div className="flex gap-3"><CircleDollarSign size={20} className="mt-0.5 shrink-0"/><div><div className="font-black">Règle de sécurité active</div><p className="mt-1 text-xs leading-5 text-blue-800">Une capture envoyée par un client n’est jamais considérée comme un paiement. La validation doit retrouver un événement reçu par le bridge Android Market-Cash, puis vérifier référence, montant, devise, numéro et statut anti-doublon.</p></div></div></section>
  </div>;
}
