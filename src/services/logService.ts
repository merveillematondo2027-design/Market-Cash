import { collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { AppLog, LogCategory } from '../types';

const REDACTED_KEYS = /(pin|cvv|token|secret|password|cardnumber|rechargenumber|proof)/i;

function sanitizeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return undefined;
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => {
    if (REDACTED_KEYS.test(key)) return [key, '[MASQUÉ]'];
    if (typeof value === 'string' && /\b\d{16}\b/.test(value)) return [key, value.replace(/\b\d{16}\b/g, '••••••••••••••••')];
    return [key, value];
  }));
}

export const logService = {
  async writeLog(log: Omit<AppLog, 'timestamp' | 'id'>) {
    try {
      const logData: AppLog = { ...log, timestamp: Date.now() };
      const currentUser = auth.currentUser;
      if (currentUser) {
        logData.userId = currentUser.uid;
        logData.userEmail = currentUser.email || '';
      }
      if (logData.metadata) logData.metadata = sanitizeMetadata(logData.metadata);
      Object.keys(logData).forEach(key => {
        if ((logData as any)[key] === undefined) delete (logData as any)[key];
      });

      if (currentUser) await addDoc(collection(db, 'appLogs'), logData);

      if (log.level === 'ERROR' || log.level === 'CRITICAL') console.error(`[${log.event}]`, log.message, logData);
      else if (log.level === 'WARNING') console.warn(`[${log.event}]`, log.message, logData);
      else console.log(`[${log.event}]`, log.message, logData);
    } catch (error) {
      console.error('[LOG_SERVICE_ERROR] Failed to write log to Firestore:', error);
    }
  },

  info(category: LogCategory, event: string, message: string, extra?: Partial<AppLog>) {
    void this.writeLog({ level: 'INFO', category, event, message, ...extra });
  },

  success(category: LogCategory, event: string, message: string, extra?: Partial<AppLog>) {
    void this.writeLog({ level: 'SUCCESS', category, event, message, success: true, ...extra });
  },

  warning(category: LogCategory, event: string, message: string, extra?: Partial<AppLog>) {
    void this.writeLog({ level: 'WARNING', category, event, message, ...extra });
  },

  audit(event: string, message: string, metadata?: Record<string, unknown>, extra?: Partial<AppLog>) {
    void this.writeLog({
      level: 'INFO',
      category: 'USER',
      event,
      message,
      operation: String(metadata?.operation || event).toLowerCase(),
      metadata: sanitizeMetadata(metadata),
      ...extra
    });
  },

  error(category: LogCategory, event: string, error: any, extra?: Partial<AppLog>) {
    let errorCode = error?.code || undefined;
    const errorName = error?.name || undefined;
    const message = error?.message || String(error);
    const stack = error?.stack || undefined;
    if (message.includes('Missing or insufficient permissions') || errorCode === 'permission-denied') {
      errorCode = 'permission-denied';
      event = 'PERMISSION_DENIED';
    }
    void this.writeLog({ level: 'ERROR', category, event, message, errorCode, errorName, stack, success: false, ...extra });
  },

  critical(category: LogCategory, event: string, error: any, extra?: Partial<AppLog>) {
    void this.writeLog({
      level: 'CRITICAL',
      category,
      event,
      message: error?.message || String(error),
      errorCode: error?.code || undefined,
      errorName: error?.name || undefined,
      stack: error?.stack || undefined,
      success: false,
      ...extra
    });
  }
};
