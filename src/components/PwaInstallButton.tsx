import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setDismissed(false);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      toast.success('Market-Cash est installé.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) {
      toast('Sur Android/Chrome : menu ⋮ puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».');
      return;
    }

    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  if (installed || dismissed) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[90] flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl sm:bottom-6">
      <button
        type="button"
        onClick={() => void install()}
        className="flex items-center gap-2 rounded-xl bg-blue-950 px-4 py-3 text-sm font-black text-white active:scale-[0.98]"
        aria-label="Installer Market-Cash"
      >
        <Download className="h-5 w-5" />
        Installer l’application
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
        aria-label="Masquer le bouton d’installation"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
