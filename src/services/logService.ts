import { collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { AppLog, LogCategory } from '../types';

const SENSITIVE_KEYS = ['pin', 'pinhash', 'cvv', 'cvc', 'token', 'password', 'cardnumber', 'rechargenumber'];

function sanitizeMetadata(input: unknown): any {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(sanitizeMetadata);
  const output: Record<string, unknown> = {};
  Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
    const normalized = key.toLowerCase();
    if (SENSITIVE_KEYS.some(sensitive => normalized.includes(sensitive))) {
      output[key] = '[MASQUÉ]';
    } else if (value && typeof value === 'object') {
      output[key] = sanitizeMetadata(value);
    } else {
      output[key] = value;
    }
  });
  return output;
}

export const logService = {
  async writeLog(log: Omit<AppLog, 'timestamp' | 'id'>) {
    try {
      const logData: AppLog = { ...log, metadata: sanitizeMetadata(log.metadata), timestamp: Date.now() };
      const currentUser = auth.currentUser;
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

  info(category: LogCategory, event: string, message: string, extra?: Partial<AppLog>) {
    void this.writeLog({ level: 'INFO', category, event, message, ...extra });
  },

  success(category: LogCategory, event: string, message: string, extra?: Partial<AppLog>) {
    void this.writeLog({ level: 'SUCCESS', category, event, message, success: true, ...extra });
  },

  warning(category: LogCategory, event: string, message: string, extra?: Partial<AppLog>) {
    void this.writeLog({ level: 'WARNING', category, event, message, ...extra });
  },

  error(category: LogCategory, event: string, error: any, extra?: Partial<AppLog>) {
    let errorCode = error?.code || undefined;
    const errorName = error?.name || undefined;
    const message = error?.message || String(error);
    const stack = error?.stack || undefined;
    if (message.includes('Missing or insufficient permissions') || errorCode === 'permission-denied') {
      errorCode = 'permission-denied'; event = 'PERMISSION_DENIED';
    }
    void this.writeLog({ level: 'ERROR', category, event, message, errorCode, errorName, stack, success: false, ...extra });
  },

  critical(category: LogCategory, event: string, error: any, extra?: Partial<AppLog>) {
    void this.writeLog({ level: 'CRITICAL', category, event, message: error?.message || String(error), errorCode: error?.code, errorName: error?.name, stack: error?.stack, success: false, ...extra });
  },

  audit(event: string, message: string, metadata: Record<string, unknown> = {}) {
    const { operation, targetId, ...rest } = metadata as any;
    void this.writeLog({
      level: 'INFO', category: 'USER', event, message, success: true,
      operation: operation || event.toLowerCase(), documentId: targetId || undefined,
      metadata: sanitizeMetadata(rest)
    });
  }
};
