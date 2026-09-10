import{useEffect,useState}from'react';
import{useNavigate}from'react-router-dom';
import{collection,getDocs}from'firebase/firestore';
import{db}from'../../firebase/config';
import{cardService}from'../../services/cardService';
import{adminTreasuryService,TreasuryCurrency,TreasurySnapshot}from'../../services/adminTreasuryService';
import toast from'react-hot-toast';
import{Boxes,CreditCard,HandCoins,Minus,Plus,RefreshCw,Settings2,ShieldCheck,Truck,WalletCards,X}from'lucide-react';

interface AdminStats{totalUsers:number;clients:number;agents:number;merchants:number;developers:number;pendingKyc:number;pendingUpgrades:number;pendingCardRequests:number;availableCards:number;activeDeliveries:number;activePaymentMethods:number;}
const isDeveloper=(u:any)=>u?.role==='developer'||u?.role==='api_partner'||u?.businessAccountType==='direct_developer'||u?.businessAccountType==='api_provider'||u?.developerEnabled===true;
const fmt=(v:number,c:TreasuryCurrency)=>c==='CDF'?`${Number(v||0).toLocaleString('fr-FR',{maximumFractionDigits:0})} CDF`:`${Number(v||0).toFixed(2)} USD`;

export default function AdminDashboard(){
  const navigate=useNavigate();
  const[loading,setLoading]=useState(true);
  const[refreshing,setRefreshing]=useState(false);
  const[treasury,setTreasury]=useState<TreasurySnapshot|null>(null);
  const[walletModal,setWalletModal]=useState<{currency:TreasuryCurrency;direction:'credit'|'debit'}|null>(null);
  const[amount,setAmount]=useState('');
  const[cvv,setCvv]=useState('');
  const[walletBusy,setWalletBusy]=useState(false);
  const[stats,setStats]=useState<AdminStats>({totalUsers:0,clients:0,agents:0,merchants:0,developers:0,pendingKyc:0,pendingUpgrades:0,pendingCardRequests:0,availableCards:0,activeDeliveries:0,activePaymentMethods:0});

  const load=async()=>{
    setRefreshing(true);
    try{
      const[usersSnap,kycSnap,upgradeSnap,requestSnap,cardsSnap,deliverySnap,paymentMethods,treasurySnapshot]=await Promise.all([
        getDocs(collection(db,'users')),getDocs(collection(db,'kyc_requests')),getDocs(collection(db,'account_upgrade_requests')),getDocs(collection(db,'card_purchase_requests')),getDocs(collection(db,'cards')),getDocs(collection(db,'physical_card_requests')),cardService.getPaymentMethods(),adminTreasuryService.getSnapshot(),
      ]);
      const users=usersSnap.docs.map(d=>d.data()as any);
      setTreasury(treasurySnapshot);
      if(treasurySnapshot.initialCvv){toast.success(`CVV wallet admin créé : ${treasurySnapshot.initialCvv}. Conservez-le dans un endroit sûr.`,{duration:12000})}
      setStats({totalUsers:users.length,clients:users.filter(u=>u.role==='client').length,agents:users.filter(u=>u.role==='agent').length,merchants:users.filter(u=>u.role==='marchand'&&!isDeveloper(u)).length,developers:users.filter(isDeveloper).length,pendingKyc:kycSnap.docs.filter(d=>(d.data()as any).status==='pending').length,pendingUpgrades:upgradeSnap.docs.filter(d=>(d.data()as any).status==='pending').length,pendingCardRequests:requestSnap.docs.filter(d=>['pending','in_review'].includes(String((d.data()as any).status))).length,availableCards:cardsSnap.docs.filter(d=>String((d.data()as any).saleStatus)==='available').length,activeDeliveries:deliverySnap.docs.filter(d=>['pending','assigned','out_for_delivery','in_progress'].includes(String((d.data()as any).status))).length,activePaymentMethods:paymentMethods.filter(m=>m.active).length});
    }catch(error){console.error('[ADMIN_DASHBOARD_ERROR]',error);toast.error("Impossible de charger complètement l'accueil admin.")}
    finally{setLoading(false);setRefreshing(false)}
  };

  useEffect(()=>{void load()},[]);
  const openWallet=(currency:TreasuryCurrency,direction:'credit'|'debit')=>{setAmount('');setCvv('');setWalletModal({currency,direction})};
  const confirmWallet=async()=>{if(!walletModal)return;const numeric=Number(amount.replace(',','.'));if(!Number.isFinite(numeric)||numeric<=0)return void toast.error('Montant invalide.');if(!/^\d{3}$/.test(cvv))return void toast.error('CVV à 3 chiffres requis.');setWalletBusy(true);try{await adminTreasuryService.adjust({currency:walletModal.currency,direction:walletModal.direction,amount:numeric,cvv});toast.success(walletModal.direction==='credit'?'Fonds ajoutés au wallet admin.':'Fonds réduits du wallet admin.');setWalletModal(null);await load()}catch(e:any){toast.error(e?.message||'Opération refusée.')}finally{setWalletBusy(false)}};

  const modules=[
    {label:'Clients et portefeuilles',description:'Comptes, rôles, wallets et sécurité.',icon:WalletCards,to:'/admin/users',badge:stats.clients+stats.merchants+stats.developers},
    {label:'Validations',description:'KYC et demandes Agent / Marchand / Developer / API.',icon:ShieldCheck,to:'/admin/account-requests',badge:stats.pendingKyc+stats.pendingUpgrades},
    {label:'Agents',description:'Points de vente, float et contrôle des comptes.',icon:HandCoins,to:'/admin/agents',badge:stats.agents},
    {label:'Demandes de cartes',description:'Traitement des commandes et validations.',icon:CreditCard,to:'/admin/requests',badge:stats.pendingCardRequests},
    {label:'Stock cartes',description:'Cartes disponibles et gestion du stock.',icon:Boxes,to:'/admin/stock',badge:stats.availableCards},
    {label:'Livraisons',description:'Suivi des cartes physiques à livrer.',icon:Truck,to:'/admin/deliveries',badge:stats.activeDeliveries},
    {label:'Configuration',description:'Paiements et paramètres administratifs.',icon:Settings2,to:'/admin/settings',badge:stats.activePaymentMethods},
  ];
  const pendingTotal=stats.pendingKyc+stats.pendingUpgrades+stats.pendingCardRequests;

  return <div className="space-y-5 pb-20">
    <section className="flex items-center justify-between gap-4 rounded-3xl bg-blue-950 p-5 text-white shadow-lg"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-400">Centre de contrôle</p><h1 className="mt-1 text-2xl font-black">Administration</h1><p className="mt-1 text-xs text-blue-200">Pilotage général de Market-Cash.</p></div><button onClick={load} disabled={refreshing} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 disabled:opacity-50" aria-label="Actualiser"><RefreshCw size={18} className={refreshing?'animate-spin':''}/></button></section>

    {loading?<div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-500">Chargement…</div>:<>
      <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-950">Wallet administrateur</h2><p className="text-xs text-slate-500">Trésorerie de règlement Market-Cash. Chaque mouvement exige le CVV du wallet.</p></div></div><div className="grid gap-3 md:grid-cols-2">{(['USD','CDF']as TreasuryCurrency[]).map(currency=><div key={currency} className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Wallet {currency}</p><p className="mt-2 text-3xl font-black text-blue-950">{fmt(Number(treasury?.wallets?.[currency]?.availableBalance||0),currency)}</p></div><div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-950"><WalletCards size={20}/></div></div><div className="mt-5 grid grid-cols-2 gap-2"><button onClick={()=>openWallet(currency,'credit')} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-black text-white"><Plus size={17}/>Ajouter le fond</button><button onClick={()=>openWallet(currency,'debit')} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-3 text-sm font-black text-white"><Minus size={17}/>Réduire le fond</button></div></div>)}</div></section>

      <section className="rounded-3xl border bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black text-slate-950">Vue rapide</h2><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Statistiques</span></div><div className="grid grid-cols-5 divide-x rounded-2xl bg-slate-50 py-3"><Stat value={stats.totalUsers} label="Utilisateurs"/><Stat value={stats.clients} label="Clients"/><Stat value={stats.agents} label="Agents"/><Stat value={stats.merchants} label="Marchands"/><Stat value={stats.developers} label="Developers"/></div></section>
      {pendingTotal>0&&<section className="rounded-3xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-black text-amber-950">{pendingTotal} élément(s) à traiter</p><p className="mt-1 text-xs text-amber-800">KYC {stats.pendingKyc} · comptes pro {stats.pendingUpgrades} · cartes {stats.pendingCardRequests}</p></div><button onClick={()=>navigate(stats.pendingKyc+stats.pendingUpgrades>0?'/admin/account-requests':'/admin/requests')} className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-black text-blue-950">Ouvrir</button></div></section>}
      <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black text-slate-950">Gestion</h2><span className="text-[10px] font-bold text-slate-400">Tous les comptes restent disponibles</span></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{modules.map(item=>{const I=item.icon;return <button key={item.label} onClick={()=>navigate(item.to)} className="rounded-3xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-950"><I size={20}/></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{item.badge}</span></div><p className="mt-4 text-sm font-black text-slate-950">{item.label}</p><p className="mt-1 hidden text-xs leading-5 text-slate-500 sm:block">{item.description}</p></button>})}</div></section>
    </>}

    {walletModal&&<div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-slate-400">Wallet admin {walletModal.currency}</p><h3 className="mt-1 text-xl font-black text-blue-950">{walletModal.direction==='credit'?'Ajouter le fond':'Réduire le fond'}</h3></div><button onClick={()=>setWalletModal(null)} className="rounded-full bg-slate-100 p-2 text-slate-500"><X size={18}/></button></div><div className="mt-5 space-y-4"><div><label className="text-xs font-black uppercase text-slate-500">Montant</label><input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={`Montant en ${walletModal.currency}`} className="mt-1 w-full rounded-2xl border p-4 text-lg font-bold"/></div><div><label className="text-xs font-black uppercase text-slate-500">CVV du wallet</label><input value={cvv} onChange={e=>setCvv(e.target.value.replace(/\D/g,'').slice(0,3))} inputMode="numeric" type="password" placeholder="•••" className="mt-1 w-full rounded-2xl border-2 p-4 text-center text-2xl font-black tracking-[.45em]"/></div><button disabled={walletBusy||!amount||cvv.length!==3} onClick={confirmWallet} className={`w-full rounded-2xl py-4 font-black text-white disabled:opacity-40 ${walletModal.direction==='credit'?'bg-emerald-600':'bg-slate-900'}`}>{walletBusy?'Traitement…':'Confirmer avec le CVV'}</button></div></div></div>}
  </div>;
}
function Stat({value,label}:{value:number;label:string}){return <div className="px-1 text-center"><div className="text-lg font-black text-blue-950 sm:text-xl">{value}</div><div className="mt-1 truncate text-[8px] font-black uppercase tracking-wide text-slate-400 sm:text-[9px]">{label}</div></div>}
