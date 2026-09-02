import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CreditCard, Headphones, QrCode, ShieldCheck, WalletCards } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { getHomeRouteByRole } from '../lib/roleNavigation';

export default function Home() {
  const { isAuthenticated, user, loading } = useAuthStore();
  const workspaceRoute = user ? getHomeRouteByRole(user.role) : '/login';
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-950 text-white"><ShieldCheck size={22}/></div><div><div className="font-black text-blue-950">MARKET-CASH</div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fintech locale</div></div></Link>
        <Link to={!loading&&isAuthenticated&&user?workspaceRoute:'/login'} className="rounded-xl bg-blue-950 px-4 py-2.5 text-xs font-black text-white">{!loading&&isAuthenticated&&user?'Mon espace':'Se connecter'}</Link>
      </div>
    </header>

    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 md:items-center md:py-20">
        <div><span className="inline-flex rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-900">Portefeuille · Cartes · Paiements locaux</span><h1 className="mt-5 text-4xl font-black leading-tight text-slate-950 sm:text-5xl">Une expérience financière simple, claire et sécurisée.</h1><p className="mt-5 max-w-xl text-base leading-7 text-slate-600">Market-Cash réunit votre portefeuille local, vos moyens de paiement et vos services financiers dans une application pensée pour rester accessible et fiable au quotidien.</p><div className="mt-7 flex flex-col gap-3 sm:flex-row">{!loading&&isAuthenticated&&user?<Link to={workspaceRoute} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-950 px-5 py-3.5 text-sm font-black text-white">Accéder à mon espace <ArrowRight size={18}/></Link>:<><Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-950 px-5 py-3.5 text-sm font-black text-white">Créer mon compte <ArrowRight size={18}/></Link><Link to="/login" className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3.5 text-sm font-black text-slate-800">J’ai déjà un compte</Link></>}</div></div>
        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5 shadow-sm"><div className="rounded-3xl bg-blue-950 p-6 text-white"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-200">Solde Market-Cash</p><p className="mt-2 text-4xl font-black">0.00 USD</p></div><WalletCards className="text-amber-400" size={30}/></div><div className="mt-8 grid grid-cols-3 gap-3"><Mini icon={<QrCode size={18}/>} title="QR local"/><Mini icon={<CreditCard size={18}/>} title="Visa virtuelle"/><Mini icon={<ShieldCheck size={18}/>} title="Sécurisé"/></div></div></div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6"><div className="grid gap-4 sm:grid-cols-3"><Feature icon={<WalletCards/>} title="Portefeuille Market-Cash" text="Un compte local pour recevoir, envoyer et suivre vos opérations Market-Cash."/><Feature icon={<CreditCard/>} title="Cartes adaptées à chaque usage" text="Visa virtuelle pour les services internationaux et carte Market-Cash locale pour QR et futur NFC."/><Feature icon={<Headphones/>} title="Accompagnement accessible" text="Notifications, centre d’aide et assistance depuis votre espace personnel."/></div><div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex sm:items-center sm:justify-between"><div><h2 className="text-xl font-black text-slate-950">Commencez librement depuis l’accueil.</h2><p className="mt-2 text-sm text-slate-500">La connexion est demandée uniquement lorsque vous accédez à vos opérations personnelles.</p></div><Link to={isAuthenticated&&user?workspaceRoute:'/register'} className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-950 px-5 py-3 text-sm font-black text-white sm:mt-0">{isAuthenticated&&user?'Ouvrir mon espace':'Créer un compte'} <ArrowRight size={17}/></Link></div></section>
  </main>;
}

function Mini({icon,title}:{icon:React.ReactNode;title:string}){return <div className="rounded-2xl bg-white/10 p-3 text-center"><div className="flex justify-center text-blue-100">{icon}</div><div className="mt-2 text-[10px] font-bold text-blue-100">{title}</div></div>}
function Feature({icon,title,text}:{icon:React.ReactNode;title:string;text:string}){return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-900">{icon}</div><h2 className="font-black text-slate-950">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></article>}
