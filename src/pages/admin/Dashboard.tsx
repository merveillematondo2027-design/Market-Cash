import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { cardService, CardPricingSettings } from '../../services/cardService';
import { 
  Users, 
  CreditCard, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Truck, 
  Bell, 
  HelpCircle, 
  Settings, 
  AlertTriangle, 
  ArrowRight, 
  PlusCircle, 
  DollarSign, 
  Smartphone, 
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Sparkles
} from 'lucide-react';
import { CardPurchaseRequest, PhysicalCardRequest } from '../../types';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // KPIs
  const [stats, setStats] = useState({
    totalUsers: 0,
    newUsersThisWeek: 0,
    totalCards: 0,
    availableCards: 0,
    assignedCards: 0,
    virtualCards: 0,
    physicalCards: 0,
    totalRequests: 0,
    pendingRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
    pendingDeliveries: 0,
    activeDeliveries: 0,
    completedDeliveries: 0,
    paymentMethodsCount: 0,
    activePaymentMethodsCount: 0,
  });

  const [pricing, setPricing] = useState<CardPricingSettings>({
    virtualCardPrice: null,
    physicalCardPrice: null,
    currency: 'USD'
  });

  const [recentRequests, setRecentRequests] = useState<CardPurchaseRequest[]>([]);
  const [recentDeliveries, setRecentDeliveries] = useState<PhysicalCardRequest[]>([]);

  const loadAllData = async () => {
    try {
      setRefreshing(true);

      // 1. Users
      const usersSnap = await getDocs(collection(db, 'users'));
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let newUsers = 0;
      usersSnap.forEach(doc => {
        const u = doc.data();
        if (u.createdAt && (typeof u.createdAt === 'number' ? u.createdAt : new Date(u.createdAt).getTime()) > oneWeekAgo) {
          newUsers++;
        }
      });

      // 2. Cards in inventory
      const cardsSnap = await getDocs(collection(db, 'cards'));
      let available = 0;
      let assigned = 0;
      let virtual = 0;
      let physical = 0;
      cardsSnap.forEach(doc => {
        const c = doc.data();
        if (c.status === 'available') available++;
        else assigned++;

        if (c.type === 'virtual') virtual++;
        else physical++;
      });

      // 3. Purchase requests
      const requestsSnap = await getDocs(collection(db, 'card_purchase_requests'));
      let pendingReq = 0;
      let approvedReq = 0;
      let rejectedReq = 0;
      const reqList: CardPurchaseRequest[] = [];

      requestsSnap.forEach(doc => {
        const r = { id: doc.id, ...doc.data() } as CardPurchaseRequest;
        reqList.push(r);
        if (r.status === 'pending' || (r as any).status === 'in_review') pendingReq++;
        else if (r.status === 'approved') approvedReq++;
        else if (r.status === 'rejected') rejectedReq++;
      });

      // Sort recent requests
      reqList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRecentRequests(reqList.slice(0, 5));

      // 4. Deliveries
      const deliveriesSnap = await getDocs(collection(db, 'physical_card_requests'));
      let pendingDel = 0;
      let activeDel = 0;
      let compDel = 0;
      const delList: PhysicalCardRequest[] = [];

      deliveriesSnap.forEach(doc => {
        const d = { id: doc.id, ...doc.data() } as PhysicalCardRequest;
        delList.push(d);
        if (d.status === 'pending') pendingDel++;
        else if (d.status === 'assigned' || d.status === 'out_for_delivery') activeDel++;
        else if (d.status === 'delivered') compDel++;
      });

      delList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRecentDeliveries(delList.slice(0, 4));

      // 5. Payment methods
      const pMethods = await cardService.getPaymentMethods();
      const activePMethods = pMethods.filter(m => m.active);

      // 6. Pricing
      const pPricing = await cardService.getPricing(true);
      setPricing(pPricing);

      setStats({
        totalUsers: usersSnap.size,
        newUsersThisWeek: newUsers,
        totalCards: cardsSnap.size,
        availableCards: available,
        assignedCards: assigned,
        virtualCards: virtual,
        physicalCards: physical,
        totalRequests: requestsSnap.size,
        pendingRequests: pendingReq,
        approvedRequests: approvedReq,
        rejectedRequests: rejectedReq,
        pendingDeliveries: pendingDel,
        activeDeliveries: activeDel,
        completedDeliveries: compDel,
        paymentMethodsCount: pMethods.length,
        activePaymentMethodsCount: activePMethods.length,
      });

    } catch (error) {
      console.error('[DASHBOARD_LOAD_ERROR]', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllData();
    // Also subscribe to pricing
    const unsubPricing = cardService.subscribePricing((p) => setPricing(p));
    return () => unsubPricing();
  }, []);

  const hasUrgentActions = stats.pendingRequests > 0 || stats.pendingDeliveries > 0;
  const isVirtualPriceConfigured = pricing.virtualCardPrice !== null && pricing.virtualCardPrice > 0;
  const isPhysicalPriceConfigured = pricing.physicalCardPrice !== null && pricing.physicalCardPrice > 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 p-6 md:p-8 rounded-[2rem] text-white shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-amber-400 text-blue-950 text-xs font-black rounded-lg uppercase tracking-wider">
              Centre de Contrôle
            </span>
            <span className="text-xs text-blue-200 font-medium">Market-Cash Admin</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Tableau de Bord Général
          </h1>
          <p className="text-sm text-blue-200 max-w-xl">
            Supervisez les flux, validez les paiements, gérez les cartes et coordonnez les livraisons en temps réel.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={loadAllData}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-900/80 hover:bg-blue-800 text-blue-100 rounded-xl text-xs font-bold transition border border-blue-700/50 cursor-pointer disabled:opacity-50"
            title="Rafraîchir les données"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>Actualiser</span>
          </button>
          <button
            onClick={() => navigate('/admin/requests')}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-blue-950 rounded-xl text-xs font-black transition shadow-md shadow-amber-400/20 cursor-pointer"
          >
            <PlusCircle size={16} />
            <span>Traiter les Demandes ({stats.pendingRequests})</span>
          </button>
        </div>
      </div>

      {/* URGENT INTERVENTIONS BANNER */}
      {hasUrgentActions && (
        <div className="bg-amber-500/10 border-2 border-amber-400/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm animate-in fade-in">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-500 text-white rounded-xl shadow-sm shrink-0 mt-0.5">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-amber-950">Interventions prioritaires requises</h3>
              <div className="text-xs text-amber-900 font-medium flex flex-wrap gap-x-4 gap-y-1 mt-0.5">
                {stats.pendingRequests > 0 && (
                  <span>⚠️ <strong>{stats.pendingRequests}</strong> paiement(s) en attente de vérification</span>
                )}
                {stats.pendingDeliveries > 0 && (
                  <span>📦 <strong>{stats.pendingDeliveries}</strong> carte(s) physique(s) à assigner aux livreurs</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {stats.pendingRequests > 0 && (
              <button
                onClick={() => navigate('/admin/requests')}
                className="flex-1 sm:flex-none px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-sm"
              >
                Vérifier paiements →
              </button>
            )}
            {stats.pendingDeliveries > 0 && (
              <button
                onClick={() => navigate('/admin/deliveries')}
                className="flex-1 sm:flex-none px-3.5 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-sm"
              >
                Gérer livraisons →
              </button>
            )}
          </div>
        </div>
      )}

      {/* SYSTEM PRICING & PAYMENT NUMBERS STATUS STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Virtual Price Status */}
        <div 
          onClick={() => navigate('/admin/profile')} 
          className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between cursor-pointer hover:border-blue-500 transition group"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isVirtualPriceConfigured ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
              <Smartphone size={20} />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Prix Carte Virtuelle</span>
              <span className="text-sm font-black text-slate-800">
                {isVirtualPriceConfigured ? `${pricing.virtualCardPrice} ${pricing.currency}` : 'Non configuré'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${isVirtualPriceConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
              {isVirtualPriceConfigured ? 'Configuré' : 'À définir'}
            </span>
            <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-600 transition" />
          </div>
        </div>

        {/* Physical Price Status */}
        <div 
          onClick={() => navigate('/admin/profile')} 
          className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between cursor-pointer hover:border-blue-500 transition group"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${isPhysicalPriceConfigured ? 'bg-purple-50 text-purple-600' : 'bg-red-50 text-red-600'}`}>
              <CreditCard size={20} />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Prix Carte Physique</span>
              <span className="text-sm font-black text-slate-800">
                {isPhysicalPriceConfigured ? `${pricing.physicalCardPrice} ${pricing.currency}` : 'Non configuré'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${isPhysicalPriceConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
              {isPhysicalPriceConfigured ? 'Configuré' : 'À définir'}
            </span>
            <ChevronRight size={16} className="text-slate-300 group-hover:text-purple-600 transition" />
          </div>
        </div>

        {/* Payment Methods Status */}
        <div 
          onClick={() => navigate('/admin/profile')} 
          className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between cursor-pointer hover:border-blue-500 transition group sm:col-span-2 lg:col-span-1"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
              <DollarSign size={20} />
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Numéros de Paiement</span>
              <span className="text-sm font-black text-slate-800">
                {stats.activePaymentMethodsCount} actif(s) sur {stats.paymentMethodsCount}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
              Gérer
            </span>
            <ChevronRight size={16} className="text-slate-300 group-hover:text-amber-600 transition" />
          </div>
        </div>
      </div>

      {/* CORE STATS GRID (All Clickable) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Users */}
        <div 
          onClick={() => navigate('/admin/users')}
          className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-blue-500 transition cursor-pointer flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users size={18} />
            </div>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
              +{stats.newUsersThisWeek} sem.
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-800">{stats.totalUsers}</div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Utilisateurs</div>
          </div>
        </div>

        {/* Pending Requests */}
        <div 
          onClick={() => navigate('/admin/requests')}
          className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-amber-500 transition cursor-pointer flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Clock size={18} />
            </div>
            {stats.pendingRequests > 0 && (
              <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full animate-pulse">
                Urgents
              </span>
            )}
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-amber-600">{stats.pendingRequests}</div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Paiements en attente</div>
          </div>
        </div>

        {/* Approved Requests */}
        <div 
          onClick={() => navigate('/admin/requests')}
          className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-emerald-500 transition cursor-pointer flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 size={18} />
            </div>
            <span className="text-[10px] font-bold text-slate-400">Total: {stats.totalRequests}</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-emerald-600">{stats.approvedRequests}</div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Paiements validés</div>
          </div>
        </div>

        {/* Cards in Catalog */}
        <div 
          onClick={() => navigate('/admin/cards')}
          className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-purple-500 transition cursor-pointer flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <CreditCard size={18} />
            </div>
            <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
              {stats.availableCards} dispo
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-800">{stats.totalCards}</div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cartes stock</div>
          </div>
        </div>

        {/* Pending Deliveries */}
        <div 
          onClick={() => navigate('/admin/deliveries')}
          className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-blue-500 transition cursor-pointer flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Truck size={18} />
            </div>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
              {stats.activeDeliveries} en cours
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-800">{stats.pendingDeliveries}</div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Livraisons à traiter</div>
          </div>
        </div>

        {/* Delivered Cards */}
        <div 
          onClick={() => navigate('/admin/deliveries')}
          className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-emerald-500 transition cursor-pointer flex flex-col justify-between"
        >
          <div className="flex justify-between items-start">
            <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
              <ShieldCheck size={18} />
            </div>
            <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
              Terminées
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-800">{stats.completedDeliveries}</div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cartes livrées</div>
          </div>
        </div>
      </div>

      {/* 8 SUB-MODULES CONTROL CENTER (Organized Grid) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-800 tracking-tight">Modules d'Administration Market-Cash</h2>
          <span className="text-xs text-slate-400 font-medium">Accès direct et gestion centralisée</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Gestion des Cartes */}
          <div 
            onClick={() => navigate('/admin/cards')}
            className="bg-white p-5 rounded-[1.8rem] border border-slate-200/90 shadow-sm hover:shadow-md hover:border-blue-500 transition cursor-pointer flex flex-col justify-between group"
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <CreditCard size={24} />
                </div>
                <span className="text-xs font-extrabold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
                  {stats.totalCards} cartes
                </span>
              </div>
              <h3 className="font-black text-base text-slate-800 group-hover:text-blue-600 transition">Gestion des Cartes</h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Catalogue, numéros de cartes, cartes virtuelles & physiques et stock.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-blue-600 mt-4 pt-3 border-t border-slate-100">
              <span>Gérer les cartes</span>
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 2. Utilisateurs */}
          <div 
            onClick={() => navigate('/admin/users')}
            className="bg-white p-5 rounded-[1.8rem] border border-slate-200/90 shadow-sm hover:shadow-md hover:border-indigo-500 transition cursor-pointer flex flex-col justify-between group"
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Users size={24} />
                </div>
                <span className="text-xs font-extrabold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
                  {stats.totalUsers} comptes
                </span>
              </div>
              <h3 className="font-black text-base text-slate-800 group-hover:text-indigo-600 transition">Comptes Utilisateurs</h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Liste complète des clients, livreurs, chefs d'agence et designers.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-indigo-600 mt-4 pt-3 border-t border-slate-100">
              <span>Voir les utilisateurs</span>
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 3. Paiements & Demandes */}
          <div 
            onClick={() => navigate('/admin/requests')}
            className="bg-white p-5 rounded-[1.8rem] border border-slate-200/90 shadow-sm hover:shadow-md hover:border-amber-500 transition cursor-pointer flex flex-col justify-between group"
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <FileText size={24} />
                </div>
                <span className="text-xs font-extrabold px-2.5 py-1 bg-amber-50 text-amber-700 rounded-xl border border-amber-200">
                  {stats.pendingRequests} en attente
                </span>
              </div>
              <h3 className="font-black text-base text-slate-800 group-hover:text-amber-600 transition">Paiements & Demandes</h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Vérification des captures de paiement et attribution de cartes.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-amber-600 mt-4 pt-3 border-t border-slate-100">
              <span>Vérifier et valider</span>
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 4. Livraisons */}
          <div 
            onClick={() => navigate('/admin/deliveries')}
            className="bg-white p-5 rounded-[1.8rem] border border-slate-200/90 shadow-sm hover:shadow-md hover:border-blue-500 transition cursor-pointer flex flex-col justify-between group"
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <Truck size={24} />
                </div>
                <span className="text-xs font-extrabold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
                  {stats.pendingDeliveries} à livrer
                </span>
              </div>
              <h3 className="font-black text-base text-slate-800 group-hover:text-blue-600 transition">Livraisons Physiques</h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Assignation des livreurs, géolocalisation GPS et suivi des remises.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-blue-600 mt-4 pt-3 border-t border-slate-100">
              <span>Gérer les livraisons</span>
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 5. Centre d'Aide & FAQ */}
          <div 
            onClick={() => navigate('/admin/help')}
            className="bg-white p-5 rounded-[1.8rem] border border-slate-200/90 shadow-sm hover:shadow-md hover:border-teal-500 transition cursor-pointer flex flex-col justify-between group"
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                  <HelpCircle size={24} />
                </div>
                <span className="text-xs font-extrabold px-2.5 py-1 bg-teal-50 text-teal-700 rounded-xl border border-teal-100">
                  FAQ & Vidéos
                </span>
              </div>
              <h3 className="font-black text-base text-slate-800 group-hover:text-teal-600 transition">Centre d'Aide & FAQ</h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Gestion des questions d'assistance et liens tutoriels (YouTube, TikTok...).
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-teal-600 mt-4 pt-3 border-t border-slate-100">
              <span>Modifier la FAQ</span>
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 6. Notifications & Alertes */}
          <div 
            onClick={() => navigate('/admin/notifications')}
            className="bg-white p-5 rounded-[1.8rem] border border-slate-200/90 shadow-sm hover:shadow-md hover:border-purple-500 transition cursor-pointer flex flex-col justify-between group"
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <Bell size={24} />
                </div>
                <span className="text-xs font-extrabold px-2.5 py-1 bg-purple-50 text-purple-700 rounded-xl border border-purple-100">
                  Diffusion
                </span>
              </div>
              <h3 className="font-black text-base text-slate-800 group-hover:text-purple-600 transition">Notifications & Alertes</h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Envoi de messages personnalisés ou généraux aux utilisateurs.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-purple-600 mt-4 pt-3 border-t border-slate-100">
              <span>Diffuser alertes</span>
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 7. Paramètres & Tarifs */}
          <div 
            onClick={() => navigate('/admin/profile')}
            className="bg-white p-5 rounded-[1.8rem] border border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-800 transition cursor-pointer flex flex-col justify-between group"
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                  <Settings size={24} />
                </div>
                <span className="text-xs font-extrabold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-xl">
                  Tarifs & Paiement
                </span>
              </div>
              <h3 className="font-black text-base text-slate-800 group-hover:text-blue-600 transition">Paramètres Application</h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Prix des cartes, numéros M-Pesa/Airtel/Orange et design de carte.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-slate-800 mt-4 pt-3 border-t border-slate-100">
              <span>Configurer l'app</span>
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* 8. Design de Carte PVC */}
          <div 
            onClick={() => navigate('/admin/settings')}
            className="bg-white p-5 rounded-[1.8rem] border border-slate-200/90 shadow-sm hover:shadow-md hover:border-amber-500 transition cursor-pointer flex flex-col justify-between group"
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <Sparkles size={24} />
                </div>
                <span className="text-xs font-extrabold px-2.5 py-1 bg-amber-50 text-amber-700 rounded-xl border border-amber-200">
                  Fond Graphique
                </span>
              </div>
              <h3 className="font-black text-base text-slate-800 group-hover:text-amber-600 transition">Design de Carte</h3>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Arrière-plan graphique de la carte PVC Market-Cash personnalisable.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-amber-600 mt-4 pt-3 border-t border-slate-100">
              <span>Gérer le fond PVC</span>
              <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>

      {/* RECENT ACTIVITY & TRANSACTIONS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Purchase Requests */}
        <div className="bg-white rounded-[2rem] p-6 border border-slate-200/90 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-black text-base text-slate-800">Dernières Demandes d'Achat</h3>
              <p className="text-xs text-slate-400">Preuves de paiement récemment soumises</p>
            </div>
            <button 
              onClick={() => navigate('/admin/requests')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
            >
              <span>Voir tout</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {recentRequests.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-medium">
              Aucune demande d'achat enregistrée pour le moment.
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {recentRequests.map((req) => (
                <div 
                  key={req.id}
                  onClick={() => navigate('/admin/requests')}
                  className="p-3.5 bg-slate-50 hover:bg-blue-50/50 rounded-2xl border border-slate-100 transition cursor-pointer flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                      {req.cardType === 'virtual' ? 'V' : 'P'}
                    </div>
                    <div className="truncate">
                      <div className="font-bold text-xs text-slate-800 truncate">{req.userName || req.fullName || 'Client'}</div>
                      <div className="text-[11px] text-slate-400">{req.paymentMethod || 'Mobile Money'} • {req.amount} {req.currency || 'USD'}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl shrink-0 ${
                    req.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                    req.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {req.status === 'pending' ? 'En attente' : req.status === 'approved' ? 'Validé' : 'Rejeté'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Deliveries */}
        <div className="bg-white rounded-[2rem] p-6 border border-slate-200/90 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-black text-base text-slate-800">Dernières Demandes de Livraison</h3>
              <p className="text-xs text-slate-400">Cartes physiques commandées par les clients</p>
            </div>
            <button 
              onClick={() => navigate('/admin/deliveries')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
            >
              <span>Voir tout</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {recentDeliveries.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-medium">
              Aucune livraison en attente pour le moment.
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {recentDeliveries.map((del) => (
                <div 
                  key={del.id}
                  onClick={() => navigate('/admin/deliveries')}
                  className="p-3.5 bg-slate-50 hover:bg-blue-50/50 rounded-2xl border border-slate-100 transition cursor-pointer flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                      <Truck size={18} />
                    </div>
                    <div className="truncate">
                      <div className="font-bold text-xs text-slate-800 truncate">{del.userName || del.cardHolder || 'Client'}</div>
                      <div className="text-[11px] text-slate-400 truncate">{del.deliveryAddress || 'Adresse en RDC'}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-xl shrink-0 ${
                    del.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                    del.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {del.status === 'pending' ? 'À assigner' : del.status === 'delivered' ? 'Livré' : 'En cours'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
