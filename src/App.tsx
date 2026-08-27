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
import ClientLayout from './components/layout/ClientLayout';
import AdminLayout from './components/layout/AdminLayout';
import AgencyLayout from './components/layout/AgencyLayout';
import DesignerLayout from './components/layout/DesignerLayout';
import DeliveryLayout from './components/layout/DeliveryLayout';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import PinScreen from './pages/auth/PinScreen';
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

interface RoleProtectedRouteProps { children: React.ReactNode; allowedRoles: UserRole[]; }
function RoleProtectedRoute({ children, allowedRoles }: RoleProtectedRouteProps) {
  const { isAuthenticated, user, isPinVerified, loading } = useAuthStore();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="text-center"><div className="w-12 h-12 border-4 border-blue-950 border-t-amber-400 rounded-full animate-spin mx-auto mb-4"/><p className="font-bold text-sm">Chargement de votre session...</p></div></div>;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (user.role === 'client' && !isPinVerified) return <Navigate to="/pin" replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to={getHomeRouteByRole(user.role)} replace />;
  return <>{children}</>;
}

export default function App() {
  const { setFirebaseUser, setUser, setLoading, loading, user } = useAuthStore();
  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    setFirebaseUser(firebaseUser);
    if (firebaseUser) {
      try { setUser(await authService.resolveUser(firebaseUser)); }
      catch (error: any) { console.error('[USER_PROFILE_ERROR]', error?.code, error?.message); setUser(null); }
    } else setUser(null);
    setLoading(false);
  }), [setFirebaseUser, setUser, setLoading]);
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 font-bold">Chargement de MARKET-CASH...</div>;
  const defaultHome = user ? getHomeRouteByRole(user.role) : '/login';
  return <BrowserRouter><Toaster position="top-center"/><Routes>
    <Route path="/" element={<Navigate to={defaultHome} replace/>}/><Route path="/login" element={<Login/>}/><Route path="/register" element={<Register/>}/><Route path="/pin" element={<PinScreen/>}/>
    <Route path="/client" element={<RoleProtectedRoute allowedRoles={['client']}><ClientLayout/></RoleProtectedRoute>}><Route index element={<Navigate to="/client/cards" replace/>}/><Route path="cards" element={<ClientCards/>}/><Route path="help" element={<ClientHelp/>}/><Route path="profile" element={<ClientProfile/>}/></Route>
    <Route path="/admin" element={<RoleProtectedRoute allowedRoles={['admin_general']}><AdminLayout/></RoleProtectedRoute>}><Route index element={<Navigate to="/admin/dashboard" replace/>}/><Route path="dashboard" element={<AdminDashboard/>}/><Route path="users" element={<AdminUsers/>}/><Route path="stock" element={<AdminStock/>}/><Route path="library" element={<CardLibrary/>}/><Route path="requests" element={<AdminRequests/>}/><Route path="deliveries" element={<AdminDeliveries/>}/><Route path="settings" element={<AdminSettings/>}/><Route path="help" element={<AdminHelp/>}/><Route path="notifications" element={<AdminNotifications/>}/><Route path="profile" element={<AdminProfile/>}/><Route path="designer" element={<AdminDesigner/>}/></Route>
    <Route path="/agency" element={<RoleProtectedRoute allowedRoles={['chef_agence','admin_general']}><AgencyLayout/></RoleProtectedRoute>}><Route index element={<Navigate to="/agency/dashboard" replace/>}/><Route path="dashboard" element={<AgencyDashboard/>}/><Route path="users" element={<AdminUsers/>}/><Route path="cards" element={<AgencyCards/>}/><Route path="requests" element={<AgencyRequests/>}/><Route path="deliveries" element={<AgencyDeliveries/>}/><Route path="notifications" element={<AgencyNotifications/>}/><Route path="profile" element={<AgencyProfile/>}/></Route>
    <Route path="/designer" element={<RoleProtectedRoute allowedRoles={['designer_graphique','admin_general']}><DesignerLayout/></RoleProtectedRoute>}><Route index element={<Navigate to="/designer/cards" replace/>}/><Route path="cards" element={<DesignerCards/>}/><Route path="notifications" element={<DesignerNotifications/>}/><Route path="profile" element={<DesignerProfile/>}/></Route>
    <Route path="/delivery" element={<RoleProtectedRoute allowedRoles={['livreur','admin_general']}><DeliveryLayout/></RoleProtectedRoute>}><Route index element={<Navigate to="/delivery/dashboard" replace/>}/><Route path="dashboard" element={<DeliveryDashboard/>}/><Route path="history" element={<DeliveryHistory/>}/><Route path="notifications" element={<DeliveryNotifications/>}/><Route path="profile" element={<DeliveryProfile/>}/></Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></BrowserRouter>;
}
