import { collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { AppLog, LogLevel, LogCategory } from '../types';

const SENSITIVE_KEYS = ['pin', 'pinhash', 'cvv', 'password', 'token', 'accesstoken', 'refreshtoken', 'cardnumber', 'rechargenumber', 'proofurl', 'paymentproofurl'];

function sanitize(value: any, key = ''): any {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (SENSITIVE_KEYS.some(k => normalized.includes(k))) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(v => sanitize(v));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, k)]));
  }
  return value;
}

export const logService = {
  async writeLog(log: Omit<AppLog, 'timestamp' | 'id'>) {
    try {
      const currentUser = auth.currentUser;
      const logData: AppLog = sanitize({ ...log, timestamp: Date.now() });
      if (currentUser) {
        logData.userId = currentUser.uid;
        logData.userEmail = currentUser.email || '';
      }
      Object.keys(logData).forEach(key => {
        if ((logData as any)[key] === undefined) delete (logData as any)[key];
      });
      if (currentUser) await addDoc(collection(db, 'appLogs'), logData);
      if (log.level === 'ERROR' || log.level === 'CRITICAL') console.error(`[${log.event}]`, log.message, logData);
      else if (log.level === 'WARNING') console.warn(`[${log.event}]`, log.message, logData);
      else console.log(`[${log.event}]`, log.message, logData);
    } catch (e) {
      console.error('[LOG_SERVICE_ERROR] Failed to write log to Firestore:', e);
    }
  },

  audit(event: string, message: string, metadata: Record<string, any> = {}) {
    const { targetType, targetId, success = true, ...safeMetadata } = metadata;
    this.writeLog({
      level: success ? 'SUCCESS' : 'WARNING', category: 'USER', event, message, success,
      route: typeof window !== 'undefined' ? window.location.pathname : undefined,
      operation: event.toLowerCase(), documentId: targetId,
      metadata: sanitize({ targetType, targetId, ...safeMetadata })
    });
  },

  info(category: LogCategory, event: string, message: string, extra?: Partial<AppLog>) { this.writeLog({ level: 'INFO', category, event, message, ...extra }); },
  success(category: LogCategory, event: string, message: string, extra?: Partial<AppLog>) { this.writeLog({ level: 'SUCCESS', category, event, message, success: true, ...extra }); },
  warning(category: LogCategory, event: string, message: string, extra?: Partial<AppLog>) { this.writeLog({ level: 'WARNING', category, event, message, ...extra }); },
  error(category: LogCategory, event: string, error: any, extra?: Partial<AppLog>) {
    let errorCode = error?.code || undefined;
    const errorName = error?.name || undefined;
    const message = error?.message || String(error);
    if (message.includes('Missing or insufficient permissions') || errorCode === 'permission-denied') { errorCode = 'permission-denied'; event = 'PERMISSION_DENIED'; }
    this.writeLog({ level: 'ERROR', category, event, message, errorCode, errorName, success: false, ...extra });
  },
  critical(category: LogCategory, event: string, error: any, extra?: Partial<AppLog>) {
    this.writeLog({ level: 'CRITICAL', category, event, message: error?.message || String(error), errorCode: error?.code, errorName: error?.name, success: false, ...extra });
  }
};
