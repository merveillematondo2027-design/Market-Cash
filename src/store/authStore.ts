import { create } from 'zustand';
import { User } from '../types';
import { authService } from '../services/authService';

interface AuthState {
  user: User | null;
  firebaseUser: any | null;
  isAuthenticated: boolean;
  isPinVerified: boolean;
  loading: boolean;
  setUser: (user: User | null) => void;
  setFirebaseUser: (user: any | null) => void;
  setPinVerified: (verified: boolean) => void;
  setLoading: (loading: boolean) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  firebaseUser: null,
  isAuthenticated: false,
  isPinVerified: false,
  loading: true,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setFirebaseUser: (firebaseUser) => set({ firebaseUser }),
  setPinVerified: (verified) => set({ isPinVerified: verified }),
  setLoading: (loading) => set({ loading }),
  logout: async () => {
    try {
      await authService.logout();
      console.log('[AUTH_SIGNOUT_SUCCESS]');
      set({ user: null, firebaseUser: null, isAuthenticated: false, isPinVerified: false });
    } catch (error: any) {
      console.log('[AUTH_SIGNOUT_ERROR]', error.code, error.message);
      throw error;
    }
  },
}));
