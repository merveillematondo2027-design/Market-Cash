import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { UserCard } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { cardService } from '../../services/cardService';
import toast from 'react-hot-toast';
import { Package, Search, Plus, CreditCard, Shield, AlertCircle } from 'lucide-react';

export default function AdminStock() {
  const { user } = useAuthStore();
  const [stockCards, setStockCards] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isAdding, setIsAdding] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  
  const [addForm, setAddForm] = useState({
    cardNumber: '',
    cardHolder: '',
    expiryStart: '02/27',
    expiryEnd: '08/27',
    cvv: '551',
    rechargeNumber: '',
    network: 'visa' as any,
    type: 'virtual' as any,
    count: 1 // how many to add (we can loop)
  });

  useEffect(() => {
    // Only fetch available and reserved cards for stock
    const q = query(collection(db, 'cards'), where('saleStatus', 'in', ['available', 'reserved']));
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => d.data() as UserCard)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setStockCards(docs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsAdding(true);
    
    try {
      let added = 0;
      for (let i = 0; i < addForm.count; i++) {
        await cardService.addCardToStock({
          ...addForm,
          creator: { email: user.email!, uid: user.uid, agencyId: user.agencyId, agencyName: user.agencyName }
        });
        added++;
      }
      toast.success(`${added} carte(s) ajoutée(s) au stock avec succès !`);
      setShowAddModal(false);
      setAddForm({...addForm, cardNumber: '', cardHolder: ''}); // reset some fields
    } catch (err: any) {
      console.error(err);
      toast.error("Erreur lors de l'ajout au stock.");
    } finally {
      setIsAdding(false);
    }
  };

  const filteredCards = stockCards.filter(card => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (card.cardIdentifier && card.cardIdentifier.toLowerCase().includes(q)) ||
      (card.cardNumber && card.cardNumber.includes(q))
    );
  });

  const availableCount = stockCards.filter(c => c.saleStatus === 'available').length;
  const reservedCount = stockCards.filter(c => c.saleStatus === 'reserved').length;
  const virtualCount = stockCards.filter(c => c.type === 'virtual' && c.saleStatus === 'available').length;
  const physicalCount = stockCards.filter(c => c.type === 'physical' && c.saleStatus === 'available').length;

  if (loading) return <div className="p-8 text-center text-slate-500 font-bold">Chargement du stock...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-blue-950 tracking-tight flex items-center gap-2">
            <Package className="text-amber-500" />
            Stock de Cartes
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">Gérez les cartes disponibles avant leur attribution.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-950 hover:bg-blue-900 text-white font-bold rounded-2xl transition shadow-lg shadow-blue-950/20"
        >
          <Plus size={20} />
          <span>Ajouter des cartes</span>
        </button>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
          <div className="relative z-10">
            <div className="text-sm font-bold text-slate-500 mb-1">Total Disponible</div>
            <div className="text-4xl font-black text-blue-950">{availableCount}</div>
          </div>
          <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
            <Package size={100} />
          </div>
        </div>
        
        <div className="bg-emerald-50 p-5 rounded-[2rem] border border-emerald-100 shadow-sm relative overflow-hidden group">
          <div className="relative z-10">
            <div className="text-sm font-bold text-emerald-700 mb-1">Physiques (Dispo)</div>
            <div className="text-4xl font-black text-emerald-600">{physicalCount}</div>
          </div>
        </div>
        
        <div className="bg-purple-50 p-5 rounded-[2rem] border border-purple-100 shadow-sm relative overflow-hidden group">
          <div className="relative z-10">
            <div className="text-sm font-bold text-purple-700 mb-1">Virtuelles (Dispo)</div>
            <div className="text-4xl font-black text-purple-600">{virtualCount}</div>
          </div>
        </div>
        
        <div className="bg-amber-50 p-5 rounded-[2rem] border border-amber-100 shadow-sm relative overflow-hidden group">
          <div className="relative z-10">
            <div className="text-sm font-bold text-amber-700 mb-1">Réservées</div>
            <div className="text-4xl font-black text-amber-600">{reservedCount}</div>
          </div>
        </div>
      </div>
      
      {availableCount === 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-2xl flex items-start gap-3">
          <AlertCircle className="text-red-500 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-red-800 uppercase tracking-wide">Stock Épuisé</h3>
            <p className="text-sm text-red-700 mt-1">Aucune carte n'est disponible dans le stock. Les commandes ne pourront pas être finalisées. Ajoutez des cartes immédiatement.</p>
          </div>
        </div>
      )}

      {/* Search & List */}
      <div className="bg-white rounded-[2.5rem] border-4 border-slate-100/50 shadow-xl shadow-slate-200/40 p-4 sm:p-6">
        <div className="relative mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par ID (MC-...) ou numéro..."
            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none font-bold text-slate-800 transition"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        </div>
        
        <div className="overflow-x-auto rounded-[1.5rem]">
          <table className="w-full text-left text-sm text-slate-600 min-w-[800px]">
            <thead className="bg-slate-50 text-slate-800 border-b border-slate-200">
              <tr>
                <th className="p-4 font-bold text-xs uppercase tracking-wider">ID Unique & Date</th>
                <th className="p-4 font-bold text-xs uppercase tracking-wider">Type</th>
                <th className="p-4 font-bold text-xs uppercase tracking-wider">Numéro de carte</th>
                <th className="p-4 font-bold text-xs uppercase tracking-wider">Titulaire</th>
                <th className="p-4 font-bold text-xs uppercase tracking-wider">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCards.map(card => (
                <tr key={card.id} className="hover:bg-slate-50/80 transition">
                  <td className="p-4">
                    <div className="font-mono font-black text-blue-950 text-base">{card.cardIdentifier}</div>
                    <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                      {new Date(card.createdAt).toLocaleString()}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${card.type === 'physical' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'}`}>
                      {card.type === 'physical' ? 'Physique' : 'Virtuelle'}
                    </span>
                  </td>
                  <td className="p-4 font-mono font-bold text-slate-700">
                    {card.cardNumber?.replace(/(\d{4})(?=\d)/g, '$1 ')}
                  </td>
                  <td className="p-4 font-bold text-slate-800">
                    {card.cardHolder || '-'}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${card.saleStatus === 'available' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                      {card.saleStatus === 'available' ? 'Disponible' : 'Réservée'}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredCards.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400 font-medium">
                    Aucune carte dans le stock.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <form onSubmit={handleAddStock} className="bg-white rounded-[2.5rem] w-full max-w-lg p-6 sm:p-8 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-black text-2xl text-blue-950 tracking-tight">Ajouter au stock</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <p className="text-xs font-medium text-slate-500 mb-6">
              L'ID unique (MC-...) et le QR Code seront générés automatiquement.
            </p>

            <div className="grid grid-cols-2 gap-4">
              
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Nombre à générer</label>
                <input 
                  type="number" min="1" max="50"
                  value={addForm.count}
                  onChange={e => setAddForm({...addForm, count: parseInt(e.target.value)})}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:border-blue-500 text-center"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Nom sur la carte (optionnel si vierge)</label>
              <input 
                type="text" 
                placeholder="Ex: CLIENT MARKET-CASH"
                value={addForm.cardHolder}
                onChange={e => setAddForm({...addForm, cardHolder: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:border-blue-500"
              />
            </div>

            {addForm.count === 1 && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Numéro (16 chiffres)</label>
                <input 
                  type="text" 
                  placeholder="Laisser vide pour générer plus tard"
                  value={addForm.cardNumber}
                  onChange={e => setAddForm({...addForm, cardNumber: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold text-slate-800 outline-none focus:border-blue-500"
                />
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Expiration Début</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="02/27" 
                    value={addForm.expiryStart} 
                    onChange={e => setAddForm({...addForm, expiryStart: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-center font-bold text-slate-800 outline-none focus:border-blue-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Expiration Fin</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="08/27" 
                    value={addForm.expiryEnd} 
                    onChange={e => setAddForm({...addForm, expiryEnd: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-center font-bold text-slate-800 outline-none focus:border-blue-500" 
                  />
                </div>
            </div>

            <button
              type="submit"
              disabled={isAdding}
              className="w-full py-4 mt-2 bg-blue-950 text-white font-black rounded-2xl hover:bg-blue-900 transition shadow-lg shadow-blue-950/30 flex justify-center items-center"
            >
              {isAdding ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                'Générer & Ajouter au stock'
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
