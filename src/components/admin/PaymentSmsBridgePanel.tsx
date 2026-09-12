import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { CheckCircle2, RefreshCw, ShieldCheck, Smartphone, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { functions } from '../../firebase/config';
import { paymentSmsNative, type PaymentSmsStatus } from '../../native/paymentSms';

const EMPTY_STATUS: PaymentSmsStatus = {
  supported: false,
  isDefaultSms: false,
  pendingCount: 0,
  platform: 'web',
};

export default function PaymentSmsBridgePanel() {
  const [status, setStatus] = useState<PaymentSmsStatus>(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const isAndroid = paymentSmsNative.isAndroid();

  const refresh = async () => {
    if (!isAndroid) {
      setStatus(EMPTY_STATUS);
      setLoading(false);
      return;
    }
    try {
      setStatus(await paymentSmsNative.getStatus());
    } catch (error) {
      console.error('[PAYMENT_SMS_STATUS]', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const setupSmsRole = async () => {
    try {
      setLoading(true);
      const permission = await paymentSmsNative.requestPermissions();
      if (!permission.granted) {
        toast.error('Autorisation SMS refusée sur ce téléphone.');
        return;
      }
      const role = await paymentSmsNative.requestDefaultSmsRole();
      await refresh();
      role.isDefaultSms
        ? toast.success('Market-Cash contrôle maintenant les SMS de ce téléphone.')
        : toast('Sélectionnez Market-Cash comme application SMS par défaut.');
    } catch (error: any) {
      console.error('[PAYMENT_SMS_ROLE]', error);
      toast.error(error?.message || 'Configuration SMS impossible.');
    } finally {
      setLoading(false);
    }
  };

  const syncPending = async () => {
    if (!isAndroid) return;
    setSyncing(true);
    try {
      const messages = await paymentSmsNative.getPendingSms();
      if (messages.length === 0) {
        toast('Aucun nouveau SMS de paiement à synchroniser.');
        await refresh();
        return;
      }

      const ingest = httpsCallable(functions, 'paymentBridgeIngestSms');
      const acknowledged: string[] = [];
      let failed = 0;

      for (const message of messages) {
        try {
          await ingest({
            senderAddress: message.senderAddress,
            body: message.body,
            receivedAt: message.receivedAt,
            simSlot: message.simSlot,
            subscriptionId: message.subscriptionId,
            deviceId: 'market-cash-admin-android',
          });
          acknowledged.push(message.id);
        } catch (error) {
          failed += 1;
          console.error('[PAYMENT_SMS_INGEST]', message.id, error);
        }
      }

      if (acknowledged.length > 0) await paymentSmsNative.acknowledge(acknowledged);
      await refresh();
      if (failed === 0) toast.success(`${acknowledged.length} SMS synchronisé${acknowledged.length > 1 ? 's' : ''}.`);
      else toast.error(`${failed} SMS n'ont pas pu être synchronisés.`);
    } catch (error: any) {
      console.error('[PAYMENT_SMS_SYNC]', error);
      toast.error(error?.message || 'Synchronisation SMS impossible.');
    } finally {
      setSyncing(false);
    }
  };

  if (!isAndroid) {
    return <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Smartphone size={20}/></div>
        <div>
          <h2 className="font-black text-slate-950">Téléphone de contrôle Market-Cash</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Cette interface Web affiche les transactions synchronisées. La capture automatique des SMS s'active dans l'APK Android interne Market-Cash installé sur le téléphone qui contient les SIM marchandes.</p>
        </div>
      </div>
    </section>;
  }

  return <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${status.isDefaultSms ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'}`}>
          {status.isDefaultSms ? <CheckCircle2 size={21}/> : <Smartphone size={21}/>}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-black text-slate-950">Bridge SMS Android</h2>
            <span className={`rounded-full px-2 py-1 text-[10px] font-black ${status.isDefaultSms ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{status.isDefaultSms ? 'ACTIF' : 'À CONFIGURER'}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{status.isDefaultSms ? 'Market-Cash reçoit les SMS destinés aux SIM marchandes sur cet appareil.' : 'Market-Cash doit être choisi comme application SMS par défaut sur ce téléphone dédié.'}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold text-slate-500"><span>File locale : {status.pendingCount}</span><span>Plateforme : Android</span></div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!status.isDefaultSms && <button onClick={() => void setupSmsRole()} disabled={loading} className="flex items-center gap-2 rounded-xl bg-blue-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-60"><ShieldCheck size={16}/>{loading ? 'Configuration…' : 'Activer contrôle SMS'}</button>}
        <button onClick={() => void syncPending()} disabled={syncing || !status.isDefaultSms} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700 disabled:opacity-40">{syncing ? <RefreshCw size={16} className="animate-spin"/> : status.isDefaultSms ? <RefreshCw size={16}/> : <WifiOff size={16}/>}Synchroniser</button>
      </div>
    </div>
  </section>;
}
