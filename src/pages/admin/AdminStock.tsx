import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Package, Plus, Search, ShieldCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../../firebase/config';
import { cardService } from '../../services/cardService';
import { useAuthStore } from '../../store/authStore';
import { UserCard } from '../../types';

const EMPTY_FORM = { cardNumber: '', rechargeNumber: '', expiryStart: '02/27', expiryEnd: '08/27', cvv: '' };
const maskCard = (value: string) => `•••• •••• •••• ${value.replace(/\D/g, '').slice(-4).padStart(4, '•')}`;
const maskRecharge = (value: string) => `••••••${value.replace(/\s/g, '').slice(-4).padStart(4, '•')}`;

export default function AdminStock() {
  const { user } = useAuthStore();
  const [cards, setCards] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => onSnapshot(collection(db, 'cards'), snapshot => {
    setCards(snapshot.docs.map(item => ({ ...item.data(), id: item.id, cardId: item.id } as UserCard)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    setLoading(false);
  }, error => {
    console.error('[STOCK_LIST_ERROR]', { code: error.code, message: error.message });
    setLoading(false);
  }), []);

  const stats = useMemo(() => ({
    available: cards.filter(card => card.saleStatus === 'available').length,
    reserved: cards.filter(card => card.saleStatus === 'reserved').length,
    sold: cards.filter(card => ['sold', 'confirmed'].includes(card.saleStatus || '') || Boolean(card.userId)).length,
    total: cards.length
  }), [cards]);

  const filteredCards = cards.filter(card => {
    const term = searchQuery.trim().toLowerCase();
    return !term || card.cardIdentifier?.toLowerCase().includes(term) || card.cardNumber?.slice(-4).includes(term);
  });

  const updateCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 16);
    setForm(current => ({ ...current, cardNumber: digits.replace(/(\d{4})(?=\d)/g, '$1 ') }));
  };

  const validateAndConfirm = (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{16}$/.test(form.cardNumber.replace(/\D/g, ''))) return void toast.error('Le numéro de carte doit contenir exactement 16 chiffres.');
    if (!form.rechargeNumber.trim()) return void toast.error('Le numéro de recharge est obligatoire.');
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(form.expiryStart) || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(form.expiryEnd)) return void toast.error('Les dates doivent respecter le format MM/AA.');
    if (!/^\d{3,4}$/.test(form.cvv)) return void toast.error('Le CVV doit contenir 3 ou 4 chiffres.');
    setShowConfirmation(true);
  };

  const confirmAddCard = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const created = await cardService.addCardToStock({ ...form, creator: { uid: user.uid, email: user.email, agencyId: user.agencyId, agencyName: user.agencyName } });
      toast.success(`Carte ${created.cardIdentifier} ajoutée au stock.`);
      setForm(EMPTY_FORM);
      setShowConfirmation(false);
      setShowForm(false);
    } catch (error: any) {
      const messages: Record<string, string> = { INVALID_CARD_NUMBER: 'Numéro de carte invalide.', INVALID_RECHARGE_NUMBER: 'Numéro de recharge invalide.', INVALID_CVV: 'CVV invalide.', INVALID_EXPIRY: 'Période de validité invalide.' };
      toast.error(messages[error?.message] || "Impossible d'ajouter la carte au stock.");
      console.error('[STOCK_CARD_CREATE_ERROR]', { code: error?.code || error?.message || 'unknown' });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-10 text-center text-slate-500 font-bold">Chargement du stock...</div>;

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h1 className="text-2xl sm:text-3xl font-black text-blue-950 flex items-center gap-2"><Package className="text-amber-500" /> Stock Market-Cash</h1><p className="text-sm text-slate-500 mt-1">Cartes préconfigurées prêtes à être attribuées.</p></div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-950 text-white rounded-2xl font-black shadow-lg hover:bg-blue-900"><Plus size={18} /> Ajouter une carte</button>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Disponibles', stats.available, 'text-blue-700 bg-blue-50 border-blue-100'],
          ['Réservées', stats.reserved, 'text-amber-700 bg-amber-50 border-amber-100'],
          ['Attribuées', stats.sold, 'text-emerald-700 bg-emerald-50 border-emerald-100'],
          ['Total', stats.total, 'text-slate-800 bg-white border-slate-200']
        ].map(([label, value, colors]) => <div key={String(label)} className={`p-4 sm:p-5 rounded-2xl border shadow-sm ${colors}`}><div className="text-xs font-black uppercase tracking-wider opacity-75">{label}</div><div className="text-3xl font-black mt-1">{value}</div></div>)}
      </div>

      {stats.available === 0 && <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 flex gap-3"><AlertCircle className="shrink-0" /><div><strong>Stock épuisé</strong><p className="text-sm">Aucune carte préconfigurée n’est disponible pour une attribution.</p></div></div>}

      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 relative"><Search size={17} className="absolute left-7 top-1/2 -translate-y-1/2 text-slate-400" /><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Rechercher par identifiant ou 4 derniers chiffres" className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-blue-500 text-sm font-semibold" /></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider"><tr><th className="p-4 text-left">Identifiant</th><th className="p-4 text-left">Carte</th><th className="p-4 text-left">Validité</th><th className="p-4 text-left">Statut</th><th className="p-4 text-left">Création</th></tr></thead><tbody className="divide-y divide-slate-100">
          {filteredCards.map(card => <tr key={card.id || card.cardId} className="hover:bg-blue-50/30"><td className="p-4 font-mono font-black text-blue-950">{card.cardIdentifier || card.cardId}</td><td className="p-4 font-mono font-bold text-slate-700">{maskCard(card.cardNumber || '')}</td><td className="p-4 font-semibold text-slate-600">{card.expiryStart || '—'} → {card.expiryEnd || card.expiry || '—'}</td><td className="p-4"><span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black uppercase">{card.saleStatus || 'ancien'}</span></td><td className="p-4 text-xs text-slate-500">{card.createdAt ? new Date(card.createdAt).toLocaleString('fr-FR') : '—'}</td></tr>)}
          {filteredCards.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-slate-400">Aucune carte trouvée.</td></tr>}
        </tbody></table></div>
      </section>

      {showForm && <div className="fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"><form onSubmit={validateAndConfirm} className="bg-white w-full max-w-xl rounded-3xl shadow-2xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5 sm:p-7 space-y-5">
        <div className="flex items-start justify-between"><div><h2 className="text-xl font-black text-blue-950">Ajouter au stock</h2><p className="text-xs text-slate-500 mt-1">L’identifiant MC et le QR Code seront générés automatiquement.</p></div><button type="button" onClick={() => setShowForm(false)} className="p-2 rounded-full bg-slate-100 text-slate-500"><X size={18} /></button></div>
        <div><label className="text-xs font-black text-slate-600 uppercase">Numéro de carte *</label><input required inputMode="numeric" value={form.cardNumber} onChange={event => updateCardNumber(event.target.value)} placeholder="0000 0000 0000 0000" className="mt-1.5 w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-mono font-bold outline-none focus:border-blue-500" /></div>
        <div><label className="text-xs font-black text-slate-600 uppercase">Numéro de recharge *</label><input required value={form.rechargeNumber} onChange={event => setForm({ ...form, rechargeNumber: event.target.value })} className="mt-1.5 w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-mono font-bold outline-none focus:border-blue-500" /></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-black text-slate-600 uppercase">Expiration début *</label><input required maxLength={5} value={form.expiryStart} onChange={event => setForm({ ...form, expiryStart: event.target.value })} placeholder="MM/AA" className="mt-1.5 w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-mono text-center font-bold outline-none focus:border-blue-500" /></div><div><label className="text-xs font-black text-slate-600 uppercase">Expiration fin *</label><input required maxLength={5} value={form.expiryEnd} onChange={event => setForm({ ...form, expiryEnd: event.target.value })} placeholder="MM/AA" className="mt-1.5 w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-mono text-center font-bold outline-none focus:border-blue-500" /></div></div>
        <div><label className="text-xs font-black text-slate-600 uppercase">CVV *</label><input required type="password" inputMode="numeric" maxLength={4} value={form.cvv} onChange={event => setForm({ ...form, cvv: event.target.value.replace(/\D/g, '') })} className="mt-1.5 w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-mono font-bold outline-none focus:border-blue-500" /><p className="mt-1 text-[11px] text-slate-400">Le CVV ne sera jamais affiché dans les logs ni dans le résumé.</p></div>
        <button type="submit" className="w-full py-4 rounded-2xl bg-blue-950 text-white font-black hover:bg-blue-900">Vérifier et continuer</button>
      </form></div>}

      {showConfirmation && <div className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"><div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center"><ShieldCheck /></div><div><h3 className="font-black text-lg text-blue-950">Confirmer la carte</h3><p className="text-xs text-slate-500">Vérifiez le résumé masqué avant l’enregistrement.</p></div></div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Carte</span><strong className="font-mono">{maskCard(form.cardNumber)}</strong></div><div className="flex justify-between"><span className="text-slate-500">Recharge</span><strong className="font-mono">{maskRecharge(form.rechargeNumber)}</strong></div><div className="flex justify-between"><span className="text-slate-500">Validité</span><strong>{form.expiryStart} → {form.expiryEnd}</strong></div><div className="flex justify-between"><span className="text-slate-500">Titulaire initial</span><strong>CLIENT MARKET-CASH</strong></div></div>
        <div className="flex gap-3"><button disabled={saving} onClick={() => setShowConfirmation(false)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold">Retour</button><button disabled={saving} onClick={confirmAddCard} className="flex-1 py-3 rounded-2xl bg-amber-400 text-blue-950 font-black flex items-center justify-center gap-2">{saving ? 'Enregistrement...' : <><CheckCircle2 size={17} /> Confirmer</>}</button></div>
      </div></div>}
    </div>
  );
}
