import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AppLog, LogLevel, LogCategory } from '../types';

export const logService = {
  async writeLog(log: Omit<AppLog, 'timestamp' | 'id'>) {
    try {
      const logData: AppLog = {
        ...log,
        timestamp: Date.now()
      };
      // Removing potentially undefined fields that Firestore doesn't like
      Object.keys(logData).forEach(key => {
        if ((logData as any)[key] === undefined) {
          delete (logData as any)[key];
        }
      });
      await addDoc(collection(db, 'appLogs'), logData);
      
      // Also log to console for visibility (without secrets)
      if (log.level === 'ERROR' || log.level === 'CRITICAL') {
        console.error(`[${log.event}]`, log.message, logData);
      } else if (log.level === 'WARNING') {
        console.warn(`[${log.event}]`, log.message, logData);
      } else {
        console.log(`[${log.event}]`, log.message, logData);
      }
    } catch (e) {
      console.error('[LOG_SERVICE_ERROR] Failed to write log to Firestore:', e);
    }
  },

  info(category: LogCategory, event: string, message: string, extra?: Partial<AppLog>) {
    this.writeLog({ level: 'INFO', category, event, message, ...extra });
  },

  success(category: LogCategory, event: string, message: string, extra?: Partial<AppLog>) {
    this.writeLog({ level: 'SUCCESS', category, event, message, success: true, ...extra });
  },

  warning(category: LogCategory, event: string, message: string, extra?: Partial<AppLog>) {
    this.writeLog({ level: 'WARNING', category, event, message, ...extra });
  },

  error(category: LogCategory, event: string, error: any, extra?: Partial<AppLog>) {
    const isFirebaseError = error?.code || error?.name === 'FirebaseError';
    let errorCode = error?.code || undefined;
    let errorName = error?.name || undefined;
    let message = error?.message || String(error);
    let stack = error?.stack || undefined;
    
    // Auto-detect permissions
    if (message.includes('Missing or insufficient permissions') || errorCode === 'permission-denied') {
      errorCode = 'permission-denied';
      event = 'PERMISSION_DENIED';
    }

    this.writeLog({ 
      level: 'ERROR', 
      category, 
      event, 
      message,
      errorCode,
      errorName,
      stack,
      success: false,
      ...extra 
    });
  },

  critical(category: LogCategory, event: string, error: any, extra?: Partial<AppLog>) {
    const errorCode = error?.code || undefined;
    const errorName = error?.name || undefined;
    const message = error?.message || String(error);
    const stack = error?.stack || undefined;

    this.writeLog({ 
      level: 'CRITICAL', 
      category, 
      event, 
      message,
      errorCode,
      errorName,
      stack,
      success: false,
      ...extra 
    });
  }
};
