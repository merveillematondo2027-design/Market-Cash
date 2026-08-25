import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { UserCard } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { downloadPvcCardImage } from '../../lib/pvcCardGenerator';
import toast from 'react-hot-toast';
import { 
  Printer, 
  Download, 
  CheckCircle2, 
  Clock, 
  Search, 
  Eye, 
  Sparkles, 
  Check, 
  X,
  CreditCard,
  QrCode,
  Shield,
  Layers,
  RotateCw
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function DesignerCards() {
  const { user } = useAuthStore();
  const [cards, setCards] = useState<UserCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'TO_PRINT' | 'PRINTED' | 'ALL'>('TO_PRINT');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals & Preview
  const [previewCard, setPreviewCard] = useState<UserCard | null>(null);
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    const qCards = query(collection(db, 'cards'));
    const unsub = onSnapshot(qCards, (snap) => {
      const allDocs = snap.docs
        .map(d => ({ ...d.data(), id: d.id, cardId: d.id } as UserCard))
        .filter(c => c.saleStatus === 'sold' || (c as any).userId || (c as any).printStatus)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      
      setCards(allDocs);
      setLoading(false);
    }, (err) => {
      console.error('[DESIGNER_CARDS_ERR]', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleMarkAsPrinted = async (card: UserCard) => {
    if (!user) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'cards', card.id), {
        printStatus: 'printed',
        printedAt: Date.now(),
        printedBy: user.displayName || user.email || 'Designer Graphique',
        updatedAt: Date.now()
      });

      // Notify Client if card has userId
      if (card.userId && !card.userId.startsWith('direct_sale')) {
        await setDoc(doc(collection(db, 'notifications')), {
          userId: card.userId,
          title: 'Carte plastique PVC imprimée !',
          message: `Votre carte ${card.cardIdentifier || ''} a été imprimée par notre atelier graphique.`,
          type: 'success',
          read: false,
          createdAt: Date.now()
        });
      }

      toast.success(`Carte ${card.cardIdentifier || card.id} marquée comme imprimée !`);
      if (previewCard?.id === card.id) {
        setPreviewCard(prev => prev ? { ...prev, printStatus: 'printed' as any } : null);
      }
    } catch (err: any) {
      console.error('[MARK_PRINTED_ERR]', err);
      toast.error('Erreur lors de la mise à jour.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadPvc = async (card: UserCard, side: 'front' | 'back') => {
    setDownloadingId(`${card.id}_${side}`);
    try {
      await downloadPvcCardImage(card, side);
      toast.success(`Fichier ${side === 'front' ? 'Recto' : 'Verso'} haute résolution téléchargé !`);
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors du téléchargement');
    } finally {
      setDownloadingId(null);
    }
  };

  const filteredCards = cards.filter(c => {
    const isToPrint = (c as any).printStatus === 'pending' || (!(c as any).printStatus && (c as any).saleStatus === 'sold');
    const isPrinted = (c as any).printStatus === 'printed';

    if (activeTab === 'TO_PRINT' && !isToPrint) return false;
    if (activeTab === 'PRINTED' && !isPrinted) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.cardHolder?.toLowerCase().includes(q) ||
      c.cardIdentifier?.toLowerCase().includes(q) ||
      c.userEmail?.toLowerCase().includes(q) ||
      c.cardNumber?.toLowerCase().includes(q)
    );
  });

  const countToPrint = cards.filter(c => (c as any).printStatus === 'pending' || (!(c as any).printStatus && (c as any).saleStatus === 'sold')).length;
  const countPrinted = cards.filter(c => (c as any).printStatus === 'printed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Printer className="text-amber-600" />
            Atelier d'Impression PVC
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Exportez les fichiers d'impression haute définition Recto/Verso et validez le tirage des cartes plastiques.
          </p>
        </div>
      </div>

      {/* Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Rechercher par titulaire, numéro, identifiant MC-001..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
          />
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab('TO_PRINT')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all touch-manipulation flex items-center gap-1.5 ${
              activeTab === 'TO_PRINT'
                ? 'bg-amber-400 text-blue-950 shadow-md font-black'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Clock size={14} />
            <span>À Imprimer ({countToPrint})</span>
          </button>
          <button
            onClick={() => setActiveTab('PRINTED')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all touch-manipulation flex items-center gap-1.5 ${
              activeTab === 'PRINTED'
                ? 'bg-emerald-600 text-white shadow-md font-black'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <CheckCircle2 size={14} />
            <span>Déjà Imprimées ({countPrinted})</span>
          </button>
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all touch-manipulation ${
              activeTab === 'ALL'
                ? 'bg-blue-950 text-white shadow-md font-black'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Toutes ({cards.length})
          </button>
        </div>
      </div>

      {/* Cards List (Mobile-First 1-col on phone, 2-col on tablet/desktop) */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Chargement des cartes de production...</div>
      ) : filteredCards.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200/80 shadow-sm space-y-2">
          <Printer size={36} className="mx-auto text-slate-300" />
          <h3 className="font-bold text-slate-700 text-sm">Aucune carte dans cette section</h3>
          <p className="text-xs text-slate-400">Toutes les cartes sont à jour.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCards.map((c) => {
            const isPrinted = (c as any).printStatus === 'printed';
            return (
              <div
                key={c.id}
                className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3.5"
              >
                {/* Top header: Identifier & Status badge */}
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black text-blue-950 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                    {c.cardIdentifier || 'MC-001-20260824'}
                  </span>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider ${
                    isPrinted
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                      : 'bg-amber-100 text-amber-900 border border-amber-200 animate-pulse'
                  }`}>
                    {isPrinted ? 'Imprimée' : 'En attente de tirage'}
                  </span>
                </div>

                {/* Card Visual Preview (PVC Proportion) */}
                <div className="w-full aspect-[1.586/1] bg-gradient-to-br from-blue-950 via-slate-900 to-blue-900 rounded-2xl p-4 text-white flex flex-col justify-between shadow-md relative overflow-hidden border border-amber-400/40">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 bg-amber-400 rounded-sm"></div>
                      <span className="text-xs font-black tracking-wider text-amber-400">MARKET-CASH</span>
                    </div>
                    <span className="text-[10px] uppercase font-mono font-bold text-amber-200">
                      {c.cardIdentifier || 'MC-001'}
                    </span>
                  </div>

                  {/* Chip & NFC symbol */}
                  <div className="flex items-center gap-3 my-1">
                    <div className="w-8 h-6 bg-gradient-to-br from-amber-200 to-amber-400 rounded-md border border-amber-500/50 shadow-inner flex items-center justify-center">
                      <div className="w-4 h-3 border border-amber-800/40 rounded-xs"></div>
                    </div>
                    <div className="text-[10px] font-mono tracking-widest text-slate-300">
                      NFC • PVC
                    </div>
                  </div>

                  {/* Card Number & Holder */}
                  <div>
                    <div className="font-mono text-sm sm:text-base font-bold tracking-widest text-white drop-shadow-sm">
                      {c.cardNumber || '•••• •••• •••• ••••'}
                    </div>
                    <div className="flex justify-between items-end mt-1.5 text-[10px]">
                      <div>
                        <div className="text-[8px] text-slate-400 uppercase font-semibold">Titulaire</div>
                        <div className="font-bold uppercase tracking-wider text-amber-300 truncate max-w-[150px]">
                          {c.cardHolder || 'TITULAIRE'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[8px] text-slate-400 uppercase font-semibold">Expire à</div>
                        <div className="font-mono font-bold text-white">{c.expiryEnd || '08/27'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Print details & metadata */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Code CVV :</span>
                    <span className="font-mono font-bold text-slate-800">{c.cvv || '551'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">N° Recharge :</span>
                    <span className="font-mono font-bold text-slate-800">{c.rechargeNumber || '-'}</span>
                  </div>
                  {isPrinted && (c as any).printedAt && (
                    <div className="pt-1 border-t border-slate-200/60 flex justify-between text-emerald-800 font-medium">
                      <span>Imprimée par {(c as any).printedBy || 'Designer'} :</span>
                      <span>{new Date((c as any).printedAt).toLocaleDateString('fr-FR')}</span>
                    </div>
                  )}
                </div>

                {/* Action buttons: Preview, Export Front/Back, Mark as printed */}
                <div className="space-y-2 pt-1">
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setPreviewCard(c);
                        setPreviewSide('front');
                      }}
                      className="flex-1 bg-slate-100 hover:bg-amber-50 hover:text-amber-900 text-slate-700 py-2 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition-all"
                    >
                      <Eye size={14} />
                      <span>Aperçu HD</span>
                    </button>
                    <button
                      onClick={() => handleDownloadPvc(c, 'front')}
                      disabled={downloadingId === `${c.id}_front`}
                      className="bg-blue-950 hover:bg-blue-900 text-amber-400 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition-all shadow-xs"
                      title="Télécharger Recto HD"
                    >
                      <Download size={14} />
                      <span>Recto</span>
                    </button>
                    <button
                      onClick={() => handleDownloadPvc(c, 'back')}
                      disabled={downloadingId === `${c.id}_back`}
                      className="bg-slate-800 hover:bg-slate-700 text-white py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition-all"
                      title="Télécharger Verso HD"
                    >
                      <Download size={14} />
                      <span>Verso</span>
                    </button>
                  </div>

                  {!isPrinted && (
                    <button
                      onClick={() => handleMarkAsPrinted(c)}
                      disabled={isProcessing}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all touch-manipulation disabled:opacity-50"
                    >
                      <Check size={16} />
                      <span>Marquer Carte Imprimée</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* HD Preview Modal with Flip Toggle */}
      {previewCard && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-amber-600" />
                <h3 className="font-black text-slate-800 text-base">Aperçu Tirage PVC</h3>
              </div>
              <button 
                onClick={() => setPreviewCard(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Toggle Recto / Verso */}
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setPreviewSide('front')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  previewSide === 'front' ? 'bg-blue-950 text-amber-400 shadow-xs' : 'text-slate-600'
                }`}
              >
                Face Recto (Avant)
              </button>
              <button
                onClick={() => setPreviewSide('back')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  previewSide === 'back' ? 'bg-blue-950 text-amber-400 shadow-xs' : 'text-slate-600'
                }`}
              >
                Face Verso (Arrière)
              </button>
            </div>

            {/* Card Mockup */}
            {previewSide === 'front' ? (
              <div className="w-full aspect-[1.586/1] bg-gradient-to-br from-blue-950 via-slate-900 to-blue-900 rounded-2xl p-5 text-white flex flex-col justify-between shadow-xl relative overflow-hidden border-2 border-amber-400">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-amber-400 rounded-md flex items-center justify-center text-blue-950 font-black text-xs">
                      MC
                    </div>
                    <div>
                      <span className="text-sm font-black tracking-wider text-amber-400">MARKET-CASH</span>
                      <div className="text-[8px] text-blue-200">CARTE OFFICIELLE PVC</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-mono font-bold text-amber-200">
                      {previewCard.cardIdentifier || 'MC-001'}
                    </span>
                  </div>
                </div>

                <div className="my-2">
                  <div className="w-10 h-8 bg-gradient-to-br from-amber-200 to-amber-400 rounded-md border border-amber-500/50 shadow-inner flex items-center justify-center mb-2">
                    <div className="w-6 h-5 border border-amber-800/40 rounded-xs"></div>
                  </div>
                  <div className="font-mono text-lg sm:text-xl font-bold tracking-widest text-white drop-shadow-md">
                    {previewCard.cardNumber}
                  </div>
                </div>

                <div className="flex justify-between items-end text-xs">
                  <div>
                    <div className="text-[8px] text-slate-400 uppercase font-semibold">Titulaire</div>
                    <div className="font-bold uppercase tracking-wider text-amber-300 text-sm">
                      {previewCard.cardHolder}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[8px] text-slate-400 uppercase font-semibold">Validité</div>
                    <div className="font-mono font-bold text-white text-xs">{previewCard.expiryStart} - {previewCard.expiryEnd}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full aspect-[1.586/1] bg-slate-900 rounded-2xl text-white flex flex-col justify-between shadow-xl relative overflow-hidden border-2 border-slate-700">
                {/* Magnetic Strip */}
                <div className="w-full h-10 bg-black mt-4"></div>

                {/* Signature line & CVV */}
                <div className="px-5 py-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-white h-7 rounded-sm flex items-center justify-end px-3 font-mono text-xs text-slate-900 font-bold">
                      Signature autorisée
                    </div>
                    <div className="bg-amber-400 text-blue-950 px-2.5 py-1 rounded font-mono text-xs font-black">
                      {previewCard.cvv || '551'}
                    </div>
                  </div>
                  <div className="text-[8px] text-slate-400 mt-2">
                    Cette carte est la propriété de MARKET-CASH. En cas de perte ou de vol, contactez immédiatement le service client.
                  </div>
                </div>

                <div className="px-5 pb-3 flex justify-between items-center text-[9px] text-slate-400">
                  <span className="font-mono">{previewCard.cardIdentifier}</span>
                  <span className="font-mono">N° Recharge: {previewCard.rechargeNumber || '-'}</span>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-col gap-2 pt-2">
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownloadPvc(previewCard, 'front')}
                  className="flex-1 bg-blue-950 text-amber-400 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <Download size={15} />
                  <span>Télécharger Recto</span>
                </button>
                <button
                  onClick={() => handleDownloadPvc(previewCard, 'back')}
                  className="flex-1 bg-slate-800 text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <Download size={15} />
                  <span>Télécharger Verso</span>
                </button>
              </div>

              {(previewCard as any).printStatus !== 'printed' && (
                <button
                  onClick={() => handleMarkAsPrinted(previewCard)}
                  disabled={isProcessing}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                >
                  <Check size={18} />
                  <span>Marquer Carte Imprimée</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
