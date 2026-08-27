import { useState, useEffect } from 'react';
import { cardService } from '../../services/cardService';
import { HelpArticle } from '../../types';
import { 
  ChevronDown, 
  ChevronUp, 
  MessageCircle, 
  Play, 
  X, 
  Youtube, 
  Instagram, 
  Facebook, 
  Share2, 
  HelpCircle,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Search
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MARKET_CASH_SUPPORT_DISPLAY_NUMBER, openWhatsAppSupport } from '../../lib/whatsappSupport';

export default function ClientHelp() {
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeVideoModal, setActiveVideoModal] = useState<HelpArticle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Seed initial FAQ if Firestore is empty
    cardService.seedInitialFaqIfEmpty();

    // Subscribe to real-time FAQ
    const unsubscribe = cardService.subscribeHelpArticles((items) => {
      // Client only sees active items
      const activeItems = items.filter(item => item.active);
      setArticles(activeItems);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const contactSupport = () => {
    openWhatsAppSupport('CLIENT_HELP_CENTER');
  };

  const handleOpenVideoPlatform = (platform: 'youtube' | 'facebook' | 'instagram' | 'tiktok') => {
    if (!activeVideoModal || !activeVideoModal.videoUrls) {
      toast.error('Aucune vidéo n’est disponible pour le moment.');
      return;
    }

    const url = activeVideoModal.videoUrls[platform]?.trim();
    if (url) {
      window.open(url, '_blank');
      setActiveVideoModal(null);
    } else {
      const platformNames = {
        youtube: 'YouTube',
        facebook: 'Facebook',
        instagram: 'Instagram',
        tiktok: 'TikTok'
      };
      toast('Cette vidéo n’est pas encore disponible sur ' + platformNames[platform] + '.', {
        icon: 'ℹ️',
        style: {
          borderRadius: '16px',
          background: '#0f172a',
          color: '#fff',
          fontSize: '13px',
          fontWeight: '600'
        }
      });
    }
  };

  const filteredArticles = articles.filter(a =>
    a.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 font-bold">
        Chargement du centre d'aide...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-28 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 rounded-[2.2rem] p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-0.5 bg-amber-400 text-blue-950 text-xs font-black rounded-lg uppercase tracking-wider">
            Assistance & Guide
          </span>
          <span className="text-xs text-blue-200">Market-Cash</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
          Centre d'Aide & FAQ
        </h1>
        <p className="text-xs sm:text-sm text-blue-200 mt-1 max-w-md">
          Consultez les réponses officielles et visionnez les vidéos tutoriels pour commander et utiliser votre carte.
        </p>

        {/* Search bar */}
        <div className="relative mt-5">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher une question (prix, retrait, activation...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white/95 text-slate-800 rounded-2xl text-xs sm:text-sm font-medium outline-none shadow-sm focus:bg-white focus:ring-2 focus:ring-amber-400 transition"
          />
        </div>
      </div>

      {/* Questions Accordion List */}
      <div className="space-y-3">
        {filteredArticles.length === 0 ? (
          <div className="text-center p-10 bg-white rounded-[2rem] border border-slate-200 shadow-sm text-slate-500 font-medium text-xs">
            Aucun article d'aide ne correspond à votre recherche.
          </div>
        ) : (
          filteredArticles.map((article) => {
            const isOpen = expandedId === article.id;
            const hasVideo = article.videoUrls && Object.values(article.videoUrls).some(url => Boolean(url?.trim()));

            return (
              <div 
                key={article.id} 
                className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${
                  isOpen ? 'border-blue-500/60 shadow-md ring-1 ring-blue-500/20' : 'border-slate-200/90 shadow-sm hover:border-slate-300'
                }`}
              >
                <button
                  onClick={() => setExpandedId(isOpen ? null : article.id)}
                  className="w-full flex justify-between items-center p-4 sm:p-5 text-left focus:outline-none cursor-pointer gap-3"
                >
                  <span className="font-extrabold text-sm sm:text-base text-slate-800 leading-snug">
                    {article.question}
                  </span>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 ${
                    isOpen ? 'bg-amber-400 text-blue-950 rotate-180' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <ChevronDown size={18} />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 sm:px-5 pb-5 pt-1 text-slate-600 font-medium text-xs sm:text-sm leading-relaxed border-t border-slate-100/80 space-y-4">
                    <p className="whitespace-pre-line text-slate-700">
                      {article.answer}
                    </p>

                    {/* Tutorial Video Button if configured */}
                    {hasVideo && (
                      <div className="pt-2">
                        <button
                          onClick={() => setActiveVideoModal(article)}
                          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-950 to-indigo-900 text-amber-400 hover:text-amber-300 font-black text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                        >
                          <Play size={14} className="fill-amber-400 text-amber-400" />
                          <span>▶ Vidéo tuto</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Direct WhatsApp Contact Assistance Strip */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-[2rem] p-6 sm:p-8 text-center border-2 border-emerald-200/70 shadow-sm space-y-3">
        <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-emerald-600/20">
          <MessageCircle size={24} />
        </div>
        <h3 className="font-black text-lg text-slate-900 tracking-tight">
          Besoin d'aide supplémentaire ?
        </h3>
        <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
          Notre service client officiel Market-Cash est disponible 7j/7 pour vous assister via WhatsApp.
        </p>
        <p className="text-lg font-black text-emerald-800 tracking-wide">{MARKET_CASH_SUPPORT_DISPLAY_NUMBER}</p>
        <div className="pt-2">
          <button
            onClick={contactSupport}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3.5 rounded-2xl font-black text-xs tracking-wider uppercase transition shadow-lg shadow-emerald-600/30 cursor-pointer active:scale-95"
          >
            <MessageCircle size={16} />
            <span>Contacter le Support WhatsApp</span>
          </button>
        </div>
      </div>

      {/* VIDEO PLATFORM CHOOSER MODAL */}
      {activeVideoModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-6 sm:p-8 shadow-2xl space-y-5 animate-in zoom-in-95 relative">
            <button
              onClick={() => setActiveVideoModal(null)}
              className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-800 rounded-full cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-2">
                <Play size={22} className="fill-amber-600 text-amber-600" />
              </div>
              <h3 className="font-black text-lg text-slate-900">
                Regarder la vidéo tutoriel
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Sur quelle plateforme souhaitez-vous regarder cette vidéo ?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              {/* YouTube */}
              <button
                onClick={() => handleOpenVideoPlatform('youtube')}
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 hover:border-red-500 hover:bg-red-50/50 transition cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                  <Youtube size={20} />
                </div>
                <div className="text-left">
                  <span className="font-black text-xs text-slate-800 block">YouTube</span>
                  <span className="text-[10px] text-slate-400 font-medium">Lecteur HD</span>
                </div>
              </button>

              {/* TikTok */}
              <button
                onClick={() => handleOpenVideoPlatform('tiktok')}
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 hover:border-slate-900 hover:bg-slate-50 transition cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                  <Share2 size={18} />
                </div>
                <div className="text-left">
                  <span className="font-black text-xs text-slate-800 block">TikTok</span>
                  <span className="text-[10px] text-slate-400 font-medium">Format court</span>
                </div>
              </button>

              {/* Instagram */}
              <button
                onClick={() => handleOpenVideoPlatform('instagram')}
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 hover:border-pink-500 hover:bg-pink-50/50 transition cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                  <Instagram size={20} />
                </div>
                <div className="text-left">
                  <span className="font-black text-xs text-slate-800 block">Instagram</span>
                  <span className="text-[10px] text-slate-400 font-medium">Reel / Vidéo</span>
                </div>
              </button>

              {/* Facebook */}
              <button
                onClick={() => handleOpenVideoPlatform('facebook')}
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 hover:border-blue-600 hover:bg-blue-50/50 transition cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                  <Facebook size={20} />
                </div>
                <div className="text-left">
                  <span className="font-black text-xs text-slate-800 block">Facebook</span>
                  <span className="text-[10px] text-slate-400 font-medium">Watch</span>
                </div>
              </button>
            </div>

            <button
              onClick={() => setActiveVideoModal(null)}
              className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
