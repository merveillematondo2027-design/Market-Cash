import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';
import { firestoreNetwork } from '../lib/firestoreNetwork';

export default function FirestoreNetworkBanner() {
  const network = useSyncExternalStore(firestoreNetwork.subscribe, firestoreNetwork.getSnapshot, firestoreNetwork.getSnapshot);
  if (network.status !== 'degraded') return null;
  return <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] max-w-[calc(100vw-1.5rem)] rounded-full bg-amber-100 border border-amber-300 text-amber-950 px-4 py-2 shadow-lg flex items-center gap-2 text-xs font-black pointer-events-none">
    <WifiOff size={15} className="shrink-0" /><span>Connexion instable — tentative de reconnexion…</span>
  </div>;
}
