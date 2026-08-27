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

// Layouts
import ClientLayout from './components/layout/ClientLayout';
import AdminLayout from './components/layout/AdminLayout';
import AgencyLayout from './components/layout/AgencyLayout';
import DesignerLayout from './components/layout/DesignerLayout';
import DeliveryLayout from './components/layout/DeliveryLayout';

// Auth Pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import PinScreen from './pages/auth/PinScreen';

// Client Pages
import ClientCards from './pages/client/Cards';
import ClientHelp from './pages/client/Help';
import ClientProfile from './pages/client/Profile';

// Admin Pages (Strictly admin_general)
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

// Agency Pages (Strictly chef_agence & admin_general)
import AgencyDashboard from './pages/agency/AgencyDashboard';
import AgencyCards from './pages/agency/AgencyCards';
import AgencyRequests from './pages/agency/AgencyRequests';
import AgencyDeliveries from './pages/agency/AgencyDeliveries';
import AgencyNotifications from './pages/agency/AgencyNotifications';
import AgencyProfile from './pages/agency/AgencyProfile';

// Designer Pages (Strictly designer_graphique & admin_general)
import DesignerCards from './pages/designer/DesignerCards';
import DesignerNotifications from './pages/designer/DesignerNotifications';
import DesignerProfile from './pages/designer/DesignerProfile';

// Delivery Pages (Strictly livreur & admin_general)
import DeliveryDashboard from './pages/delivery/DeliveryDashboard';
import DeliveryHistory from './pages/delivery/DeliveryHistory';
import DeliveryNotifications from './pages/delivery/DeliveryNotifications';
import DeliveryProfile from './pages/delivery/DeliveryProfile';

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

function RoleProtectedRoute({ children, allowedRoles }: RoleProtectedRouteProps) {
  const { isAuthenticated, user, isPinVerified, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 font-sans">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-950 border-t-amber-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-bold text-sm">Chargement de votre session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Clients must verify PIN before accessing client pages
  if (user.role === 'client' && !isPinVerified) {
    return <Navigate to="/pin" replace />;
  }

  // Check if user's role is allowed
  if (!allowedRoles.includes(user.role)) {
    const destination = getHomeRouteByRole(user.role);
    console.warn(`[ROLE_GUARD_REDIRECT] User with role '${user.role}' redirected to '${destination}'`);
    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { setFirebaseUser, setUser, setLoading, loading, user } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('[AUTH_STATE_CHANGED]', firebaseUser ? {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName
      } : null);

      setFirebaseUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          const userDoc = await authService.resolveUser(firebaseUser);
          setUser(userDoc);
          console.log('[AUTH_FLOW_COMPLETE]', { uid: userDoc.uid, role: userDoc.role });
        } catch (error: any) {
          console.error('[USER_PROFILE_ERROR]', error?.code, error?.message);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setFirebaseUser, setUser, setLoading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 font-sans">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-950 border-t-amber-400 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-bold text-sm">Chargement de MARKET-CASH...</p>
        </div>
      </div>
    );
  }

  const defaultHome = user ? getHomeRouteByRole(user.role) : '/login';

  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/" element={<Navigate to={defaultHome} replace />} />
        
        {/* Auth Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/pin" element={<PinScreen />} />

        {/* 1. CLIENT ROUTES (Only client) */}
        <Route
          path="/client"
          element={
            <RoleProtectedRoute allowedRoles={['client']}>
              <ClientLayout />
            </RoleProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/client/cards" replace />} />
          <Route path="cards" element={<ClientCards />} />
          <Route path="help" element={<ClientHelp />} />
          <Route path="profile" element={<ClientProfile />} />
        </Route>

        {/* 2. ADMIN GÉNÉRAL ROUTES (Strictly admin_general) */}
        <Route
          path="/admin"
          element={
            <RoleProtectedRoute allowedRoles={['admin_general']}>
              <AdminLayout />
            </RoleProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="stock" element={<AdminStock />} />
          <Route path="library" element={<CardLibrary />} />
          <Route path="requests" element={<AdminRequests />} />
          <Route path="deliveries" element={<AdminDeliveries />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="help" element={<AdminHelp />} />
          <Route path="notifications" element={<AdminNotifications />} />
          <Route path="profile" element={<AdminProfile />} />
          <Route path="designer" element={<AdminDesigner />} />
        </Route>

        {/* 3. CHEF D'AGENCE ROUTES (Strictly chef_agence & admin_general) */}
        <Route
          path="/agency"
          element={
            <RoleProtectedRoute allowedRoles={['chef_agence', 'admin_general']}>
              <AgencyLayout />
            </RoleProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/agency/dashboard" replace />} />
          <Route path="dashboard" element={<AgencyDashboard />} />
          <Route path="cards" element={<AgencyCards />} />
          <Route path="requests" element={<AgencyRequests />} />
          <Route path="deliveries" element={<AgencyDeliveries />} />
          <Route path="notifications" element={<AgencyNotifications />} />
          <Route path="profile" element={<AgencyProfile />} />
        </Route>

        {/* 4. DESIGNER GRAPHIQUE ROUTES (Strictly designer_graphique & admin_general) */}
        <Route
          path="/designer"
          element={
            <RoleProtectedRoute allowedRoles={['designer_graphique', 'admin_general']}>
              <DesignerLayout />
            </RoleProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/designer/cards" replace />} />
          <Route path="cards" element={<DesignerCards />} />
          <Route path="notifications" element={<DesignerNotifications />} />
          <Route path="profile" element={<DesignerProfile />} />
        </Route>

        {/* 5. LIVREUR ROUTES (Strictly livreur & admin_general) */}
        <Route
          path="/delivery"
          element={
            <RoleProtectedRoute allowedRoles={['livreur', 'admin_general']}>
              <DeliveryLayout />
            </RoleProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/delivery/dashboard" replace />} />
          <Route path="dashboard" element={<DeliveryDashboard />} />
          <Route path="history" element={<DeliveryHistory />} />
          <Route path="notifications" element={<DeliveryNotifications />} />
          <Route path="profile" element={<DeliveryProfile />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
