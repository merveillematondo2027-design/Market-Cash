import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CreditCard, Headphones, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { getHomeRouteByRole } from '../lib/roleNavigation';

export default function Home() {
  const { isAuthenticated, user, loading } = useAuthStore();
  const workspaceRoute = user ? getHomeRouteByRole(user.role) : '/login';

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-blue-950 shadow-sm">
              <ShieldCheck size={24} />
            </div>
            <div>
              <div className="text-base font-black leading-tight text-blue-950">MARKET-CASH</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Automarket Fintech</div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            {!loading && isAuthenticated && user ? (
              <Link to={workspaceRoute} className="rounded-xl bg-blue-950 px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-blue-900">
                Mon espace
              </Link>
            ) : (
              <Link to="/login" className="rounded-xl bg-blue-950 px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-blue-900">
                Se connecter
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 text-white">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 sm:py-16 md:grid-cols-[1.1fr_.9fr] md:items-center md:py-20">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-blue-100">
              <Sparkles size={14} className="text-amber-300" />
              Carte Market-Cash, simple et accessible
            </div>
            <h1 className="max-w-3xl text-4xl font-black leading-[1.04] sm:text-5xl md:text-6xl">
              Votre carte Market-Cash, prête pour vos opérations du quotidien.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
              Découvrez le service avant de vous connecter. Créez ensuite votre compte pour commander une carte, suivre vos demandes, préparer une impression physique et gérer vos opérations depuis votre espace personnel.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {!loading && isAuthenticated && user ? (
                <Link to={workspaceRoute} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-400 px-5 py-3.5 text-sm font-black text-blue-950 shadow-lg shadow-black/10">
                  Accéder à mon espace <ArrowRight size={18} />
                </Link>
              ) : (
                <>
                  <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-400 px-5 py-3.5 text-sm font-black text-blue-950 shadow-lg shadow-black/10">
                    Créer mon compte <ArrowRight size={18} />
                  </Link>
                  <Link to="/login" className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-black text-white">
                    J’ai déjà un compte
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="mx-auto w-full max-w-md">
            <div className="rounded-[28px] border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur">
              <div className="relative aspect-[1.58/1] overflow-hidden rounded-[24px] border border-blue-300/15 bg-gradient-to-br from-blue-800 via-blue-950 to-slate-950 p-5 shadow-xl">
                <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-blue-400/20 blur-2xl" />
                <div className="relative flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-lg font-black tracking-tight">MARKET-<span className="text-amber-400">CASH</span></div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-200">Carte prépayée</div>
                    </div>
                    <div className="rounded-xl bg-white/10 p-2"><CreditCard size={22} /></div>
                  </div>
                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300">Votre carte, votre accès</div>
                    <div className="font-mono text-lg font-black tracking-[0.18em] text-white">•••• •••• •••• 4456</div>
                    <div className="mt-4 flex items-end justify-between text-[10px] text-blue-200">
                      <span>CLIENT MARKET-CASH</span>
                      <span className="font-black text-amber-300">ACTIVE</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="grid gap-3 sm:grid-cols-3">
          <Feature icon={<CreditCard size={21} />} title="Une carte, plusieurs options" text="Commandez votre carte Market-Cash puis ajoutez l’impression physique ou le traitement urgent selon votre besoin." />
          <Feature icon={<Zap size={21} />} title="Traitement urgent" text="Lorsque l’option urgence est disponible, votre demande peut être traitée rapidement après validation du paiement." />
          <Feature icon={<Headphones size={21} />} title="Assistance disponible" text="Une fois connecté, accédez au centre d’aide et au support WhatsApp directement depuis votre espace." />
        </div>

        <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-5 sm:p-7">
          <div>
            <h2 className="text-xl font-black text-blue-950">Commencez depuis l’accueil, connectez-vous seulement quand vous en avez besoin.</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">La consultation de cette page reste publique. Les opérations personnelles et administratives restent protégées par authentification et permissions.</p>
          </div>
          <Link to={isAuthenticated && user ? workspaceRoute : '/login'} className="mt-4 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-950 px-5 py-3.5 text-sm font-black text-white sm:mt-0 sm:w-auto">
            {isAuthenticated && user ? 'Ouvrir mon espace' : 'Se connecter'} <ArrowRight size={17} />
          </Link>
        </div>
      </section>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-800">{icon}</div>
      <h2 className="text-base font-black text-blue-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </article>
  );
}
