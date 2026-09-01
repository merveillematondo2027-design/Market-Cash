import { Bitcoin, CreditCard, Home, RadioTower, User } from 'lucide-react';

export const CLIENT_FINTECH_NAVIGATION = [
  { name: 'Accueil', path: '/client/home', icon: Home },
  { name: 'Cartes', path: '/client/cards', icon: CreditCard },
  { name: 'e-SIM', path: '/client/esim', icon: RadioTower },
  { name: 'Crypto', path: '/client/crypto', icon: Bitcoin },
  { name: 'Profil', path: '/client/profile', icon: User },
] as const;
