import React, { useState, useEffect } from 'react';
import { cardService } from '../../services/cardService';
import { HelpArticle } from '../../types';
import toast from 'react-hot-toast';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Video, 
  HelpCircle, 
  Check, 
  X, 
  Youtube, 
  Instagram, 
  Facebook, 
  Share2, 
  Sparkles,
  ArrowUpDown,
  Search,
  ExternalLink
} from 'lucide-react';

export default function AdminHelp() {
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState<Partial<HelpArticle>>({
    question: '',
    answer: '',
    category: 'Général',
    active: true,
    order: 0,
    videoUrls: {
      youtube: '',
      facebook: '',
      instagram: '',
      tiktok: ''
    }
  });

  useEffect(() => {
    // 1. Seed if empty
    cardService.seedInitialFaqIfEmpty();

    // 2. Subscribe to real-time FAQ articles
    const unsubscribe = cardService.subscribeHelpArticles((items) => {
      setArticles(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.question?.trim() || !formData.answer?.trim()) {
      toast.error('Veuillez renseigner la question et la réponse.');
      return;
    }

    try {
      const articleId = isEditing && formData.id ? formData.id : `faq-${Date.now()}`;
      const cleanVideoUrls = {
        youtube: formData.videoUrls?.youtube?.trim() || '',
        facebook: formData.videoUrls?.facebook?.trim() || '',
        instagram: formData.videoUrls?.instagram?.trim() || '',
        tiktok: formData.videoUrls?.tiktok?.trim() || ''
      };

      const article: HelpArticle = {
        id: articleId,
        question: formData.question.trim(),
        answer: formData.answer.trim(),
        category: formData.category?.trim() || 'Général',
        active: formData.active ?? true,
        order: Number(formData.order) || articles.length + 1,
        videoUrls: cleanVideoUrls,
        createdAt: formData.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      await cardService.saveHelpArticle(article);
      toast.success(isEditing ? 'Question FAQ mise à jour !' : 'Nouvelle question FAQ créée !');
      setShowModal(false);
    } catch (error: any) {
      console.error('[FAQ_SAVE_ERROR]', error);
      toast.error(`Erreur lors de l'enregistrement : ${error?.message || 'Erreur inconnue'}`);
    }
  };

  const handleDelete = async (id: string, question: string) => {
    if (!window.confirm(`Voulez-vous vraiment supprimer cette question : "${question}" ?`)) return;
    try {
      await cardService.deleteHelpArticle(id);
      toast.success('Question FAQ supprimée.');
    } catch (error) {
      toast.error('Erreur lors de la suppression.');
    }
  };

  const openNew = () => {
    setFormData({ 
      question: '', 
      answer: '', 
      category: 'Général', 
      active: true, 
      order: articles.length + 1,
      videoUrls: {
        youtube: '',
        facebook: '',
        instagram: '',
        tiktok: ''
      }
    });
    setIsEditing(false);
    setShowModal(true);
  };

  const openEdit = (article: HelpArticle) => {
    setFormData({
      ...article,
      videoUrls: {
        youtube: article.videoUrls?.youtube || '',
        facebook: article.videoUrls?.facebook || '',
        instagram: article.videoUrls?.instagram || '',
        tiktok: article.videoUrls?.tiktok || ''
      }
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const filteredArticles = articles.filter(a => 
    a.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.answer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 font-bold">
        Chargement du Centre d'Aide...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-[2rem] border border-slate-200/90 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-teal-50 text-teal-700 rounded-lg">
              <HelpCircle size={18} />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Assistance Client</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight mt-1">
            Gestion du Centre d'Aide & FAQ
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium">
            Configurez les questions interactives et tutoriels vidéo (YouTube, TikTok, Instagram, Facebook).
          </p>
        </div>

        <button 
          onClick={openNew} 
          className="bg-blue-950 hover:bg-blue-900 text-amber-400 px-5 py-3.5 rounded-2xl flex items-center justify-center space-x-2 font-black text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer shrink-0"
        >
          <Plus size={18} />
          <span>Ajouter une question</span>
        </button>
      </div>

      {/* Search & Stats Filter */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher une question..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
          />
        </div>
        <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
          <span>{articles.length} questions au total</span>
          <span>•</span>
          <span className="text-emerald-600">{articles.filter(a => a.active).length} actives</span>
        </div>
      </div>

      {/* FAQ Cards Table / List */}
      <div className="space-y-3">
        {filteredArticles.map((article) => {
          const hasVideos = article.videoUrls && Object.values(article.videoUrls).some(url => Boolean(url?.trim()));
          
          return (
            <div 
              key={article.id}
              className={`bg-white rounded-2xl p-5 border transition-all ${
                article.active ? 'border-slate-200/90 shadow-sm' : 'border-dashed border-slate-300 opacity-60'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 font-mono text-xs font-black flex items-center justify-center">
                      #{article.order}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                      {article.category || 'Général'}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      article.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {article.active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>

                  <h3 className="font-black text-slate-900 text-base">
                    {article.question}
                  </h3>

                  <p className="text-slate-600 text-xs font-medium leading-relaxed">
                    {article.answer}
                  </p>

                  {/* Video Platforms configured */}
                  {hasVideos && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 mt-2">
                      <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                        <Video size={13} className="text-purple-600" />
                        Vidéos configurées :
                      </span>
                      <div className="flex items-center gap-1.5">
                        {article.videoUrls?.youtube && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-red-50 text-red-700 rounded-md flex items-center gap-1">
                            <Youtube size={11} /> YouTube
                          </span>
                        )}
                        {article.videoUrls?.tiktok && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-900 text-white rounded-md flex items-center gap-1">
                            TikTok
                          </span>
                        )}
                        {article.videoUrls?.instagram && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-pink-50 text-pink-700 rounded-md flex items-center gap-1">
                            <Instagram size={11} /> Instagram
                          </span>
                        )}
                        {article.videoUrls?.facebook && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md flex items-center gap-1">
                            <Facebook size={11} /> Facebook
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex sm:flex-col items-center gap-1 shrink-0 border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-4">
                  <button 
                    onClick={() => openEdit(article)}
                    className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer"
                    title="Modifier"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button 
                    onClick={() => handleDelete(article.id, article.question)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition cursor-pointer"
                    title="Supprimer"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* EDIT / CREATE MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <form 
            onSubmit={handleSave} 
            className="bg-white rounded-[2.5rem] w-full max-w-xl p-6 sm:p-8 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95"
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-black text-xl text-slate-800 tracking-tight">
                {isEditing ? 'Modifier la question FAQ' : 'Nouvelle question FAQ'}
              </h3>
              <button 
                type="button" 
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-800 rounded-full cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                Question <span className="text-red-500">*</span>
              </label>
              <input 
                required 
                type="text" 
                placeholder="Ex: Comment commander ma carte Market-Cash ?"
                value={formData.question || ''} 
                onChange={e => setFormData({ ...formData, question: e.target.value })} 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-bold text-slate-800 text-sm" 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                Réponse <span className="text-red-500">*</span>
              </label>
              <textarea 
                required 
                placeholder="Rédigez une réponse claire et pédagogique..."
                value={formData.answer || ''} 
                onChange={e => setFormData({ ...formData, answer: e.target.value })} 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-medium text-slate-800 text-xs h-28 resize-none" 
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                  Catégorie
                </label>
                <input 
                  type="text"
                  placeholder="Général, Cartes, Paiement..."
                  value={formData.category || 'Général'}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-semibold text-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                  Ordre d'affichage
                </label>
                <input 
                  type="number" 
                  min="1"
                  value={formData.order || 1} 
                  onChange={e => setFormData({ ...formData, order: Number(e.target.value) })} 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-bold text-slate-800 text-xs" 
                />
              </div>
            </div>

            {/* VIDEO LINKS CONFIGURATION (YouTube, TikTok, Instagram, Facebook) */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                <Video size={16} className="text-purple-600" />
                <span>Liens des Vidéos Tutoriels (Optionnel)</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Si configuré, un bouton "▶ Vidéo tuto" apparaîtra sous la réponse pour permettre au client de regarder le tuto.
              </p>

              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5 flex items-center gap-1">
                    <Youtube size={14} className="text-red-600" /> YouTube Video URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://youtube.com/watch?v=..."
                    value={formData.videoUrls?.youtube || ''}
                    onChange={e => setFormData({
                      ...formData,
                      videoUrls: { ...formData.videoUrls, youtube: e.target.value }
                    })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5 flex items-center gap-1">
                    <Instagram size={14} className="text-pink-600" /> Instagram Reel / Video URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://instagram.com/reel/..."
                    value={formData.videoUrls?.instagram || ''}
                    onChange={e => setFormData({
                      ...formData,
                      videoUrls: { ...formData.videoUrls, instagram: e.target.value }
                    })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5 flex items-center gap-1">
                    <Share2 size={14} className="text-slate-900" /> TikTok Video URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://tiktok.com/@.../video/..."
                    value={formData.videoUrls?.tiktok || ''}
                    onChange={e => setFormData({
                      ...formData,
                      videoUrls: { ...formData.videoUrls, tiktok: e.target.value }
                    })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5 flex items-center gap-1">
                    <Facebook size={14} className="text-blue-600" /> Facebook Video URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://facebook.com/watch/?v=..."
                    value={formData.videoUrls?.facebook || ''}
                    onChange={e => setFormData({
                      ...formData,
                      videoUrls: { ...formData.videoUrls, facebook: e.target.value }
                    })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input 
                type="checkbox" 
                checked={formData.active ?? true} 
                onChange={e => setFormData({ ...formData, active: e.target.checked })} 
                id="activeFaq" 
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer" 
              />
              <label htmlFor="activeFaq" className="text-xs font-bold text-slate-700 cursor-pointer">
                Rendre cette question visible immédiatement pour tous les clients
              </label>
            </div>

            <div className="flex gap-3 pt-3">
              <button 
                type="button" 
                onClick={() => setShowModal(false)} 
                className="flex-1 py-3.5 bg-slate-100 text-slate-700 font-bold rounded-2xl hover:bg-slate-200 transition text-xs cursor-pointer"
              >
                Annuler
              </button>
              <button 
                type="submit" 
                className="flex-1 py-3.5 bg-blue-950 hover:bg-blue-900 text-amber-400 font-black tracking-wider uppercase rounded-2xl transition shadow-md text-xs cursor-pointer"
              >
                {isEditing ? 'Mettre à jour' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
