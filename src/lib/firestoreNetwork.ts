export type FirestoreNetworkState = {
  status: 'healthy' | 'degraded';
  lastChangedAt: number;
  lastOperation?: string;
};

export type FirestoreNetworkIncident = {
  id: string;
  timestamp: number;
  event: 'FIRESTORE_NETWORK_DEGRADED' | 'FIRESTORE_OPERATION_FAILED' | 'FIRESTORE_OPERATION_RECOVERED';
  operation: string;
  message: string;
  errorCode?: string;
};

let state: FirestoreNetworkState = { status: 'healthy', lastChangedAt: Date.now() };
let incidents: FirestoreNetworkIncident[] = [];
const listeners = new Set<() => void>();
const lastIncidentByKey = new Map<string, number>();
const DEDUPE_WINDOW_MS = 15_000;

const emit = () => listeners.forEach(listener => listener());

const isTransportError = (error: any) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || error || '').toLowerCase();
  return ['unavailable', 'deadline-exceeded', 'aborted', 'internal', 'unknown'].some(value => code.includes(value))
    || /(webchannel|transport errored|network|offline|connection|listen stream|write stream)/i.test(message);
};

export const firestoreErrorMessage = (error: any, fallback: string) => isTransportError(error)
  ? 'Connexion temporairement instable. Aucune nouvelle tentative automatique ne sera lancée ; vérifiez l’état affiché avant de réessayer.'
  : fallback;

const recordIncident = (incident: Omit<FirestoreNetworkIncident, 'id' | 'timestamp'>) => {
  const now = Date.now();
  const key = `${incident.event}:${incident.operation}:${incident.errorCode || ''}`;
  if (now - (lastIncidentByKey.get(key) || 0) < DEDUPE_WINDOW_MS) return;
  lastIncidentByKey.set(key, now);
  incidents = [{ ...incident, id: `${now}-${incident.event}`, timestamp: now }, ...incidents].slice(0, 50);
  emit();
};

export const firestoreNetwork = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getSnapshot() { return state; },
  getIncidents() { return incidents; },

  reportFailure(operation: string, error: any) {
    const errorCode = String(error?.code || error?.name || 'unknown');
    const message = String(error?.message || error || 'Erreur Firestore inconnue');
    console.error('[FIRESTORE_OPERATION_FAILED]', { operation, errorCode, message });
    recordIncident({ event: 'FIRESTORE_OPERATION_FAILED', operation, message, errorCode });
    if (!isTransportError(error)) return;
    if (state.status !== 'degraded') {
      state = { status: 'degraded', lastChangedAt: Date.now(), lastOperation: operation };
      recordIncident({ event: 'FIRESTORE_NETWORK_DEGRADED', operation, message, errorCode });
    }
  },

  reportRecovered(operation: string) {
    if (state.status !== 'degraded') return;
    state = { status: 'healthy', lastChangedAt: Date.now(), lastOperation: operation };
    console.info('[FIRESTORE_OPERATION_RECOVERED]', { operation });
    recordIncident({ event: 'FIRESTORE_OPERATION_RECOVERED', operation, message: 'La communication avec Firestore a repris.' });
    emit();
  },

  async guard<T>(operation: string, task: () => Promise<T>): Promise<T> {
    try {
      const result = await task();
      this.reportRecovered(operation);
      return result;
    } catch (error) {
      this.reportFailure(operation, error);
      throw error;
    }
  }
};
