import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import config from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  projectId: config.projectId,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId,
  appId: config.appId,
};

console.log('[FIREBASE_INIT]', {
  projectId: config.projectId,
  appId: config.appId,
  firestoreDatabaseId: config.firestoreDatabaseId
});

// Singleton Firebase App instance
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with auto-detect long polling to ensure robust WebChannel connectivity in iframes/proxies
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
}, config.firestoreDatabaseId);

console.log('[FIRESTORE_INIT]', {
  databaseId: config.firestoreDatabaseId
});

console.log('[FIRESTORE_NETWORK_STATUS]', {
  status: 'initialized',
  transport: 'auto-detect-long-polling'
});

export const auth = getAuth(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

