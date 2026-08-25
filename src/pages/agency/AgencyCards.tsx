import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { UserCard, User } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { cardService } from '../../services/cardService';
import { cleanFirestoreData } from '../../lib/firestoreUtils';
import { downloadPvcCardImage } from '../../lib/pvcCardGenerator';
import toast from 'react-hot-toast';
import { 
  CreditCard, 
  Download, 
  Printer, 
  CheckCircle, 
  Clock, 
  Search, 
  Eye, 
  Plus, 
  X, 
  Sparkles, 
  QrCode, 
  Shield, 
  User as UserIcon,
  Filter
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import MarketCashCard from '../../components/MarketCashCard';

export default function AgencyCards() {
  const { user } = useAuthStore();
  const [cards, setCards] = useState<UserCard[]>([]);
  const [cardBackgroundUrl, setCardBackgroundUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'TO_PRINT' | 'PRINTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [selectedCard, setSelectedCard] = useState<UserCard | null>(null);
  const [showDirectSaleModal, setShowDirectSaleModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Direct sale form
  const [clients, setClients] = useState<User[]>([]);
  const [saleForm, setSaleForm] = useState({
    userId: '',
    clientName: '',
    clientEmail: '',
    cardNumber: '',
    cardHolder: '',
    expiryStart: '02/27',
    expiryEnd: '08/27',
    cvv: '551',
    rechargeNumber: '',
    network: 'visa' as const
  });

  useEffect(() => {
    const qCards = query(collection(db, 'cards'));
    const unsub = onSnapshot(qCards, (snap) => {
      const allDocs = snap.docs
        .map(d => ({ ...d.data(), id: d.id, cardId: d.id } as UserCard))
        .filter(c => c.saleStatus === 'sold' || (c as any).userId || c.type === 'physical')
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      
      setCards(allDocs);
      setLoading(false);
    }, (err) => {
      console.error('[AGENCY_CARDS_ERR]', err);
      setLoading(false);
    });

    // Real-time listener for card design
    const unsubDesign = cardService.subscribeCardDesign((design) => {
      if (design && design.backgroundUrl) {
        setCardBackgroundUrl(design.backgroundUrl);
      } else {
        setCardBackgroundUrl('');
      }
    });

    loadClients();

    return () => {
      unsub();
      unsubDesign();
    };
  }, []);

  const loadClients = async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'client'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => d.data() as User);
      setClients(list);
    } catch (e) {
      console.error('[LOAD_CLIENTS_ERR]', e);
    }
  };

  const handleOpenDirectSale = () => {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const randomCVV = Math.floor(100 + Math.random() * 900).toString();
    setSaleForm({
      userId: '',
      clientName: '',
      clientEmail: '',
      cardNumber: `4532 •••• •••• ${randomDigits}`,
      cardHolder: '',
      expiryStart: '02/27',
      expiryEnd: '08/27',
      cvv: randomCVV,
      rechargeNumber: `RC-${Date.now().toString().slice(-6)}`,
      network: 'visa'
    });
    setShowDirectSaleModal(true);
  };

  const handleClientSelect = (userId: string) => {
    const found = clients.find(c => c.uid === userId);
    if (found) {
      setSaleForm(prev => ({
        ...prev,
        userId: found.uid,
        clientName: found.displayName || found.email,
        clientEmail: found.email,
        cardHolder: (found.displayName || found.email.split('@')[0]).toUpperCase()
      }));
    }
  };

  const handleSubmitDirectSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!saleForm.userId && !saleForm.clientEmail) {
      toast.error('Veuillez sélectionner ou renseigner un client.');
      return;
    }

    setIsProcessing(true);
    try {
      // 1. Generate unique sequential card identifier MC-001-YYYYMMDD
      const cardIdentifier = await cardService.generateNextCardIdentifier();

      // 2. Target user ID
      const targetUserId = saleForm.userId || 'direct_sale_' + Date.now();

      // 3. Create Card in Firestore
      const cardId = doc(collection(db, 'cards')).id;
      const newCard: Partial<UserCard> = {
        id: cardId,
        cardId: cardId,
        cardIdentifier,
        userId: targetUserId,
        userName: saleForm.clientName || saleForm.clientEmail,
        userEmail: saleForm.clientEmail,
        cardNumber: saleForm.cardNumber,
        cardHolder: saleForm.cardHolder.toUpperCase(),
        expiryStart: saleForm.expiryStart,
        expiryEnd: saleForm.expiryEnd,
        cvv: saleForm.cvv,
        rechargeNumber: saleForm.rechargeNumber,
        network: saleForm.network,
        type: 'physical',
        status: 'active',
        saleStatus: 'sold',
        soldAt: Date.now(),
        soldByAgencyId: user.agencyId || user.uid,
        soldByAgencyName: user.agencyName || user.displayName || 'Agence Locale',
        printStatus: 'pending',
        isPhysical: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await setDoc(doc(db, 'cards', cardId), cleanFirestoreData(newCard));

      // 4. If linked to an app user, notify them
      if (saleForm.userId) {
        await setDoc(doc(collection(db, 'notifications')), {
          userId: saleForm.userId,
          title: 'Nouvelle carte émise',
          message: `Votre agence vous a attribué la carte physique ${cardIdentifier}.`,
          type: 'success',
          read: false,
          createdAt: Date.now()
        });
      }

      // 5. Notify Designer Graphique for PVC Print
      await cardService.notifyRole(
        'designer_graphique',
        'Nouvelle carte à imprimer',
        `Une vente directe ${cardIdentifier} a été effectuée pour ${newCard.cardHolder}. Prête pour impression PVC.`
      );

      toast.success(`Vente enregistrée ! Carte ${cardIdentifier} transmise au designer.`);
      setShowDirectSaleModal(false);
    } catch (err: any) {
      console.error('[DIRECT_SALE_ERR]', err);
      toast.error('Erreur lors de l\'enregistrement de la vente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadPvc = async (card: UserCard, side: 'front' | 'back') => {
    setDownloadingId(`${card.id}_${side}`);
    try {
      await downloadPvcCardImage(card, side);
      toast.success(`Fichier ${side === 'front' ? 'Recto' : 'Verso'} téléchargé !`);
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors du téléchargement');
    } finally {
      setDownloadingId(null);
    }
  };

  const filteredCards = cards.filter(c => {
    const isToPrint = (c as any).printStatus === 'pending' || ((c as any).saleStatus === 'sold' && !(c as any).printStatus);
    const isPrinted = (c as any).printStatus === 'printed';

    if (activeFilter === 'TO_PRINT' && !isToPrint) return false;
    if (activeFilter === 'PRINTED' && !isPrinted) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.cardHolder?.toLowerCase().includes(q) ||
      c.cardIdentifier?.toLowerCase().includes(q) ||
      c.userEmail?.toLowerCase().includes(q) ||
      c.cardNumber?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header & Direct Sale Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <CreditCard className="text-blue-600" />
            Cartes Vendues & Suivi Impression
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Consultez les cartes vendues par votre agence et suivez l'avancement d'impression par l'atelier graphique.
          </p>
        </div>

        <button
          onClick={handleOpenDirectSale}
          className="bg-blue-950 hover:bg-blue-900 text-amber-400 font-black text-xs px-4 py-2.5 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all shrink-0 touch-manipulation"
        >
          <Plus size={16} />
          <span>Vente Directe en Agence</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Rechercher par titulaire, identifiant MC-001..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'TO_PRINT', 'PRINTED'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all touch-manipulation ${
                activeFilter === filter
                  ? 'bg-blue-950 text-amber-400 shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {filter === 'ALL' ? 'Toutes les cartes' :
               filter === 'TO_PRINT' ? 'À imprimer (Atelier)' : 'Imprimées'}
            </button>
          ))}
        </div>
      </div>

      {/* Cards List (Mobile First Grid) */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Chargement des cartes...</div>
      ) : filteredCards.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200/80 shadow-sm space-y-2">
          <CreditCard size={36} className="mx-auto text-slate-300" />
          <h3 className="font-bold text-slate-700 text-sm">Aucune carte trouvée</h3>
          <p className="text-xs text-slate-400">Aucune carte ne correspond aux filtres actuels.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCards.map((c) => {
            const isPrinted = (c as any).printStatus === 'printed';
            return (
              <div
                key={c.id}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3.5"
              >
                {/* Header: Identifier & Badge */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black text-blue-950 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                    {c.cardIdentifier || 'MC-001-20260824'}
                  </span>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider ${
                    isPrinted
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                      : 'bg-amber-100 text-amber-900 border border-amber-200'
                  }`}>
                    {isPrinted ? 'Imprimée' : 'À Imprimer'}
                  </span>
                </div>

                {/* Mini PVC Preview Card */}
                <MarketCashCard 
                  card={c}
                  backgroundUrl={cardBackgroundUrl}
                  mode="admin"
                  isRevealed={true}
                  showRevealButton={false}
                  className="shadow-sm"
                />

                {/* Info summary */}
                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100 text-[11px] text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Client :</span>
                    <span className="font-bold text-slate-800 truncate max-w-[160px]">{c.userName || c.userEmail || '-'}</span>
                  </div>
                  {isPrinted && (c as any).printedAt && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Imprimée le :</span>
                      <span>{new Date((c as any).printedAt).toLocaleDateString('fr-FR')}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setSelectedCard(c)}
                    className="flex-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-900 text-slate-700 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Eye size={14} />
                    <span>Détails</span>
                  </button>
                  <button
                    onClick={() => handleDownloadPvc(c, 'front')}
                    disabled={downloadingId === `${c.id}_front`}
                    className="bg-blue-950 hover:bg-blue-900 text-amber-400 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs"
                    title="Télécharger Maquette Recto"
                  >
                    <Download size={14} />
                    <span>PVC</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Direct Sale Modal */}
      {showDirectSaleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-950 flex items-center justify-center font-bold">
                  <Plus size={18} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm sm:text-base">Vente Directe en Agence</h3>
                  <p className="text-xs text-slate-500">Enregistrer une vente de carte physique</p>
                </div>
              </div>
              <button 
                onClick={() => setShowDirectSaleModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitDirectSale} className="space-y-3.5">
              {/* Client Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Associer à un Client (Inscrit sur l'App)
                </label>
                <select
                  value={saleForm.userId}
                  onChange={(e) => handleClientSelect(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">-- Sélectionner un client ou saisir manuellement --</option>
                  {clients.map(cl => (
                    <option key={cl.uid} value={cl.uid}>
                      {cl.displayName || cl.email} ({cl.email})
                    </option>
                  ))}
                </select>
              </div>

              {!saleForm.userId && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email du Client (Non inscrit ou direct)
                  </label>
                  <input
                    type="email"
                    required={!saleForm.userId}
                    placeholder="client@email.com"
                    value={saleForm.clientEmail}
                    onChange={(e) => setSaleForm({ ...saleForm, clientEmail: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nom du Titulaire (inscrit sur le plastique PVC)
                </label>
                <input
                  type="text"
                  required
                  placeholder="EX: JEAN DUPONT"
                  value={saleForm.cardHolder}
                  onChange={(e) => setSaleForm({ ...saleForm, cardHolder: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Numéro de Carte
                  </label>
                  <input
                    type="text"
                    required
                    value={saleForm.cardNumber}
                    onChange={(e) => setSaleForm({ ...saleForm, cardNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Code CVV
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={saleForm.cvv}
                    onChange={(e) => setSaleForm({ ...saleForm, cvv: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Validité (Début / Fin)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={saleForm.expiryStart}
                      onChange={(e) => setSaleForm({ ...saleForm, expiryStart: e.target.value })}
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-center"
                    />
                    <span className="text-slate-400 text-xs">/</span>
                    <input
                      type="text"
                      value={saleForm.expiryEnd}
                      onChange={(e) => setSaleForm({ ...saleForm, expiryEnd: e.target.value })}
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-center"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    N° de Recharge
                  </label>
                  <input
                    type="text"
                    value={saleForm.rechargeNumber}
                    onChange={(e) => setSaleForm({ ...saleForm, rechargeNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDirectSaleModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl font-bold text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 bg-blue-950 hover:bg-blue-900 text-amber-400 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  <CreditCard size={16} />
                  <span>{isProcessing ? 'Enregistrement...' : 'Enregistrer Vente'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Card Details Modal */}
      {selectedCard && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-800 text-base">Détails de la Carte</h3>
              <button 
                onClick={() => setSelectedCard(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Recto Preview */}
            <div className="p-1 bg-slate-900/5 rounded-2xl">
              <MarketCashCard 
                card={selectedCard}
                backgroundUrl={cardBackgroundUrl}
                mode="admin"
                isRevealed={true}
                showRevealButton={false}
              />
            </div>

            <div className="space-y-2 bg-slate-50 rounded-xl p-3 text-xs">
              <div className="flex justify-between"><span className="text-slate-400">Identifiant :</span><span className="font-mono font-bold">{selectedCard.cardIdentifier || '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Code CVV :</span><span className="font-mono font-bold">{selectedCard.cvv || '551'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">N° Recharge :</span><span className="font-mono font-bold">{selectedCard.rechargeNumber || '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Statut Impression :</span><span className="font-bold text-amber-700">{(selectedCard as any).printStatus === 'printed' ? 'Imprimée' : 'À Imprimer'}</span></div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleDownloadPvc(selectedCard, 'front')}
                className="flex-1 bg-blue-950 text-amber-400 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Download size={15} />
                <span>Télécharger Recto</span>
              </button>
              <button
                onClick={() => handleDownloadPvc(selectedCard, 'back')}
                className="flex-1 bg-slate-800 text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Download size={15} />
                <span>Télécharger Verso</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
