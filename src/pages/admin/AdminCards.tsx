import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { CardCatalog, UserCard } from '../../types';
import { removeUndefined } from '../../lib/firestoreUtils';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, CreditCard, Shield, User, Lock, Sparkles } from 'lucide-react';

export default function AdminCards() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'issued'>('issued');
  
  // Catalog Cards
  const [catalogCards, setCatalogCards] = useState<CardCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [isEditingCatalog, setIsEditingCatalog] = useState(false);
  const [catalogForm, setCatalogForm] = useState<Partial<CardCatalog>>({
    name: '', description: '', price: 0, currency: 'USD', type: 'virtual', network: 'visa', status: 'available', imageUrl: ''
  });

  // Issued User Cards
  const [issuedCards, setIssuedCards] = useState<UserCard[]>([]);
  const [selectedUserCard, setSelectedUserCard] = useState<UserCard | null>(null);
  const [userCardForm, setUserCardForm] = useState({
    cardNumber: '',
    cardHolder: '',
    expiryStart: '',
    expiryEnd: '',
    cvv: '',
    rechargeNumber: '',
    network: 'visa',
    type: 'virtual',
    status: 'active'
  });
  const [savingUserCard, setSavingUserCard] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'cards'));
      const allDocs = snap.docs.map(d => ({ ...d.data(), id: d.id, cardId: d.id }));
      
      // Separate issued cards (cards with userId) from catalog cards (cards with price/description)
      const userCards = (allDocs.filter(d => (d as any).userId) as unknown) as UserCard[];
      const catCards = (allDocs.filter(d => !(d as any).userId && (d as any).name) as unknown) as CardCatalog[];
      
      setIssuedCards(userCards);
      setCatalogCards(catCards);
    } catch (error) {
      console.error(error);
      toast.error('Erreur lors du chargement des cartes.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = isEditingCatalog && catalogForm.id ? catalogForm.id : doc(collection(db, 'cards')).id;
      const card: CardCatalog = {
        ...catalogForm,
        id,
        createdAt: catalogForm.createdAt || Date.now(),
        updatedAt: Date.now(),
      } as CardCatalog;

      await setDoc(doc(db, 'cards', id), removeUndefined(card));
      toast.success(isEditingCatalog ? 'Carte catalogue modifiée' : 'Carte créée');
      setShowCatalogModal(false);
      loadAll();
    } catch (error) {
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  const handleDeleteCatalog = async (id: string) => {
    if (!confirm('Supprimer cette carte du catalogue ?')) return;
    try {
      await deleteDoc(doc(db, 'cards', id));
      toast.success('Carte supprimée');
      loadAll();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const openEditUserCard = (card: UserCard) => {
    setSelectedUserCard(card);
    setUserCardForm({
      cardNumber: card.cardNumber || '',
      cardHolder: card.cardHolder || card.cardHolderName || '',
      expiryStart: card.expiryStart || '02/27',
      expiryEnd: card.expiryEnd || card.expiry || '08/27',
      cvv: card.cvv || '551',
      rechargeNumber: card.rechargeNumber || '',
      network: card.network || 'visa',
      type: card.type || 'virtual',
      status: card.status || 'active'
    });
  };

  const handleSaveUserCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserCard) return;

    setSavingUserCard(true);
    try {
      const cardId = selectedUserCard.cardId || selectedUserCard.id || '';
      const cleanNum = userCardForm.cardNumber.replace(/\s+/g, '');

      await updateDoc(doc(db, 'cards', cardId), {
        cardNumber: cleanNum,
        cardHolder: userCardForm.cardHolder.trim(),
        cardHolderName: userCardForm.cardHolder.trim(),
        expiryStart: userCardForm.expiryStart.trim(),
        expiryEnd: userCardForm.expiryEnd.trim(),
        expiry: userCardForm.expiryEnd.trim(),
        cvv: userCardForm.cvv.trim(),
        rechargeNumber: userCardForm.rechargeNumber.trim() || '',
        network: userCardForm.network,
        type: userCardForm.type,
        status: userCardForm.status,
        updatedAt: Date.now()
      });

      toast.success('Informations de la carte client mises à jour.');
      setSelectedUserCard(null);
      loadAll();
    } catch (error: any) {
      console.error('[SAVE_USER_CARD_ERROR]', error);
      toast.error("Erreur lors de la mise à jour de la carte client.");
    } finally {
      setSavingUserCard(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 font-bold">Chargement des cartes...</div>;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight">Gestion des Cartes</h1>
          <p className="text-xs text-slate-500 font-medium">Gestion des cartes actives attribuées aux clients et du catalogue</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('issued')}
          className={`pb-4 px-2 font-black text-lg flex items-center gap-2 cursor-pointer transition border-b-2 ${
            activeTab === 'issued' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          <CreditCard size={20} />
          <span>Cartes Émises aux Clients ({issuedCards.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('catalog')}
          className={`pb-4 px-2 font-black text-lg flex items-center gap-2 cursor-pointer transition border-b-2 ${
            activeTab === 'catalog' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          <Sparkles size={20} />
          <span>Catalogue ({catalogCards.length})</span>
        </button>
      </div>

      {/* TAB 1: ISSUED CLIENT CARDS */}
      {activeTab === 'issued' && (
        <div className="space-y-4">
          <div className="bg-white rounded-[2.5rem] border-4 border-slate-100/50 overflow-hidden shadow-xl shadow-slate-200/40 p-3">
            <div className="overflow-x-auto rounded-[1.5rem]">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-800 border-b border-slate-200">
                  <tr>
                    <th className="p-4 font-bold text-xs uppercase tracking-wider">Client</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-wider">Numéro de carte</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-wider">N° Recharge</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-wider">Expiration</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-wider">CVV</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-wider">Statut</th>
                    <th className="p-4 font-bold text-xs uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {issuedCards.map(card => (
                    <tr key={card.cardId || card.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-4">
                        <div className="font-bold text-slate-900">{card.cardHolder || card.userName || 'Client'}</div>
                        <div className="text-xs text-slate-500">{card.userEmail || card.userId}</div>
                      </td>
                      <td className="p-4 font-mono font-bold text-slate-800">
                        {card.cardNumber?.replace(/(\d{4})(?=\d)/g, '$1 ') || '•••• •••• •••• ••••'}
                      </td>
                      <td className="p-4">
                        {card.rechargeNumber ? (
                          <span className="font-mono text-xs bg-amber-50 text-amber-900 border border-amber-200 px-2 py-1 rounded-lg font-bold">
                            {card.rechargeNumber}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Non renseigné</span>
                        )}
                      </td>
                      <td className="p-4 font-mono text-xs font-bold text-slate-700">
                        {card.expiryStart || '02/27'} - {card.expiryEnd || card.expiry || '08/27'}
                      </td>
                      <td className="p-4 font-mono text-xs font-bold text-slate-700">
                        {card.cvv || '551'}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase ${
                          card.status === 'blocked' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {card.status === 'blocked' ? 'Bloquée' : 'Active'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => openEditUserCard(card)}
                          className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl font-bold text-xs transition cursor-pointer"
                        >
                          Modifier
                        </button>
                      </td>
                    </tr>
                  ))}
                  {issuedCards.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 font-medium">Aucune carte active attribuée aux clients.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CATALOG CARDS */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button 
              onClick={() => {
                setCatalogForm({ name: '', description: '', price: 0, currency: 'USD', type: 'virtual', network: 'visa', status: 'available', imageUrl: '' });
                setIsEditingCatalog(false);
                setShowCatalogModal(true);
              }} 
              className="bg-blue-950 text-amber-400 px-6 py-3 rounded-2xl flex items-center space-x-2 font-bold hover:bg-blue-900 transition-colors shadow-md shadow-blue-900/20 cursor-pointer"
            >
              <Plus size={20} />
              <span>Nouvelle carte catalogue</span>
            </button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {catalogCards.map(card => (
              <div key={card.id} className="bg-white rounded-[2.5rem] border-4 border-slate-100/50 shadow-xl shadow-slate-200/40 overflow-hidden hover:-translate-y-1 transition-transform">
                <div className="h-36 bg-slate-50 relative">
                  {card.imageUrl ? <img src={card.imageUrl} className="w-full h-full object-cover" /> : null}
                  <div className="absolute top-4 right-4 bg-white/95 px-3 py-1.5 text-xs font-black rounded-lg shadow-sm uppercase text-slate-700">{card.status}</div>
                </div>
                <div className="p-6">
                  <h3 className="font-bold text-xl text-slate-800 tracking-tight mb-1">{card.name}</h3>
                  <div className="text-emerald-600 font-black mb-4 bg-emerald-50 inline-block px-3 py-1 rounded-xl">{card.price} {card.currency}</div>
                  <p className="text-sm text-slate-600 mb-6 h-10 overflow-hidden">{card.description}</p>
                  
                  <div className="flex justify-between items-center pt-4 border-t border-slate-100/50">
                    <div className="space-x-3 flex">
                      <button 
                        onClick={() => {
                          setCatalogForm(card);
                          setIsEditingCatalog(true);
                          setShowCatalogModal(true);
                        }} 
                        className="p-3 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer"
                      >
                        <Edit2 size={18}/>
                      </button>
                      <button 
                        onClick={() => handleDeleteCatalog(card.id)} 
                        className="p-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                      >
                        <Trash2 size={18}/>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EDIT USER CARD MODAL */}
      {selectedUserCard && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <form onSubmit={handleSaveUserCard} className="bg-white rounded-[2.5rem] w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto shadow-2xl space-y-4">
            <h3 className="font-black text-2xl text-slate-800 tracking-tight">Modifier la carte client</h3>
            <p className="text-xs text-slate-500 font-medium">
              Client : <strong>{selectedUserCard.cardHolder || selectedUserCard.userName}</strong>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Numéro de carte</label>
                <input 
                  required 
                  type="text" 
                  value={userCardForm.cardNumber} 
                  onChange={e => setUserCardForm({...userCardForm, cardNumber: e.target.value})} 
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono font-bold text-slate-800 outline-none focus:border-blue-500" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Nom du Titulaire</label>
                <input 
                  required 
                  type="text" 
                  value={userCardForm.cardHolder} 
                  onChange={e => setUserCardForm({...userCardForm, cardHolder: e.target.value})} 
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:border-blue-500" 
                />
              </div>

              {/* NUMÉRO DE RECHARGE (Nouveau champ Admin) */}
              <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200">
                <label className="block text-xs font-black text-amber-900 mb-1 uppercase">Numéro de Recharge (Gestion Admin)</label>
                <input 
                  type="text" 
                  placeholder="Ex: REC-8890-4421-99"
                  value={userCardForm.rechargeNumber} 
                  onChange={e => setUserCardForm({...userCardForm, rechargeNumber: e.target.value})} 
                  className="w-full px-4 py-2.5 bg-white border border-amber-300 rounded-xl font-mono font-bold text-amber-900 outline-none focus:border-amber-500 text-sm" 
                />
                <span className="text-[10px] text-amber-700 font-medium block mt-1">
                  Ce numéro est visible uniquement par le client lors du déverrouillage de sa carte.
                </span>
              </div>

              {/* Expiration Début & Fin */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Expiration Début</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="02/27" 
                    value={userCardForm.expiryStart} 
                    onChange={e => setUserCardForm({...userCardForm, expiryStart: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-center font-bold text-slate-800 outline-none focus:border-blue-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Expiration Fin</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="08/27" 
                    value={userCardForm.expiryEnd} 
                    onChange={e => setUserCardForm({...userCardForm, expiryEnd: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-center font-bold text-slate-800 outline-none focus:border-blue-500" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">CVV</label>
                  <input 
                    required 
                    type="text" 
                    maxLength={4} 
                    value={userCardForm.cvv} 
                    onChange={e => setUserCardForm({...userCardForm, cvv: e.target.value})} 
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-mono text-center font-bold text-slate-800 outline-none focus:border-blue-500" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Statut</label>
                  <select 
                    value={userCardForm.status} 
                    onChange={e => setUserCardForm({...userCardForm, status: e.target.value as any})} 
                    className="w-full px-3 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:border-blue-500 text-xs"
                  >
                    <option value="active">Active</option>
                    <option value="blocked">Bloquée</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Type</label>
                  <select 
                    value={userCardForm.type} 
                    onChange={e => setUserCardForm({...userCardForm, type: e.target.value as any})} 
                    className="w-full px-3 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:border-blue-500 text-xs"
                  >
                    <option value="virtual">Virtuelle</option>
                    <option value="physical">Physique</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex space-x-3 pt-4">
              <button 
                type="button" 
                onClick={() => setSelectedUserCard(null)} 
                className="flex-1 py-3.5 rounded-2xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors cursor-pointer text-sm"
              >
                Annuler
              </button>
              <button 
                type="submit" 
                disabled={savingUserCard} 
                className="flex-1 py-3.5 rounded-2xl bg-blue-600 text-white font-black tracking-wide hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-lg shadow-blue-600/30 cursor-pointer text-sm"
              >
                {savingUserCard ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CATALOG MODAL */}
      {showCatalogModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <form onSubmit={handleSaveCatalog} className="bg-white rounded-[2.5rem] w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto shadow-2xl">
            <h3 className="font-black text-2xl mb-6 text-slate-800 tracking-tight">{isEditingCatalog ? 'Modifier la carte' : 'Nouvelle carte'}</h3>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Nom</label>
                <input required type="text" value={catalogForm.name} onChange={e => setCatalogForm({...catalogForm, name: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white focus:ring-0 outline-none transition-all font-medium text-slate-800" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Description</label>
                <textarea required value={catalogForm.description} onChange={e => setCatalogForm({...catalogForm, description: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white focus:ring-0 outline-none transition-all font-medium text-slate-800 h-24 resize-none" />
              </div>
              <div className="flex space-x-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Prix</label>
                  <input required type="number" value={catalogForm.price} onChange={e => setCatalogForm({...catalogForm, price: Number(e.target.value)})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white focus:ring-0 outline-none transition-all font-medium text-slate-800" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Devise</label>
                  <input required type="text" value={catalogForm.currency} onChange={e => setCatalogForm({...catalogForm, currency: e.target.value})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white focus:ring-0 outline-none transition-all font-medium text-slate-800" />
                </div>
              </div>
              <div className="flex space-x-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Type</label>
                  <select value={catalogForm.type} onChange={e => setCatalogForm({...catalogForm, type: e.target.value as any})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white focus:ring-0 outline-none transition-all font-medium text-slate-800">
                    <option value="virtual">Virtuelle</option>
                    <option value="physical">Physique</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Réseau</label>
                  <select value={catalogForm.network} onChange={e => setCatalogForm({...catalogForm, network: e.target.value as any})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white focus:ring-0 outline-none transition-all font-medium text-slate-800">
                    <option value="visa">Visa</option>
                    <option value="mastercard">Mastercard</option>
                    <option value="amex">Amex</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Statut</label>
                <select value={catalogForm.status} onChange={e => setCatalogForm({...catalogForm, status: e.target.value as any})} className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white focus:ring-0 outline-none transition-all font-medium text-slate-800">
                  <option value="available">Disponible</option>
                  <option value="disabled">Désactivée</option>
                </select>
              </div>
            </div>
            <div className="flex space-x-4 mt-8">
              <button type="button" onClick={() => setShowCatalogModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-700 font-bold rounded-2xl hover:bg-slate-200 transition-colors cursor-pointer">Annuler</button>
              <button type="submit" className="flex-1 py-4 bg-blue-950 text-white font-black tracking-wide rounded-2xl hover:bg-blue-900 transition-colors shadow-lg shadow-blue-950/30 cursor-pointer">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
