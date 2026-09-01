/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase/config';
import { authService } from './services/authService';
import { useAuthStore } from './store/authStore';
import { UserRole } from './types';
import { getHomeRouteByRole } from './lib/roleNavigation';
import { Toaster } from 'react-hot-toast';
import FirestoreNetworkBanner from './components/FirestoreNetworkBanner';
import Home from './pages/Home';
import ClientLayout from './components/layout/ClientLayout';
import AdminLayout from './components/layout/AdminLayout';
import AgencyLayout from './components/layout/AgencyLayout';
import DesignerLayout from './components/layout/DesignerLayout';
import DeliveryLayout from './components/layout/DeliveryLayout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import PinScreen from './pages/auth/PinScreen';
import ClientHome from './pages/client/ClientHome';
import ClientWallet from './pages/client/Wallet';
import WalletAction from './pages/client/WalletAction';
import ComingSoonService from './pages/client/ComingSoonService';
import ClientCards from './pages/client/Cards';
import ClientHelp from './pages/client/Help';
import ClientProfile from './pages/client/Profile';
import AdminDashboard from './pages/admin/Dashboard';
import AdminUsers from './pages/admin/Users';
import AdminStock from './pages/admin/AdminStock';
import AdminRequests from './pages/admin/Requests';
import AdminDeliveries from './pages/admin/AdminDeliveries';
import CardLibrary from './pages/admin/CardLibrary';
import AdminHelp from './pages/admin/AdminHelp';
import AdminNotifications from './pages/admin/Notifications';
import AdminProfile from './pages/admin/AdminProfile';
import AdminDesigner from './pages/admin/AdminDesigner';
import AdminSettings from './pages/admin/Settings';
import { LogsCenter } from './pages/admin/LogsCenter';
import AgencyDashboard from './pages/agency/AgencyDashboard';
import AgencyCards from './pages/agency/AgencyCards';
import AgencyRequests from './pages/agency/AgencyRequests';
import AgencyDeliveries from './pages/agency/AgencyDeliveries';
import AgencyNotifications from './pages/agency/AgencyNotifications';
import AgencyProfile from './pages/agency/AgencyProfile';
import DesignerCards from './pages/designer/DesignerCards';
import DesignerNotifications from './pages/designer/DesignerNotifications';
import DesignerProfile from './pages/designer/DesignerProfile';
import DeliveryDashboard from './pages/delivery/DeliveryDashboard';
import DeliveryHistory from './pages/delivery/DeliveryHistory';
import DeliveryNotifications from './pages/delivery/DeliveryNotifications';
import DeliveryProfile from './pages/delivery/DeliveryProfile';

function RoleProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: UserRole[] }) {
  const { isAuthenticated, user, isPinVerified, loading } = useAuthStore();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="text-center"><div className="w-12 h-12 border-4 border-blue-950 border-t-amber-400 rounded-full animate-spin mx-auto mb-4"/><p className="text-slate-600 font-bold text-sm">Chargement de votre session...</p></div></div>;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (user.role === 'client' && !isPinVerified) return <Navigate to="/pin" replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to={getHomeRouteByRole(user.role)} replace />;
  return <>{children}</>;
}

export default function App() {
  const { setFirebaseUser, setUser, setLoading } = useAuthStore();
  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    console.log('[AUTH_STATE_CHANGED]', firebaseUser ? { uid: firebaseUser.uid, email: firebaseUser.email, displayName: firebaseUser.displayName } : null);
    setFirebaseUser(firebaseUser);
    if (firebaseUser) { try { const userDoc = await authService.resolveUser(firebaseUser); setUser(userDoc); console.log('[AUTH_FLOW_COMPLETE]', { uid: userDoc.uid, role: userDoc.role }); } catch (error: any) { console.error('[USER_PROFILE_ERROR]', error?.code, error?.message); setUser(null); } } else setUser(null);
    setLoading(false);
  }), [setFirebaseUser, setUser, setLoading]);

  return <BrowserRouter><FirestoreNetworkBanner/><Toaster position="top-center"/><Routes>
    <Route path="/" element={<Home/>}/><Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/><Route path="/pin" element={<PinScreen/>}/>
    <Route path="/client" element={<RoleProtectedRoute allowedRoles={['client']}><ClientLayout/></RoleProtectedRoute>}>
      <Route index element={<Navigate to="/client/home" replace/>}/><Route path="home" element={<ClientHome/>}/><Route path="wallet" element={<ClientWallet/>}/><Route path="wallet/send" element={<WalletAction action="send"/>}/><Route path="wallet/receive" element={<WalletAction action="receive"/>}/><Route path="wallet/transactions" element={<WalletAction action="transactions"/>}/><Route path="wallet/top-up" element={<WalletAction action="top-up"/>}/><Route path="cards" element={<ClientCards/>}/><Route path="esim" element={<ComingSoonService service="e-SIM"/>}/><Route path="crypto" element={<ComingSoonService service="Crypto"/>}/><Route path="help" element={<ClientHelp/>}/><Route path="profile" element={<ClientProfile/>}/>
    </Route>
    <Route path="/admin" element={<RoleProtectedRoute allowedRoles={['admin_general']}><AdminLayout/></RoleProtectedRoute>}><Route index element={<Navigate to="/admin/dashboard" replace/>}/><Route path="dashboard" element={<AdminDashboard/>}/><Route path="users" element={<AdminUsers/>}/><Route path="stock" element={<AdminStock/>}/><Route path="library" element={<CardLibrary/>}/><Route path="requests" element={<AdminRequests/>}/><Route path="deliveries" element={<AdminDeliveries/>}/><Route path="settings" element={<AdminSettings/>}/><Route path="help" element={<AdminHelp/>}/><Route path="notifications" element={<AdminNotifications/>}/><Route path="profile" element={<AdminProfile/>}/><Route path="logs" element={<LogsCenter/>}/></Route>
    <Route path="/agency" element={<RoleProtectedRoute allowedRoles={['chef_agence','admin_general']}><AgencyLayout/></RoleProtectedRoute>}><Route index element={<Navigate to="/agency/dashboard" replace/>}/><Route path="dashboard" element={<AgencyDashboard/>}/><Route path="cards" element={<AgencyCards/>}/><Route path="requests" element={<AgencyRequests/>}/><Route path="deliveries" element={<AgencyDeliveries/>}/><Route path="notifications" element={<AgencyNotifications/>}/><Route path="profile" element={<AgencyProfile/>}/></Route>
    <Route path="/designer" element={<RoleProtectedRoute allowedRoles={['designer_graphique']}><DesignerLayout/></RoleProtectedRoute>}><Route index element={<Navigate to="/designer/design" replace/>}/><Route path="design" element={<AdminDesigner/>}/><Route path="cards" element={<DesignerCards/>}/><Route path="notifications" element={<DesignerNotifications/>}/><Route path="profile" element={<DesignerProfile/>}/></Route>
    <Route path="/delivery" element={<RoleProtectedRoute allowedRoles={['livreur','admin_general']}><DeliveryLayout/></RoleProtectedRoute>}><Route index element={<Navigate to="/delivery/dashboard" replace/>}/><Route path="dashboard" element={<DeliveryDashboard/>}/><Route path="history" element={<DeliveryHistory/>}/><Route path="notifications" element={<DeliveryNotifications/>}/><Route path="profile" element={<DeliveryProfile/>}/></Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></BrowserRouter>;
}
