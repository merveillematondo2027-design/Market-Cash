import { LogsCenter } from './LogsCenter';
import {   useState, useEffect } from 'react';
import {  useNavigate } from 'react-router-dom';
import {  useAuthStore } from '../../store/authStore';
import {  cardService, CardPricingSettings } from '../../services/cardService';
import {  PaymentMethodItem } from '../../types';
import {  
  User, LogOut, Settings, DollarSign, CreditCard, Smartphone, Plus, Edit3, Trash2, Check, X, Save, ShieldCheck, HelpCircle, Bell, Palette, Sparkles, Server, Lock, ExternalLink, ChevronRight, AlertCircle, ToggleLeft, ToggleRight, Copy, Info, Activity, Image as ImageIcon } from 'lucide-react';
import LogoutModal from '../../components/LogoutModal';
import toast from 'react-hot-toast';

export default function AdminProfile() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [urgentPriceInput, setUrgentPriceInput] = useState('15');
  const [activeTab, setActiveTab] = useState<'app_settings' | 'system_settings' | 'logs'>('app_settings');
  const isSuperAdmin = user?.role === 'admin_general';

  // Pricing State
  const [pricing, setPricing] = useState<CardPricingSettings>({
    virtualCardPrice: null,
      urgentPhysicalCardPrice: null,
    physicalCardPrice: null,
    currency: 'USD'
  });
  const [virtualPriceInput, setVirtualPriceInput] = useState<string>('');
  const [physicalPriceInput, setPhysicalPriceInput] = useState<string>('');
  const [currencyInput, setCurrencyInput] = useState<string>('USD');
  const [savingPricing, setSavingPricing] = useState(false);

  // Payment Methods State
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([]);
  const [editingMethod, setEditingMethod] = useState<Partial<PaymentMethodItem> | null>(null);
  const [savingMethod, setSavingMethod] = useState(false);

  useEffect(() => {
    // 1. Subscribe to pricing
    const unsubPricing = cardService.subscribePricing((p) => {
      setPricing(p);
      setVirtualPriceInput(p.virtualCardPrice !== null ? String(p.virtualCardPrice) : '');
        setUrgentPriceInput(p.urgentPhysicalCardPrice !== null ? String(p.urgentPhysicalCardPrice) : '');
      setPhysicalPriceInput(p.physicalCardPrice !== null ? String(p.physicalCardPrice) : '');
      setCurrencyInput(p.currency || 'USD');
    });

    // 2. Subscribe to payment methods
    const unsubMethods = cardService.subscribePaymentMethods((methods) => {
      setPaymentMethods(methods);
    });

    return () => {
      unsubPricing();
      unsubMethods();
    };
  }, []);

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.role !== 'admin_general') {
      toast.error('Seul un Administrateur Général peut modifier les tarifs.');
      return;
    }

    const vPrice = virtualPriceInput.trim() ? parseFloat(virtualPriceInput) : null;
    const pPrice = physicalPriceInput.trim() ? parseFloat(physicalPriceInput) : null;
    const urgentPrice = urgentPriceInput.trim() ? parseFloat(urgentPriceInput) : null;

    if (vPrice !== null && (isNaN(vPrice) || vPrice < 0)) {
      toast.error('Le prix de la carte virtuelle doit être un nombre positif ou vide.');
      return;
    }

    if (pPrice !== null && (isNaN(pPrice) || pPrice < 0)) {
      toast.error('Le prix de la carte physique doit être un nombre positif ou vide.');
      return;
    }

    if (urgentPrice !== null && (isNaN(urgentPrice) || urgentPrice < 0)) {
      toast.error('Le prix de la carte physique urgente doit être un nombre positif ou vide.');
      return;
    }

    setSavingPricing(true);
    try {
      await cardService.updatePricing({
        virtualCardPrice: vPrice,
        physicalCardPrice: pPrice,
        urgentPhysicalCardPrice: urgentPrice,
        currency: currencyInput.trim() || 'USD'
      });
      toast.success('Tarifs des cartes enregistrés avec succès dans Firestore !');
    } catch (err: any) {
      console.error('[PRICING_SAVE_ERROR]', err);
      toast.error(`Erreur : ${err?.message || 'Impossible d\'enregistrer les tarifs'}`);
    } finally {
      setSavingPricing(false);
    }
  };

  const handleSavePaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMethod || !user || user.role !== 'admin_general') return;

    if (!editingMethod.network?.trim()) {
      toast.error('Veuillez renseigner le nom du réseau (ex: M-Pesa, Airtel Money, Orange Money).');
      return;
    }

    if (!editingMethod.number?.trim()) {
      toast.error('Veuillez renseigner le numéro de paiement.');
      return;
    }

    if (!editingMethod.beneficiary?.trim()) {
      toast.error('Veuillez renseigner le nom du bénéficiaire.');
      return;
    }

    setSavingMethod(true);
    try {
      const methodToSave: PaymentMethodItem = {
        id: editingMethod.id || `pm-${Date.now()}`,
        network: editingMethod.network.trim(),
        number: editingMethod.number.trim(),
        beneficiary: editingMethod.beneficiary.trim(),
        active: editingMethod.active ?? true,
        order: Number(editingMethod.order) || paymentMethods.length + 1,
        instructions: editingMethod.instructions?.trim() || '',
        createdAt: editingMethod.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      await cardService.addOrUpdatePaymentMethod(methodToSave);
      toast.success('Moyen de paiement enregistré avec succès !');
      setEditingMethod(null);
  const isSuperAdmin = user?.role === 'admin_general';
    } catch (err: any) {
      console.error('[PAYMENT_METHOD_SAVE_ERROR]', err);
      toast.error(`Erreur : ${err?.message || 'Impossible de sauvegarder'}`);
    } finally {
      setSavingMethod(false);
    }
  };

  const handleToggleActiveMethod = async (method: PaymentMethodItem) => {
    if (!user || user.role !== 'admin_general') return;
    try {
      await cardService.addOrUpdatePaymentMethod({
        ...method,
        active: !method.active
      });
      toast.success(`Numéro ${method.network} ${!method.active ? 'activé' : 'désactivé'}.`);
    } catch (err) {
      toast.error('Erreur lors de la modification.');
    }
  };

  const handleDeleteMethod = async (id: string, network: string) => {
    if (!user || user.role !== 'admin_general') return;
    if (!window.confirm(`Voulez-vous vraiment supprimer le moyen de paiement ${network} ?`)) {
      return;
    }

    try {
      await cardService.deletePaymentMethod(id);
      toast.success('Moyen de paiement supprimé.');
    } catch (err) {
      toast.error('Erreur lors de la suppression.');
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Admin User Header Profile Card */}
      <div className="bg-white rounded-[2.5rem] p-6 sm:p-8 border border-slate-200/90 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950"></div>
        
        <div className="relative pt-12 flex flex-col sm:flex-row items-center sm:items-end justify-between gap-6 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="w-24 h-24 sm:w-28 sm:h-28 bg-amber-400 rounded-3xl flex items-center justify-center text-blue-950 border-4 border-white shadow-xl overflow-hidden shrink-0">
              {user.avatar ? (
                <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User size={48} />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
                  {user.displayName || 'Administrateur Général'}
                </h1>
                <span className="bg-blue-950 text-amber-400 px-3 py-0.5 rounded-lg text-xs font-black uppercase tracking-wider shadow-sm">
                  Admin Général
                </span>
              </div>
              <p className="text-slate-500 text-sm font-medium">{user.email}</p>
              <div className="flex items-center justify-center sm:justify-start gap-3 mt-2 text-xs text-slate-400">
                <span>Rôle : <strong>Accès Total</strong></span>
                <span>•</span>
                <span>Organisation : <strong>Market-Cash RDC</strong></span>
              </div>
            </div>
          </div>

          <button 
            onClick={() => setShowLogoutModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-2xl font-bold text-xs transition cursor-pointer shrink-0"
          >
            <LogOut size={16} />
            <span>Déconnexion</span>
          </button>
        </div>
      </div>

      {/* PARAMÈTRES TABS (Exactement deux grandes catégories) */}
      <div className="space-y-6">
        <div className="flex bg-slate-200/80 p-1.5 rounded-2xl max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('app_settings')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
              activeTab === 'app_settings'
                ? 'bg-blue-950 text-amber-400 shadow-md'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. Paramètres de l'application
          </button>
          <button
            onClick={() => setActiveTab('system_settings')}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
              activeTab === 'system_settings'
                ? 'bg-blue-950 text-amber-400 shadow-md'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Paramètres système
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('logs')}
              className={`py-2.5 px-4 font-bold text-xs uppercase tracking-wider rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'logs' 
                  ? 'bg-blue-950 text-amber-400 shadow-md' 
                  : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Activity size={14} /> Centre de logs
            </button>
          )}

        </div>

        {/* CATÉGORIE 1 : PARAMÈTRES DE L'APPLICATION */}
        {activeTab === 'app_settings' && (
          <div className="space-y-6 animate-in fade-in">
            {/* SECTION 1.1 : PRIX DES CARTES (VIRTUELLE & PHYSIQUE) */}
            
            {/* SECTION 1.3 : DESIGNER DE CARTES */}
            <div className="bg-gradient-to-r from-pink-500 to-rose-500 rounded-[2rem] p-6 sm:p-8 text-white shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center font-bold">
                    <ImageIcon size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white">Designer de Cartes (Canva-like)</h2>
                    <p className="text-sm text-pink-100 mt-1">Créez et modifiez l'apparence des cartes physiques et virtuelles.</p>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/admin/designer')}
                  className="bg-white text-pink-600 hover:bg-pink-50 font-black py-3 px-6 rounded-xl transition cursor-pointer shadow-md shrink-0 flex items-center justify-center gap-2"
                >
                  <Sparkles size={18} /> Ouvrir le Designer
                </button>
              </div>
            </div>


<div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                    <DollarSign size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-800">Tarification des Cartes Market-Cash</h2>
                    <p className="text-xs text-slate-500">
                      Configurez les prix facturés aux clients. Si un prix est vide ou nul, la commande est bloquée.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-xl flex items-center gap-1 ${
                    pricing.virtualCardPrice ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    Virtuelle : {pricing.virtualCardPrice ? `${pricing.virtualCardPrice} ${pricing.currency}` : 'Non configuré'}
                  </span>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-xl flex items-center gap-1 ${
                    pricing.physicalCardPrice ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    Physique : {pricing.physicalCardPrice ? `${pricing.physicalCardPrice} ${pricing.currency}` : 'Non configuré'}
                  </span>
                </div>
              </div>

              <form onSubmit={handleSavePricing} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Prix Carte Virtuelle (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 10"
                    value={virtualPriceInput}
                    onChange={(e) => setVirtualPriceInput(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-bold text-slate-800 text-sm"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Laissez vide pour désactiver l'achat</span>
                </div>

                
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Prix Carte Physique Urgente (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={urgentPriceInput}
                    onChange={e => setUrgentPriceInput(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-blue-50 outline-none transition-all font-semibold text-slate-800 text-sm"
                    placeholder="Ex: 10"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Prix Carte Physique (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 15"
                    value={physicalPriceInput}
                    onChange={(e) => setPhysicalPriceInput(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-bold text-slate-800 text-sm"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Laissez vide pour désactiver l'achat</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                    Devise par défaut
                  </label>
                  <select
                    value={currencyInput}
                    onChange={(e) => setCurrencyInput(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-bold text-slate-800 text-sm cursor-pointer"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="CDF">CDF (FC)</option>
                  </select>
                </div>

                <div className="sm:col-span-3 pt-2">
                  <button
                    type="submit"
                    disabled={savingPricing}
                    className="w-full sm:w-auto px-6 py-3.5 bg-blue-950 hover:bg-blue-900 text-amber-400 rounded-2xl font-black text-xs uppercase tracking-wider transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Save size={16} />
                    <span>{savingPricing ? 'Enregistrement dans Firestore...' : 'Enregistrer les Tarifs dans Firestore'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* SECTION 1.2 : MOYENS DE PAIEMENT (M-Pesa, Airtel, Orange, etc.) */}
            <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    <Smartphone size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-800">Numéros & Moyens de Paiement</h2>
                    <p className="text-xs text-slate-500">
                      Gérez les numéros Mobile Money visibles par les clients lors de la commande.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingMethod({
                    id: '',
                    network: 'M-Pesa',
                    number: '',
                    beneficiary: 'MARKET-CASH RDC',
                    active: true,
                    order: paymentMethods.length + 1,
                    instructions: ''
                  })}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-blue-950 rounded-xl font-black text-xs transition cursor-pointer shadow-sm"
                >
                  <Plus size={16} />
                  <span>Ajouter un Numéro</span>
                </button>
              </div>

              {/* Payment Methods List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {paymentMethods.map((method) => (
                  <div 
                    key={method.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      method.active 
                        ? 'bg-slate-50/80 border-slate-200 shadow-sm' 
                        : 'bg-slate-100/60 border-dashed border-slate-300 opacity-60'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-slate-900">{method.network}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          method.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {method.active ? 'Actif' : 'Inactif'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleActiveMethod(method)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 transition cursor-pointer"
                          title={method.active ? 'Désactiver' : 'Activer'}
                        >
                          {method.active ? <ToggleRight size={20} className="text-emerald-600" /> : <ToggleLeft size={20} />}
                        </button>
                        <button
                          onClick={() => setEditingMethod(method)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 transition cursor-pointer"
                          title="Modifier"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteMethod(method.id, method.network)}
                          className="p-1.5 text-slate-400 hover:text-red-600 transition cursor-pointer"
                          title="Supprimer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-1.5 font-mono font-bold text-slate-800">
                        <span>📱 {method.number}</span>
                      </div>
                      <div className="text-slate-600">
                        Bénéficiaire : <strong>{method.beneficiary}</strong>
                      </div>
                      {method.instructions && (
                        <div className="text-[11px] text-slate-400 italic mt-1">
                          "{method.instructions}"
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SECTION 1.3 : RACCOURCIS DE CONFIGURATION */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div 
                onClick={() => navigate('/admin/settings')}
                className="bg-white p-5 rounded-[1.8rem] border border-slate-200/90 shadow-sm hover:border-amber-500 transition cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                    <Palette size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-xs text-slate-800 group-hover:text-amber-600 transition">Design Carte PVC</h3>
                    <p className="text-[11px] text-slate-400">Fond personnalisé</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-amber-600 transition" />
              </div>

              <div 
                onClick={() => navigate('/admin/help')}
                className="bg-white p-5 rounded-[1.8rem] border border-slate-200/90 shadow-sm hover:border-teal-500 transition cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                    <HelpCircle size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-xs text-slate-800 group-hover:text-teal-600 transition">FAQ & Tutoriels Vidéos</h3>
                    <p className="text-[11px] text-slate-400">Gérer questions</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-teal-600 transition" />
              </div>

              <div 
                onClick={() => navigate('/admin/notifications')}
                className="bg-white p-5 rounded-[1.8rem] border border-slate-200/90 shadow-sm hover:border-purple-500 transition cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                    <Bell size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-xs text-slate-800 group-hover:text-purple-600 transition">Notifications</h3>
                    <p className="text-[11px] text-slate-400">Diffuser des alertes</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-purple-600 transition" />
              </div>
            </div>
          </div>
        )}

        {/* CATÉGORIE 2 : PARAMÈTRES SYSTÈME */}
        {activeTab === 'system_settings' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Server size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-800">Paramètres et Sécurité Système</h2>
                  <p className="text-xs text-slate-500">
                    Statut de l'infrastructure, connectivité Firebase et règles de sécurité.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Environnement</span>
                  <div className="font-black text-sm text-slate-800 mt-1">Google Cloud & Firebase Production</div>
                  <div className="text-xs text-emerald-600 font-bold flex items-center gap-1 mt-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Connecté & Opérationnel
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Base de données</span>
                  <div className="font-black text-sm text-slate-800 mt-1">Firestore Cloud Database</div>
                  <div className="text-xs text-blue-600 font-bold flex items-center gap-1 mt-1">
                    <ShieldCheck size={14} />
                    Règles RBAC actives
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Version Application</span>
                  <div className="font-black text-sm text-slate-800 mt-1">Market-Cash Core v2.4 (Mobile-First)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Adapté Android 320px–430px</div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Stockage des Preuves</span>
                  <div className="font-black text-sm text-slate-800 mt-1">Firebase Cloud Storage</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Dossiers sécurisés payment-proofs & card-designs</div>
                </div>
              </div>

              <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl text-xs text-blue-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Lock size={14} />
                  <span>Isolation des Données et Sécurité Bancaire</span>
                </div>
                <p className="text-blue-800/80">
                  Toutes les transactions et demandes de cartes sont vérifiées par les Administrateurs Généraux. Les coordonnées sensibles sont protégées par chiffrement et code PIN utilisateur.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && isSuperAdmin && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <LogsCenter />
          </div>
        )}

      </div>

      {/* EDIT / ADD PAYMENT METHOD MODAL */}
      {editingMethod && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <form 
            onSubmit={handleSavePaymentMethod}
            className="bg-white rounded-[2.5rem] w-full max-w-lg p-6 sm:p-8 shadow-2xl space-y-4 animate-in zoom-in-95"
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-black text-lg text-slate-800">
                {editingMethod.id ? 'Modifier le moyen de paiement' : 'Nouveau moyen de paiement'}
              </h3>
              <button 
                type="button" 
                onClick={() => setEditingMethod(null)}
                className="p-1.5 text-slate-400 hover:text-slate-800 rounded-full cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                Réseau / Opérateur <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: M-Pesa, Airtel Money, Orange Money, Afrimoney..."
                value={editingMethod.network || ''}
                onChange={(e) => setEditingMethod({ ...editingMethod, network: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-semibold text-slate-800 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                Numéro de paiement <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                placeholder="Ex: +243 820 743 730"
                value={editingMethod.number || ''}
                onChange={(e) => setEditingMethod({ ...editingMethod, number: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-mono font-bold text-slate-800 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                Nom du Bénéficiaire <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Ex: MARKET-CASH RDC"
                value={editingMethod.beneficiary || ''}
                onChange={(e) => setEditingMethod({ ...editingMethod, beneficiary: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-semibold text-slate-800 text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                  Ordre d'affichage
                </label>
                <input
                  type="number"
                  min="1"
                  value={editingMethod.order || 1}
                  onChange={(e) => setEditingMethod({ ...editingMethod, order: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-bold text-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                  Statut
                </label>
                <select
                  value={editingMethod.active ? 'active' : 'inactive'}
                  onChange={(e) => setEditingMethod({ ...editingMethod, active: e.target.value === 'active' })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-bold text-slate-800 text-sm cursor-pointer"
                >
                  <option value="active">Actif (Visible)</option>
                  <option value="inactive">Inactif (Masqué)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                Instructions facultatives
              </label>
              <input
                type="text"
                placeholder="Ex: Envoyez le montant exact puis capturez l'écran"
                value={editingMethod.instructions || ''}
                onChange={(e) => setEditingMethod({ ...editingMethod, instructions: e.target.value })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-medium text-slate-800 text-xs"
              />
            </div>

            <div className="flex gap-3 pt-3">
              <button
                type="button"
                onClick={() => setEditingMethod(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={savingMethod}
                className="flex-1 py-3 bg-blue-950 hover:bg-blue-900 text-amber-400 font-black rounded-2xl text-xs uppercase tracking-wider transition shadow-md cursor-pointer disabled:opacity-50"
              >
                {savingMethod ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}

      <LogoutModal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} />
    </div>
  );
}
