import { logService } from './logService';
import { auth, db, googleProvider } from '../firebase/config';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  signOut,
  updateProfile,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { User, UserRole } from '../types';
import { removeUndefined } from '../lib/firestoreUtils';

export const ADMIN_EMAIL = 'merveillematondo2027@gmail.com';

/**
 * Traduit les codes d'erreurs Firebase Auth et Firestore en messages clairs et conviviaux en français.
 */
export function formatAuthError(error: any): string {
  if (!error) return "Une erreur inattendue est survenue.";
  
  const code = error.code || '';
  const message = error.message || '';

  console.error('[AUTH_ERROR_DETAILS]', { code, message, error });

  switch (code) {
    case 'auth/email-already-in-use':
      return "Cette adresse email est déjà associée à un compte. Veuillez vous connecter.";
    case 'auth/invalid-email':
      return "L'adresse email saisie n'est pas valide.";
    case 'auth/weak-password':
      return "Le mot de passe doit comporter au moins 6 caractères.";
    case 'auth/user-not-found':
      return "Aucun compte n'a été trouvé avec cette adresse email.";
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return "Identifiants incorrects. Vérifiez votre adresse email et votre mot de passe.";
    case 'auth/popup-closed-by-user':
      return "La fenêtre de connexion Google a été fermée avant la finalisation.";
    case 'auth/popup-blocked':
      return "La fenêtre de connexion a été bloquée par votre navigateur. Veuillez autoriser les pop-ups.";
    case 'auth/account-exists-with-different-credential':
      return "Un compte existe déjà avec le même email mais via un autre moyen de connexion.";
    case 'auth/network-request-failed':
      return "Erreur réseau. Veuillez vérifier votre connexion internet et réessayer.";
    case 'auth/too-many-requests':
      return "Trop de tentatives échouées. Veuillez patienter quelques instants avant de réessayer.";
    case 'auth/user-disabled':
      return "Ce compte a été désactivé par l'administrateur.";
    case 'permission-denied':
      return "Accès refusé. Vous n'avez pas les autorisations nécessaires.";
    default:
      if (message.includes('Missing or insufficient permissions') || message.includes('permission-denied')) {
        return "Erreur de permissions d'accès aux données.";
      }
      return message || "Une erreur est survenue lors de l'authentification.";
  }
}

// In-flight user resolution cache to eliminate duplicate concurrent loading
const resolvingUsers = new Map<string, Promise<User>>();

