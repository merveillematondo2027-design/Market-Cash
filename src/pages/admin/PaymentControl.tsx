import { useEffect, useMemo, useState } from 'react';
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
  parseConfidence?: number;
  parseMissing?: string[];
  parseVersion?: number;
  status?: string;
  consumed?: boolean;
  deviceId?: string;
}

type Tab = 'all' | 'unread' | 'ready' | 'review' | 'consumed';
type InfoPanel = 'bridge' | 'cloud' | 'proof' | null;
const READ_KEY = 'market-cash-payment-sms-read-v1';

const providerLabel = (provider?: string) => ({
  MPESA: 'M-Pesa',
  AIRTEL_MONEY: 'Airtel Money',
  ORANGE_MONEY: 'Orange Money',
  AFRIMONEY: 'Afrimoney',
  UNKNOWN: 'Inconnu',
}[provider || ''] || provider || 'Inconnu');

const money = (amount?: number | null, currency?: string) => amount == null ? '—' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(amount)} ${currency || ''}`.trim();
const dateTime = (value?: number) => value ? new Date(value).toLocaleString('fr-FR') : '—';

function loadReadIds() {
  try {
    const value = JSON.parse(localStorage.getItem(READ_KEY) || '[]');
    return new Set<string>(Array.isArray(value) ? value : []);
  } catch {
    return new Set<string>();
  }
}

export default function PaymentControl() {
  const [events, setEvents] = useState<PaymentSmsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [checking, setChecking] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [infoPanel, setInfoPanel] = useState<InfoPanel>(null);
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

  const persistRead = (next: Set<string>) => {
    setReadIds(next);
    localStorage.setItem(READ_KEY, JSON.stringify([...next].slice(-2000)));
  };

  const openEvent = (event: PaymentSmsEvent) => {
    const isOpening = expanded !== event.id;
    setExpanded(isOpening ? event.id : null);
    if (isOpening && !readIds.has(event.id)) {
      const next = new Set(readIds);
      next.add(event.id);
      persistRead(next);
    }
  };

  const stats = useMemo(() => ({
    total: events.length,
    unread: events.filter(event => !readIds.has(event.id)).length,
    ready: events.filter(event => event.parseStatus === 'ready' && !event.consumed).length,
    review: events.filter(event => event.parseStatus === 'review' && !event.consumed).length,
    consumed: events.filter(event => event.consumed).length,
  }), [events, readIds]);

  const filtered = useMemo(() => events.filter(event => {
    if (tab === 'unread' && readIds.has(event.id)) return false;
    if (tab === 'ready' && !(event.parseStatus === 'ready' && !event.consumed)) return false;
    if (tab === 'review' && !(event.parseStatus === 'review' && !event.consumed)) return false;
    if (tab === 'consumed' && !event.consumed) return false;
    const received = Number(event.receivedAt || 0);
    if (dateFrom) {
      const from = new Date(`${dateFrom}T00:00:00`).getTime();
      if (!received || received < from) return false;
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59.999`).getTime();
      if (!received || received > to) return false;
    }
    return true;
  }), [events, tab, readIds, dateFrom, dateTo]);

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

  const reparse = async () => {
    setReparsing(true);
    try {
      const call = httpsCallable(functions, 'adminReparsePaymentSms');
      const result = await call({ limit: 500 });
      const data = result.data as any;
      toast.success(`${data?.updated || 0} SMS réanalysés · ${data?.ready || 0} prêts · ${data?.review || 0} à examiner`);
    } catch (error: any) {
      console.error('[PAYMENT_REPARSE]', error);
      toast.error(error?.message || 'Réanalyse impossible.');
    } finally {
      setReparsing(false);
    }
  };

  const cards: Array<{ label: string; value: number; icon: any; note: string; tab: Tab }> = [
    { label: 'SMS reçus', value: stats.total, icon: MessageSquareText, note: '200 derniers événements', tab: 'all' },
    { label: 'Prêts à rapprocher', value: stats.ready, icon: CheckCircle2, note: 'Lecture automatique complète', tab: 'ready' },
    { label: 'À examiner', value: stats.review, icon: AlertTriangle, note: 'Information manquante ou ambiguë', tab: 'review' },
    { label: 'Déjà utilisés', value: stats.consumed, icon: CopyCheck, note: 'Protégés contre le double usage', tab: 'consumed' },
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
          <button onClick={() => setInfoPanel(infoPanel === 'bridge' ? null : 'bridge')} className="rounded-xl bg-white/5 p-3 text-left transition hover:bg-white/10"><Smartphone size={17} className="mb-2 text-amber-400"/><div className="font-black">Bridge Android</div><div className="mt-1 text-slate-400">Canal SMS sécurisé</div></button>
          <button onClick={() => setInfoPanel(infoPanel === 'cloud' ? null : 'cloud')} className="rounded-xl bg-white/5 p-3 text-left transition hover:bg-white/10"><Database size={17} className="mb-2 text-amber-400"/><div className="font-black">Cloud sync</div><div className="mt-1 text-slate-400">Rapprochement central</div></button>
        </div>
      </div>
      {infoPanel && infoPanel !== 'proof' && <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-6 text-slate-300">
        {infoPanel === 'bridge' ? <><b className="text-white">Bridge Android actif.</b> Le téléphone admin lit les SMS autorisés et les transmet au centre de contrôle. Dernier appareil détecté : {events[0]?.deviceId || 'en attente'}.</> : <><b className="text-white">Cloud sync actif.</b> {stats.total} événements sont disponibles dans le flux courant ; ils sont analysés, dédupliqués et préparés pour le rapprochement.</>}
      </div>}
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(card => { const Icon = card.icon; return <button key={card.label} onClick={() => setTab(card.tab)} className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tab === card.tab ? 'border-blue-950 ring-1 ring-blue-950' : 'border-slate-200'}`}><div className="flex items-start justify-between"><div><div className="text-xs font-bold text-slate-500">{card.label}</div><div className="mt-1 text-3xl font-black text-slate-950">{card.value}</div></div><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-950"><Icon size={20}/></div></div><div className="mt-3 text-[11px] text-slate-400">{card.note} · cliquer pour afficher</div></button> })}
    </section>

    <PaymentSmsBridgePanel />

    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <button onClick={() => setInfoPanel(infoPanel === 'proof' ? null : 'proof')} className="flex w-full items-center gap-2 text-left"><Search size={19} className="text-blue-950"/><div><h2 className="font-black text-slate-950">Vérifier une preuve client</h2><p className="text-xs text-slate-500">Market-Cash cherche une transaction réellement reçue avant toute validation.</p></div></button>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <input value={form.transactionId} onChange={e => setForm(v => ({ ...v, transactionId: e.target.value }))} placeholder="Référence transaction" className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-950" />
        <input value={form.amount} onChange={e => setForm(v => ({ ...v, amount: e.target.value }))} type="number" min="0" step="0.01" placeholder="Montant" className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-950" />
        <select value={form.currency} onChange={e => setForm(v => ({ ...v, currency: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-950"><option value="USD">USD</option><option value="CDF">CDF</option></select>
        <input value={form.customerPhone} onChange={e => setForm(v => ({ ...v, customerPhone: e.target.value }))} placeholder="Téléphone client" className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-950" />
        <select value={form.provider} onChange={e => setForm(v => ({ ...v, provider: e.target.value }))} className="rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-950"><option value="">Tous opérateurs</option><option value="MPESA">M-Pesa</option><option value="AIRTEL_MONEY">Airtel Money</option><option value="ORANGE_MONEY">Orange Money</option><option value="AFRIMONEY">Afrimoney</option></select>
      </div>
      <button onClick={() => void verify()} disabled={checking} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-950 px-4 py-3 text-sm font-black text-white disabled:opacity-60 sm:w-auto">{checking ? <RefreshCw size={17} className="animate-spin"/> : <ShieldCheck size={17}/>}Vérifier dans les SMS réels</button>
      {infoPanel === 'proof' && <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">Le rapprochement utilise la référence, le montant, la devise, le numéro client, l’opérateur et la récence. Une transaction déjà utilisée ne peut pas être réutilisée.</div>}
      {verification && <div className={`mt-4 rounded-2xl border p-4 ${verification.verified ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
        <div className="flex items-center gap-2 font-black">{verification.verified ? <CheckCircle2 size={19} className="text-emerald-600"/> : <XCircle size={19} className="text-rose-600"/>}{verification.verified ? 'PAIEMENT VÉRIFIÉ' : 'AUCUNE CORRESPONDANCE CERTAINE'}</div>
        {verification.best && <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-slate-500">Opérateur</span><div className="font-black">{providerLabel(verification.best.provider)}</div></div><div><span className="text-slate-500">Montant</span><div className="font-black">{money(verification.best.amount, verification.best.currency)}</div></div><div><span className="text-slate-500">Référence</span><div className="font-black">{verification.best.transactionId || '—'}</div></div><div><span className="text-slate-500">Score</span><div className="font-black">{verification.best.score}/100</div></div></div>}
      </div>}
    </section>

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><h2 className="font-black text-slate-950">Flux des SMS de paiement</h2><p className="text-xs text-slate-500">Seuls les événements synchronisés par le téléphone Market-Cash sont affichés ici.</p></div>
          <div className="flex flex-wrap gap-2">
            <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{(['all','unread','ready','review','consumed'] as Tab[]).map(item => <button key={item} onClick={() => setTab(item)} className={`rounded-lg px-3 py-2 text-xs font-black ${tab === item ? 'bg-white text-blue-950 shadow-sm' : 'text-slate-500'}`}>{item === 'all' ? 'Tous' : item === 'unread' ? `Non lus (${stats.unread})` : item === 'ready' ? 'Prêts' : item === 'review' ? 'À vérifier' : 'Utilisés'}</button>)}</div>
            <input aria-label="Date de début" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600" />
            <input aria-label="Date de fin" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600" />
            {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600">Effacer dates</button>}
            <button onClick={() => void reparse()} disabled={reparsing} className="flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-60"><RefreshCw size={14} className={reparsing ? 'animate-spin' : ''}/>{reparsing ? 'Réanalyse…' : 'Réanalyser les SMS'}</button>
          </div>
        </div>
      </div>
      {loading ? <div className="flex items-center justify-center p-12 text-sm text-slate-500"><RefreshCw size={18} className="mr-2 animate-spin"/>Chargement…</div> : filtered.length === 0 ? <div className="p-12 text-center"><MessageSquareText size={32} className="mx-auto text-slate-300"/><div className="mt-3 font-black text-slate-700">Aucun SMS pour ce filtre</div><p className="mt-1 text-xs text-slate-400">Modifiez le statut ou la période sélectionnée.</p></div> : <div className="divide-y divide-slate-100">{filtered.map(event => {
        const unread = !readIds.has(event.id);
        return <article key={event.id} className={`p-4 transition sm:p-5 ${unread ? 'bg-blue-50/40' : 'bg-white'}`}>
          <button onClick={() => openEvent(event)} className="grid w-full gap-3 text-left lg:grid-cols-[1.2fr_.8fr_1.2fr_1.1fr_auto] lg:items-center">
            <div><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${event.consumed ? 'bg-slate-400' : event.parseStatus === 'ready' ? 'bg-emerald-500' : 'bg-amber-500'}`}/><span className="font-black text-slate-950">{providerLabel(event.provider)}</span>{unread && <span className="rounded-full bg-blue-950 px-2 py-0.5 text-[9px] font-black text-white">NOUVEAU</span>}</div><div className="mt-1 text-xs text-slate-500">SIM {typeof event.simSlot === 'number' && event.simSlot >= 0 ? event.simSlot + 1 : '—'} · {event.senderAddress || 'expéditeur inconnu'}</div></div>
            <div><div className="text-lg font-black text-slate-950">{money(event.amount, event.currency)}</div><div className="text-xs text-slate-400">{event.customerPhone || 'Numéro non extrait'}</div></div>
            <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Référence</div><div className="mt-1 break-all text-sm font-black text-slate-700">{event.transactionId || 'À identifier'}</div></div>
            <div><div className="flex items-center gap-1 text-xs font-bold text-slate-500"><Clock3 size={14}/>{dateTime(event.receivedAt)}</div><div className={`mt-1 text-[11px] font-black ${event.consumed ? 'text-slate-500' : event.parseStatus === 'ready' ? 'text-emerald-600' : 'text-amber-600'}`}>{event.consumed ? 'TRANSACTION UTILISÉE' : event.parseStatus === 'ready' ? 'PRÊT À RAPPROCHER' : 'EXAMEN REQUIS'}</div></div>
            <span className="rounded-xl border border-slate-200 px-3 py-2 text-center text-xs font-black text-slate-600">{expanded === event.id ? 'Masquer' : 'Détails'}</span>
          </button>
          {expanded === event.id && <div className="mt-4 grid gap-3 lg:grid-cols-[1.5fr_.8fr]">
            <div className="rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-200"><div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-amber-400"><MessageSquareText size={14}/>SMS original conservé pour audit</div><div className="whitespace-pre-wrap break-words">{event.rawBody || 'Contenu indisponible.'}</div><div className="mt-3 border-t border-white/10 pt-3 text-[10px] text-slate-500">Device: {event.deviceId || '—'} · Event: {event.id}</div></div>
            <div className="rounded-2xl border border-slate-200 p-4 text-xs text-slate-600"><div className="font-black text-slate-950">Analyse automatique</div><div className="mt-3 space-y-2"><div>Confiance : <b>{event.parseConfidence ?? '—'}{typeof event.parseConfidence === 'number' ? '/100' : ''}</b></div><div>Version parseur : <b>{event.parseVersion ?? 1}</b></div><div>Champs manquants : <b>{event.parseMissing?.length ? event.parseMissing.join(', ') : 'aucun'}</b></div><div>Statut : <b>{event.consumed ? 'Utilisé' : event.parseStatus === 'ready' ? 'Prêt' : 'À examiner'}</b></div></div></div>
          </div>}
        </article>;
      })}</div>}
    </section>

    <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950"><div className="flex gap-3"><CircleDollarSign size={20} className="mt-0.5 shrink-0"/><div><div className="font-black">Règle de sécurité active</div><p className="mt-1 text-xs leading-5">Une preuve client ne suffit pas à elle seule. Market-Cash compare toujours la déclaration aux SMS réellement synchronisés. Un événement déjà consommé reste bloqué contre le double usage.</p></div></div></section>
  </div>;
}
