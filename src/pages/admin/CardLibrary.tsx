import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where,
  onSnapshot, 
  doc, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { UserCard, User } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { cardService } from '../../services/cardService';
import { downloadPvcCardImage } from '../../lib/pvcCardGenerator';
import toast from 'react-hot-toast';
import { 
  CreditCard, 
  Download, 
  Printer, 
  CheckCircle, 
  Clock, 
  Filter, 
  Search, 
  Eye, 
  Plus, 
  X, 
  Sparkles, 
  QrCode, 
  Shield, 
  Building, 
  User as UserIcon,
  Calendar,
  Layers,
  FileCheck
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import MarketCashCard from '../../components/MarketCashCard';

type LibraryFilter = 'ALL' | 'SOLD' | 'TO_PRINT' | 'PRINTED';

export default function CardLibrary() {
  const { user } = useAuthStore();
  const [cards, setCards] = useState<UserCard[]>([]);
  const [cardBackgroundUrl, setCardBackgroundUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>(
    user?.role === 'designer_graphique' ? 'TO_PRINT' : 'ALL'
  );
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
    cardHolder: ''
  });

  useEffect(() => {
    // Real-time listener for cards
    const qCards = query(collection(db, 'cards'), where('saleStatus', 'in', ['sold', 'delivered', 'cancelled', 'confirmed']));
    const unsubscribe = onSnapshot(qCards, (snap) => {
      const allDocs = snap.docs
        .map(d => ({ ...d.data(), id: d.id, cardId: d.id } as UserCard))
        // Keep physical cards or issued cards
        .filter(c => c.type === 'physical' || (c as any).saleStatus || (c as any).printStatus)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      setCards(allDocs);
      setLoading(false);
    }, (err) => {
      console.error('[CARD_LIBRARY_ERROR]', err);
      setLoading(false);
    });

    // Real-time listener for card design
    const unsubscribeDesign = cardService.subscribeCardDesign((design) => {
      if (design && design.backgroundUrl) {
        setCardBackgroundUrl(design.backgroundUrl);
      } else {
        setCardBackgroundUrl('');
      }
    });

    loadClients();

    return () => {
      unsubscribe();
      unsubscribeDesign();
    };
  }, []);

  const loadClients = async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'client'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => d.data() as User);
      setClients(list);
    } catch (e) {
      console.error('[LOAD_CLIENTS_ERROR]', e);
    }
  };

  // Filter cards based on user scope and selected tab
  const filteredCards = cards.filter(card => {
    // 1. Agency Scope for Chef d'agence
    if (user?.role === 'chef_agence' && user.agencyId) {
      if (card.agencyId && card.agencyId !== user.agencyId) {
        return false;
      }
    }

    // 2. Tab Filter
    if (activeFilter === 'SOLD') {
      if (!['sold', 'confirmed'].includes(card.saleStatus || '')) return false;
    } else if (activeFilter === 'TO_PRINT') {
      if (!['sold', 'confirmed'].includes(card.saleStatus || '') || card.printStatus === 'printed') return false;
    } else if (activeFilter === 'PRINTED') {
      if (card.printStatus !== 'printed') return false;
    }

    // 3. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = (card.cardIdentifier || '').toLowerCase().includes(q);
      const matchHolder = (card.cardHolder || '').toLowerCase().includes(q);
      const matchNum = (card.cardNumber || '').includes(q);
      const matchAgency = (card.agencyName || card.agencyId || '').toLowerCase().includes(q);
      if (!matchId && !matchHolder && !matchNum && !matchAgency) return false;
    }

    return true;
  });

  // Action: Mark as Printed (Designer / Admin / Chef d'agence)
  const handleMarkAsPrinted = async (card: UserCard) => {
    if (!user) return;
    try {
      setIsProcessing(true);
      await cardService.markCardAsPrinted(card, {
        email: user.email,
        uid: user.uid
      });
      toast.success(`La carte ${card.cardIdentifier || card.cardId} a été marquée comme IMPRIMÉE !`);
      if (selectedCard?.id === card.id) {
        setSelectedCard(prev => prev ? { ...prev, printStatus: 'printed', printedAt: Date.now(), printedBy: user.email } : null);
      }
    } catch (err: any) {
      console.error('[MARK_PRINTED_ERROR]', err);
      toast.error("Erreur lors de la confirmation d'impression.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Action: Download high-res PVC Card image
  const handleDownloadPvc = async (card: UserCard) => {
    const cardId = card.cardIdentifier || card.cardId || 'MC-001-20260823';
    try {
      setDownloadingId(card.cardId || card.id || '');
      toast.loading(`Génération du fichier haute résolution ${cardId}.png...`, { id: 'download-pvc' });
      await downloadPvcCardImage(card, `${cardId}.png`);
      toast.success(`Carte PVC ${cardId}.png téléchargée !`, { id: 'download-pvc' });
    } catch (err) {
      console.error('[DOWNLOAD_PVC_ERROR]', err);
      toast.error('Erreur lors du téléchargement de la carte.', { id: 'download-pvc' });
    } finally {
      setDownloadingId(null);
    }
  };

  // Action: Direct Sale submission
  const handleDirectSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!saleForm.userId || !saleForm.cardHolder) {
      toast.error('Veuillez renseigner tous les champs obligatoires.');
      return;
    }

    setIsProcessing(true);
    try {
      const selectedClient = clients.find(c => c.uid === saleForm.userId);
      const newCard = await cardService.assignAvailableCardToClient({
        userId: saleForm.userId,
        userName: selectedClient?.displayName || saleForm.cardHolder,
        userEmail: selectedClient?.email || saleForm.clientEmail,
        assignedBy: user.email,
        agencyId: user.agencyId || 'SIEGE_CENTRAL',
        agencyName: user.agencyName || (user.role === 'chef_agence' ? 'Agence Régionale' : 'Siège Central Market-Cash'),
        printRequested: true
      });

      toast.success(`Vente confirmée ! Carte ${newCard.cardIdentifier} ajoutée à la bibliothèque.`);
      setShowDirectSaleModal(false);
      setSaleForm({
        userId: '',
        clientName: '',
        clientEmail: '',
        cardHolder: ''
      });
    } catch (error: any) {
      console.error('[DIRECT_SALE_ERROR]', error);
      toast.error(error?.message === 'STOCK_EMPTY' ? 'Stock épuisé : aucune carte préconfigurée disponible.' : "Erreur lors de la confirmation de vente.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper counts
  const counts = {
    all: cards.length,
    sold: cards.filter(c => ['sold', 'confirmed'].includes(c.saleStatus || '')).length,
    toPrint: cards.filter(c => ['sold', 'confirmed'].includes(c.saleStatus || '') && c.printStatus !== 'printed').length,
    printed: cards.filter(c => c.printStatus === 'printed').length
  };

  const formatCardNumberGrouped = (num: string) => {
    const clean = (num || '').replace(/\s+/g, '');
    return clean.match(/.{1,4}/g)?.join(' ') || '•••• •••• •••• ••••';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-500 font-bold animate-pulse flex items-center gap-3">
          <Layers className="animate-spin text-blue-600" />
          <span>Chargement de la bibliothèque des cartes...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 max-w-7xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-blue-950 via-slate-900 to-blue-900 p-8 rounded-[2.5rem] text-white shadow-xl shadow-blue-950/20 border-2 border-blue-800/60">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/20 backdrop-blur-md flex items-center justify-center border border-amber-400/30 text-amber-400">
              <Layers size={22} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase">
                BIBLIOTHÈQUE DES CARTES
              </h1>
              <p className="text-xs text-blue-200 font-medium">
                Production, gestion PVC, impression & traçabilité Market-Cash
              </p>
            </div>
          </div>
        </div>

        {/* Action Button: Nouvelle Vente (Admin Général & Chef d'agence) */}
        {(user?.role === 'admin_general' || user?.role === 'chef_agence') && (
          <button
            onClick={() => setShowDirectSaleModal(true)}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-black px-5 py-3 rounded-2xl shadow-lg shadow-amber-400/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer text-sm shrink-0"
          >
            <Plus size={18} />
            <span>Vendre une carte physique</span>
          </button>
        )}
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-[2rem] border border-slate-200/80 shadow-sm">
        {/* Exact Required Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl overflow-x-auto hide-scrollbar">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeFilter === 'ALL'
                ? 'bg-blue-950 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>TOUTES</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeFilter === 'ALL' ? 'bg-white/20 text-amber-300' : 'bg-slate-200 text-slate-700'}`}>
              {counts.all}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('SOLD')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeFilter === 'SOLD'
                ? 'bg-blue-950 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>VENDUES</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeFilter === 'SOLD' ? 'bg-white/20 text-amber-300' : 'bg-slate-200 text-slate-700'}`}>
              {counts.sold}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('TO_PRINT')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeFilter === 'TO_PRINT'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-amber-700 hover:bg-amber-100/60'
            }`}
          >
            <Printer size={14} />
            <span>À IMPRIMER</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeFilter === 'TO_PRINT' ? 'bg-slate-950 text-amber-400' : 'bg-amber-200 text-amber-900 font-black'}`}>
              {counts.toPrint}
            </span>
          </button>

          <button
            onClick={() => setActiveFilter('PRINTED')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeFilter === 'PRINTED'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <CheckCircle size={14} />
            <span>IMPRIMÉES</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeFilter === 'PRINTED' ? 'bg-white/20 text-emerald-200' : 'bg-slate-200 text-slate-700'}`}>
              {counts.printed}
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par ID (ex: MC-001), titulaire, carte..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
        </div>
      </div>

      {/* Cards Grid */}
      {filteredCards.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400 mb-4">
            <CreditCard size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Aucune carte trouvée</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Aucune carte ne correspond aux filtres sélectionnés dans la bibliothèque.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredCards.map((card) => {
            const cardIdentifier = card.cardIdentifier || card.cardId || 'MC-001-20260823';
            const isPrinted = card.printStatus === 'printed';

            return (
              <div 
                key={card.cardId || card.id}
                className="bg-white rounded-[2rem] border border-slate-200/80 shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden flex flex-col justify-between group"
              >
                {/* Visual Mini PVC Card Header */}
                <div className="p-3 bg-slate-900/5">
                  <MarketCashCard 
                    card={card}
                    backgroundUrl={cardBackgroundUrl}
                    mode="admin"
                    isRevealed={true}
                    showRevealButton={false}
                    className="shadow-md"
                  />
                </div>

                {/* Metadata & Status Body */}
                <div className="p-5 space-y-3 flex-1">
                  {/* Status Pills */}
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="text-[11px] font-bold text-slate-500">Statut Vente:</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 uppercase">
                      Confirmée
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="text-[11px] font-bold text-slate-500">Statut Impression:</span>
                    {isPrinted ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500 text-white uppercase flex items-center gap-1">
                        <CheckCircle size={10} />
                        Imprimée
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 uppercase flex items-center gap-1">
                        <Clock size={10} />
                        À imprimer
                      </span>
                    )}
                  </div>

                  {/* Vendeur & Agence */}
                  <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Agence :</span>
                      <span className="font-bold text-slate-800 truncate max-w-[160px]">
                        {card.agencyName || card.agencyId || 'Siège Central'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Vendu par :</span>
                      <span className="font-medium text-slate-700 truncate max-w-[160px]">
                        {card.soldBy || 'Admin'}
                      </span>
                    </div>
                    {card.printedBy && (
                      <div className="flex items-center justify-between text-emerald-700">
                        <span>Imprimé par :</span>
                        <span className="font-bold truncate max-w-[160px]">{card.printedBy}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    {/* View Modal */}
                    <button
                      onClick={() => setSelectedCard(card)}
                      className="py-2.5 px-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Eye size={14} className="text-blue-600" />
                      <span>Aperçu</span>
                    </button>

                    {/* Download PVC button */}
                    <button
                      onClick={() => handleDownloadPvc(card)}
                      disabled={downloadingId === card.id}
                      className="py-2.5 px-3 bg-blue-900 hover:bg-blue-950 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm disabled:opacity-50"
                      title="Télécharger l'image prête pour impression PVC"
                    >
                      <Download size={14} className="text-amber-400" />
                      <span>Télécharger PVC</span>
                    </button>
                  </div>

                  {/* Designer / Admin Print Action Button */}
                  {!isPrinted && (
                    <button
                      onClick={() => handleMarkAsPrinted(card)}
                      disabled={isProcessing}
                      className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-emerald-600/20 disabled:opacity-50"
                    >
                      <CheckCircle size={15} />
                      <span>Confirmer Carte Imprimée</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FULL PVC PREVIEW MODAL */}
      {selectedCard && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border-4 border-slate-100 relative space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setSelectedCard(null)}
              className="absolute top-6 right-6 p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <CreditCard size={22} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800">
                  Détail de la Carte PVC • {selectedCard.cardIdentifier || selectedCard.cardId}
                </h3>
                <p className="text-xs text-slate-500 font-medium">Spécifications officielles prêtes pour impression physique</p>
              </div>
            </div>

            {/* High Definition Card Rendering Component */}
            <div className="p-2 bg-slate-900/5 rounded-3xl">
              <MarketCashCard 
                card={selectedCard}
                backgroundUrl={cardBackgroundUrl}
                mode="admin"
                isRevealed={true}
                showRevealButton={false}
              />
            </div>

            {/* Metadata Table */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-slate-400">Identifiant Unique :</span> <span className="font-bold font-mono text-slate-800">{selectedCard.cardIdentifier || selectedCard.cardId}</span></div>
                <div><span className="text-slate-400">Format d'impression :</span> <span className="font-bold text-slate-800">PVC Standard (CR80)</span></div>
                <div><span className="text-slate-400">Statut Vente :</span> <span className="font-bold text-emerald-600 uppercase">Confirmée</span></div>
                <div><span className="text-slate-400">Statut Impression :</span> <span className={`font-bold uppercase ${selectedCard.printStatus === 'printed' ? 'text-emerald-600' : 'text-amber-600'}`}>{selectedCard.printStatus === 'printed' ? 'Imprimée' : 'À Imprimer'}</span></div>
                <div><span className="text-slate-400">Vendu par :</span> <span className="font-bold text-slate-800">{selectedCard.soldBy || 'Admin'}</span></div>
                <div><span className="text-slate-400">Agence :</span> <span className="font-bold text-slate-800">{selectedCard.agencyName || selectedCard.agencyId || 'Siège'}</span></div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setSelectedCard(null)}
                className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition cursor-pointer"
              >
                Fermer
              </button>

              <button
                onClick={() => handleDownloadPvc(selectedCard)}
                className="w-full sm:w-auto px-6 py-3 bg-blue-900 hover:bg-blue-950 text-white font-black rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-950/20 transition cursor-pointer"
              >
                <Download size={16} className="text-amber-400" />
                <span>Télécharger la carte PVC</span>
              </button>

              {selectedCard.printStatus !== 'printed' && (
                <button
                  onClick={() => handleMarkAsPrinted(selectedCard)}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer"
                >
                  <CheckCircle size={16} />
                  <span>Confirmer Carte Imprimée</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DIRECT PHYSICAL CARD SALE MODAL (Admin Général & Chef d'agence) */}
      {showDirectSaleModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] p-6 sm:p-8 shadow-2xl border-4 border-slate-100 relative space-y-6 animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setShowDirectSaleModal(false)}
              className="absolute top-6 right-6 p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-inner">
                <Plus size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800">Attribution directe avec impression</h3>
                <p className="text-xs text-slate-500 font-medium">Utilise une carte préconfigurée du stock unique et prépare son fichier PVC</p>
              </div>
            </div>

            <form onSubmit={handleDirectSaleSubmit} className="space-y-4">
              {/* Select Client */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Client Acheteur <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={saleForm.userId}
                  onChange={(e) => {
                    const selId = e.target.value;
                    const c = clients.find(cl => cl.uid === selId);
                    setSaleForm({
                      ...saleForm,
                      userId: selId,
                      clientName: c?.displayName || '',
                      clientEmail: c?.email || '',
                      cardHolder: c?.displayName ? c.displayName.toUpperCase() : ''
                    });
                  }}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Sélectionner un client...</option>
                  {clients.map(c => (
                    <option key={c.uid} value={c.uid}>
                      {c.displayName || c.email} ({c.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Cardholder Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nom du Titulaire sur la Carte <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="EX: EMMANUEL MUNGWELE"
                  value={saleForm.cardHolder}
                  onChange={(e) => setSaleForm({ ...saleForm, cardHolder: e.target.value.toUpperCase() })}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                />
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900">
                Le numéro, le CVV, la validité et le numéro de recharge proviennent d’une carte préconfigurée disponible. Cette attribution ne crée aucune seconde carte.
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDirectSaleModal(false)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-6 py-3 bg-blue-900 hover:bg-blue-950 text-amber-400 font-black rounded-2xl text-xs shadow-lg shadow-blue-950/20 transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  <Sparkles size={16} />
                  <span>{isProcessing ? 'Attribution en cours...' : 'Attribuer & préparer le PVC'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
