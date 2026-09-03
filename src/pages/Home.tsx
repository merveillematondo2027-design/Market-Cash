import React,{useState}from'react';
import{Link,Navigate}from'react-router-dom';
import{ArrowDownLeft,Banknote,Bitcoin,CreditCard,History,LogIn,QrCode,RadioTower,Send,ShieldCheck,ShoppingBag,Store,User,WalletCards,X}from'lucide-react';
import{useAuthStore}from'../store/authStore';
import{getHomeRouteByRole}from'../lib/roleNavigation';

const guestActions=[
  {name:'Envoyer',subtitle:'Vers Market-Cash',icon:Send},
  {name:'Dépôt',subtitle:'Mobile Money / banque',icon:ArrowDownLeft},
  {name:'Retrait',subtitle:'Chez un agent agréé',icon:Banknote},
  {name:'Payer',subtitle:'Un marchand vérifié',icon:ShoppingBag},
  {name:'Recevoir',subtitle:'Mon ID / QR',icon:QrCode},
  {name:'Recharger carte',subtitle:'Depuis le portefeuille',icon:CreditCard},
  {name:'Historique',subtitle:'Toutes les opérations',icon:History},
];

const guestServices=[
  {name:'Cartes',subtitle:'Cartes Market-Cash',icon:CreditCard},
  {name:'e-SIM',subtitle:'Connectivité internationale',icon:RadioTower},
  {name:'Crypto',subtitle:'Service en préparation',icon:Bitcoin},
  {name:'Agent',subtitle:'Dépôts et retraits cash',icon:Store},
];

export default function Home(){
  const{isAuthenticated,user,loading}=useAuthStore();
  const[currency,setCurrency]=useState<'USD'|'CDF'>('USD');
  const[action,setAction]=useState<string|null>(null);

  if(loading)return <div className="grid min-h-screen place-items-center bg-slate-50"><div className="h-11 w-11 animate-spin rounded-full border-4 border-slate-200 border-t-blue-950"/></div>;
  if(isAuthenticated&&user)return <Navigate to={getHomeRouteByRole(user.role)} replace/>;

  const money=currency==='USD'?'0,00 USD':'0 CDF';
  return <div className="min-h-screen bg-slate-50 pb-24 text-slate-900">
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-950 text-white shadow-sm"><ShieldCheck size={21}/></div><div><div className="text-sm font-black tracking-tight text-blue-950">MARKET-<span className="text-amber-500">CASH</span></div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Wallet local</div></div></Link>
        <Link to="/login" className="inline-flex items-center gap-2 rounded-xl bg-blue-950 px-4 py-2.5 text-xs font-black text-white shadow-sm"><LogIn size={15}/>Connexion</Link>
      </div>
    </header>

    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 md:p-8">
      <section className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-slate-500">Bienvenue sur Market-Cash</p><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">Votre portefeuille Market-Cash</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Consultez l’application librement. La connexion est demandée uniquement au moment d’utiliser une fonction liée à votre argent, votre identité ou votre compte.</p></div></section>

      <section className="rounded-[2rem] bg-blue-950 p-6 text-white shadow-xl">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-200">Solde disponible</p><p className="mt-2 text-4xl font-black">{money}</p><p className="mt-3 flex items-center gap-2 text-xs font-semibold text-blue-200"><ShieldCheck size={14}/> Mode découverte sécurisé</p></div><WalletCards size={32} className="text-amber-400"/></div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><div className="inline-flex rounded-2xl bg-white/10 p-1"><button onClick={()=>setCurrency('USD')} className={`rounded-xl px-5 py-2 text-sm font-black ${currency==='USD'?'bg-white text-blue-950':'text-blue-100'}`}>USD</button><button onClick={()=>setCurrency('CDF')} className={`rounded-xl px-5 py-2 text-sm font-black ${currency==='CDF'?'bg-white text-blue-950':'text-blue-100'}`}>CDF</button></div><span className="rounded-xl bg-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-blue-100">Connectez-vous pour afficher votre vrai solde</span></div>
      </section>

      <section><div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-950">Actions du wallet</h2><p className="text-xs text-slate-500">Les opérations financières exigent une session Market-Cash.</p></div></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{guestActions.map(item=>{const I=item.icon;return <button key={item.name} onClick={()=>setAction(item.name)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md active:scale-[.99]"><I size={22} className="text-blue-800"/><span className="mt-3 block text-sm font-black text-slate-900">{item.name}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{item.subtitle}</span></button>})}</div></section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600"><QrCode size={21}/></div><div><h2 className="font-black text-slate-950">Votre identité Market-Cash</h2><p className="mt-1 text-sm leading-6 text-slate-500">Après création du compte, Market-Cash génère automatiquement votre identifiant. Il permet de recevoir des transferts internes et d’identifier votre portefeuille sans communiquer vos données sensibles.</p><button onClick={()=>setAction('Afficher mon ID Market-Cash')} className="mt-3 text-xs font-black text-blue-800">Afficher mon ID →</button></div></div></section>

      <section><div className="mb-3"><h2 className="text-lg font-black text-slate-950">Services Market-Cash</h2><p className="text-xs text-slate-500">Une seule identité, plusieurs services.</p></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{guestServices.map(item=>{const I=item.icon;return <button key={item.name} onClick={()=>setAction(item.name)} className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 text-blue-900"><I size={21}/></div><h3 className="mt-4 font-black text-slate-950">{item.name}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{item.subtitle}</p></button>})}</div></section>

      <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="font-black text-blue-950">Vous avez déjà un compte ?</h2><p className="mt-1 text-sm text-blue-800/70">Connectez-vous pour retrouver votre solde, vos cartes, vos opérations et votre profil.</p></div><div className="flex gap-2"><Link to="/register" className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-xs font-black text-blue-950">Créer un compte</Link><Link to="/login" className="rounded-xl bg-blue-950 px-4 py-2.5 text-xs font-black text-white">Se connecter</Link></div></div></section>
    </main>

    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto grid h-16 max-w-2xl grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur md:rounded-t-2xl md:border-x"><button className="flex flex-col items-center justify-center gap-1 text-[10px] font-black text-blue-950"><WalletCards size={20}/><span>Wallet</span></button><button onClick={()=>setAction('Cartes')} className="flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-400"><CreditCard size={20}/><span>Cartes</span></button><button onClick={()=>setAction('e-SIM')} className="flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-400"><RadioTower size={20}/><span>e-SIM</span></button><button onClick={()=>setAction('Crypto')} className="flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-400"><Bitcoin size={20}/><span>Crypto</span></button><button onClick={()=>setAction('Profil')} className="flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-slate-400"><User size={20}/><span>Profil</span></button></nav>

    {action&&<div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center" onClick={()=>setAction(null)}><section onClick={e=>e.stopPropagation()} className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-950"><LogIn size={22}/></div><button onClick={()=>setAction(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={20}/></button></div><h2 className="mt-5 text-xl font-black text-slate-950">Connexion requise</h2><p className="mt-2 text-sm leading-6 text-slate-500">Pour utiliser « {action} », connectez-vous à votre compte Market-Cash. Votre wallet et vos informations personnelles restent invisibles tant que vous n’êtes pas authentifié.</p><div className="mt-6 grid gap-2 sm:grid-cols-2"><Link to="/login" className="rounded-2xl bg-blue-950 px-4 py-3.5 text-center text-sm font-black text-white">Se connecter</Link><Link to="/register" className="rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-center text-sm font-black text-slate-800">Créer un compte</Link></div></section></div>}
  </div>;
}