export const authService = {
  /**
   * Résout ou crée le profil utilisateur Firestore /users/{uid}
   */
  async resolveUser(firebaseUser: FirebaseUser, additionalData: Partial<User> = {}): Promise<User> {
    const uid = firebaseUser.uid;
    const email = (firebaseUser.email || '').trim();

    // If an in-flight resolution is already running for this UID with no extra data, return it
    if (Object.keys(additionalData).length === 0 && resolvingUsers.has(uid)) {
      return resolvingUsers.get(uid)!;
    }

    const resolvePromise = (async () => {
      logService.info('AUTH', 'USER_PROFILE_LOAD_START', 'Début du chargement du profil utilisateur', { userId: uid, userEmail: email });
      console.log('[USER_PROFILE_LOAD_START]', { uid, email });

      const userRef = doc(db, 'users', uid);
      
      try {
        const snapshot = await getDoc(userRef);

        if (!snapshot.exists()) {
          console.log('[USER_PROFILE_NOT_FOUND] Création d\'un nouveau profil client...');
          const role: UserRole = email.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'admin_general' : 'client';
          
          const newUser: User = {
            uid,
            email,
            displayName: additionalData.displayName || firebaseUser.displayName || email.split('@')[0] || 'Utilisateur',
            phone: additionalData.phone || firebaseUser.phoneNumber || '',
            avatar: additionalData.avatar || firebaseUser.photoURL || '',
            role,
            pinHash: additionalData.pinHash || '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ...additionalData,
          };

          await setDoc(userRef, removeUndefined(newUser));
          logService.success('AUTH', 'USER_PROFILE_CREATED', 'Nouveau profil créé', { userId: newUser.uid, userEmail: newUser.email, userRole: newUser.role });
          console.log('[USER_PROFILE_CREATED]', { uid: newUser.uid, email: newUser.email, role: newUser.role });
          return newUser;
        }

        const data = snapshot.data() as User;

        // Si l'administrateur principal se connecte mais que son rôle en base n'est pas admin_general
        if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && data.role !== 'admin_general') {
          console.log('[ROLE_RESOLVED] Attribution forcée du rôle admin_general pour', ADMIN_EMAIL);
          data.role = 'admin_general';
          data.updatedAt = Date.now();
          await setDoc(userRef, { role: 'admin_general', updatedAt: Date.now() }, { merge: true });
        }

        logService.success('AUTH', 'USER_PROFILE_FOUND', 'Profil utilisateur trouvé', { userId: data.uid, userEmail: data.email, userRole: data.role });
        console.log('[USER_PROFILE_FOUND]', { uid: data.uid, email: data.email, role: data.role });
        return data;
      } catch (error: any) {
        logService.error('FIRESTORE', 'USER_PROFILE_CREATE_ERROR', error, { userId: uid, userEmail: email });
        console.error('[PROFILE_CREATE_ERROR]', error.code, error.message);
        throw error;
      } finally {
        resolvingUsers.delete(uid);
      }
    })();

    resolvingUsers.set(uid, resolvePromise);
    return resolvePromise;
  },

  /**
   * Inscription d'un nouvel utilisateur avec email + mot de passe
   */
  async register(email: string, password: string, displayName: string, phone: string) {
    const cleanEmail = email.trim();
    logService.info('AUTH', 'REGISTRATION_START', 'Tentative d\'inscription', { userEmail: cleanEmail });
    console.log('[REGISTRATION_START]', { email: cleanEmail });

    try {
      // 1. Création du compte dans Firebase Authentication
      const result = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const uid = result.user.uid;

      // 2. Mise à jour facultative du displayName dans Firebase Auth
      if (displayName.trim()) {
        try {
          await updateProfile(result.user, { displayName: displayName.trim() });
        } catch (pErr) {
          console.warn('[AUTH_UPDATE_PROFILE_WARN]', pErr);
        }
      }

      // 3. Détermination du rôle initial
      const role: UserRole = cleanEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'admin_general' : 'client';

      // 4. Création immédiate et explicite du document Firestore /users/{uid}
      const userRef = doc(db, 'users', uid);
      const newUser: User = {
        uid,
        email: cleanEmail,
        displayName: displayName.trim() || 'Client',
        phone: phone.trim() || '',
        avatar: '',
        role,
        pinHash: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await setDoc(userRef, removeUndefined(newUser));
      logService.success('AUTH', 'REGISTRATION_SUCCESS', 'Inscription réussie', { userId: uid, userEmail: cleanEmail, userRole: role });
      console.log('[REGISTRATION_SUCCESS]', { uid, email: cleanEmail, role });

      return { firebaseUser: result.user, user: newUser };
    } catch (error: any) {
      logService.error('AUTH', 'REGISTRATION_ERROR', error, { userEmail: cleanEmail });
      console.error('[REGISTRATION_ERROR]', error.code, error.message);
      throw error;
    }
  },

  /**
   * Connexion classique avec Email et Mot de passe
   */
  async login(email: string, password: string) {
    const cleanEmail = email.trim();
    logService.info('AUTH', 'AUTH_LOGIN_START', 'Tentative de connexion', { userEmail: cleanEmail });
    console.log('[AUTH_LOGIN_START]', { email: cleanEmail });

    try {
      const result = await signInWithEmailAndPassword(auth, cleanEmail, password);
      logService.success('AUTH', 'AUTH_LOGIN_SUCCESS', 'Connexion réussie', { userId: result.user.uid, userEmail: result.user.email });
      console.log('[AUTH_LOGIN_SUCCESS]', { uid: result.user.uid, email: result.user.email });
      return { firebaseUser: result.user };
    } catch (error: any) {
      logService.error('AUTH', 'AUTH_ERROR', error, { userEmail: cleanEmail });
      console.error('[AUTH_ERROR]', error.code, error.message);
      throw error;
    }
  },

  /**
   * Connexion Google avec prompt de sélection de compte obligatoire
   */
  async loginWithGoogle() {
    logService.info('AUTH', 'AUTH_GOOGLE_START', 'Tentative de connexion Google');
    console.log('[AUTH_GOOGLE_START]');
    
    try {
      // Forcer l'affichage de l'écran de sélection de compte Google
      googleProvider.setCustomParameters({
        prompt: 'select_account'
      });

      const result = await signInWithPopup(auth, googleProvider);
      logService.success('AUTH', 'AUTH_GOOGLE_SUCCESS', 'Connexion Google réussie', { userId: result.user.uid, userEmail: result.user.email });
      console.log('[AUTH_GOOGLE_SUCCESS]', { 
        uid: result.user.uid, 
        email: result.user.email, 
        displayName: result.user.displayName 
      });

      // Résoudre ou créer le profil utilisateur
      const userDoc = await this.resolveUser(result.user);
      return { firebaseUser: result.user, user: userDoc };
    } catch (error: any) {
      logService.error('AUTH', 'GOOGLE_AUTH_ERROR', error);
      console.error('[GOOGLE_AUTH_ERROR]', error.code, error.message);
      throw error;
    }
  },

  /**
   * Déconnexion complète et nettoyage des sessions
   */
  async logout() {
    try {
      await signOut(auth);
      // Nettoyage de toute trace locale ou session
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('market_cash_user');
          sessionStorage.clear();
        } catch (e) {
          console.warn('[STORAGE_CLEAR_WARN]', e);
        }
      }
      console.log('[AUTH_SIGNOUT_SUCCESS]');
    } catch (error: any) {
      console.error('[AUTH_SIGNOUT_ERROR]', error.code, error.message);
      throw error;
    }
  }
};
