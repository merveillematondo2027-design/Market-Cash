/** @license SPDX-License-Identifier: Apache-2.0 */
import React,{useEffect}from'react';
import{BrowserRouter,Navigate,Route,Routes}from'react-router-dom';
import{onAuthStateChanged}from'firebase/auth';
import{doc,onSnapshot}from'firebase/firestore';
import{auth,db}from'./firebase/config';
import{authService}from'./services/authService';
import{useAuthStore}from'./store/authStore';
import{User,UserRole}from'./types';
import{getHomeRouteByRole}from'./lib/roleNavigation';
import{Toaster}from'react-hot-toast';
import FirestoreNetworkBanner from'./components/FirestoreNetworkBanner';
import AgentGate from'./components/AgentGate';
import KycGate from'./components/KycGate';
import KycPageGate from'./components/KycPageGate';
import Home from'./pages/Home';
import ClientLayout from'./components/layout/ClientLayout';
import AdminLayout from'./components/layout/AdminLayout';
import AgencyLayout from'./components/layout/AgencyLayout';
import DesignerLayout from'./components/layout/DesignerLayout';
import DeliveryLayout from'./components/layout/DeliveryLayout';
import AgentLayout from'./components/layout/AgentLayout';
import BusinessLayout from'./components/layout/BusinessLayout';
import Login from'./pages/auth/Login';
import Register from'./pages/auth/Register';
import PinScreen from'./pages/auth/PinScreen';
import ClientHome from'./pages/client/ClientHome';
import ClientWallet from'./pages/client/Wallet';
import WalletAction from'./pages/client/WalletAction';
import MerchantPay from'./pages/client/MerchantPay';
import AgentWithdrawal from'./pages/client/AgentWithdrawal';
import WalletVisa from'./pages/client/WalletVisa';
import ClientCards from'./pages/client/Cards';
import ClientHelp from'./pages/client/Help';
import ClientProfile from'./pages/client/Profile';
import ClientKyc from'./pages/client/Kyc';
import ComingSoonService from'./pages/client/ComingSoonService';
import BusinessHome from'./pages/business/BusinessHome';
import BusinessCollect from'./pages/business/BusinessCollect';
import BusinessHistory from'./pages/business/BusinessHistory';
import AdminDashboard from'./pages/admin/Dashboard';
import AdminUsers from'./pages/admin/Users';
import AdminAgents from'./pages/admin/AdminAgents';
import AdminAgentDetails from'./pages/admin/AdminAgentDetails';
import AccountRequests from'./pages/admin/AccountRequests';
import AdminStock from'./pages/admin/AdminStock';
import AdminRequests from'./pages/admin/Requests';
import AdminDeliveries from'./pages/admin/AdminDeliveries';
import CardLibrary from'./pages/admin/CardLibrary';
import AdminHelp from'./pages/admin/AdminHelp';
import AdminNotifications from'./pages/admin/Notifications';
import AdminProfile from'./pages/admin/AdminProfile';
import AdminSettings from'./pages/admin/Settings';
import{LogsCenter}from'./pages/admin/LogsCenter';
import AgencyDashboard from'./pages/agency/AgencyDashboard';
import AgencyCards from'./pages/agency/AgencyCards';
import AgencyRequests from'./pages/agency/AgencyRequests';
import AgencyDeliveries from'./pages/agency/AgencyDeliveries';
import AgencyNotifications from'./pages/agency/AgencyNotifications';
import AgencyProfile from'./pages/agency/AgencyProfile';
import AdminDesigner from'./pages/admin/AdminDesigner';
import DesignerCards from'./pages/designer/DesignerCards';
import DesignerNotifications from'./pages/designer/DesignerNotifications';
import DesignerProfile from'./pages/designer/DesignerProfile';
import DeliveryDashboard from'./pages/delivery/DeliveryDashboard';
import DeliveryHistory from'./pages/delivery/DeliveryHistory';
import DeliveryNotifications from'./pages/delivery/DeliveryNotifications';
import DeliveryProfile from'./pages/delivery/DeliveryProfile';
import AgentTerminal from'./pages/agent/AgentTerminal';
import AgentHistory from'./pages/agent/AgentHistory';
import AgentProfile from'./pages/agent/AgentProfile';

function Guard({children,allowedRoles}:{children:React.ReactNode;allowedRoles:UserRole[]}){
  const{isAuthenticated,user,loading}=useAuthStore();
  if(loading)return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-950"/></div>;
  if(!isAuthenticated||!user)return <Navigate to="/login" replace/>;
  if(user.accountStatus==='suspended'||user.accountStatus==='blocked'){
    const blocked=user.accountStatus==='blocked';
    return <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4"><div className="w-full max-w-md rounded-3xl border bg-white p-7 text-center shadow-xl"><div className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${blocked?'bg-red-100 text-red-700':'bg-amber-100 text-amber-800'}`}>!</div><h1 className="mt-5 text-2xl font-black text-slate-950">{blocked?'Compte bloqué':'Compte temporairement suspendu'}</h1><p className="mt-3 text-sm leading-6 text-slate-600">{blocked?'L’administration Market-Cash a bloqué ce compte. Les espaces personnels et professionnels sont désactivés.':'L’accès à ce compte est temporairement suspendu par l’administration Market-Cash.'}</p><p className="mt-2 text-xs text-slate-400">Contactez le support si vous pensez qu’une vérification est nécessaire.</p><button onClick={()=>void authService.logout()} className="mt-6 w-full rounded-2xl bg-blue-950 px-5 py-3 font-black text-white">Se déconnecter</button></div></div>;
  }
  if(!allowedRoles.includes(user.role))return <Navigate to={getHomeRouteByRole(user.role)} replace/>;
  return <>{children}</>;
}

const AdminGeneralOnly=({children}:{children:React.ReactNode})=><Guard allowedRoles={['admin_general']}>{children}</Guard>;

function AdminHome(){
  const{user}=useAuthStore();
  if(user?.role==='agent_administratif')return <Navigate to="/admin/account-requests" replace/>;
  return <AdminDashboard/>;
}

export default function App(){
  const{setFirebaseUser,setUser,setLoading}=useAuthStore();

  useEffect(()=>{
    let stopProfile:(()=>void)|undefined;
    const stopAuth=onAuthStateChanged(auth,async firebaseUser=>{
      stopProfile?.();stopProfile=undefined;
      setFirebaseUser(firebaseUser);
      if(firebaseUser){
        try{
          const resolved=await authService.resolveUser(firebaseUser);
          setUser(resolved);
          console.log('[AUTH_FLOW_COMPLETE]',{uid:resolved.uid,role:resolved.role});
          stopProfile=onSnapshot(doc(db,'users',firebaseUser.uid),snapshot=>{
            if(!snapshot.exists())return;
            const live={...resolved,...snapshot.data(),uid:firebaseUser.uid}as User;
            setUser(live);
            console.log('[AUTH_ROLE_SYNC]',{uid:live.uid,role:live.role,kycStatus:live.kycStatus,accountStatus:live.accountStatus||'active'});
          },error=>console.warn('[AUTH_ROLE_SYNC_ERROR]',error));
        }catch(error:any){
          console.error('[USER_PROFILE_ERROR]',error?.message);
          setUser(null);
        }
      }else setUser(null);
      setLoading(false);
    });
    return()=>{stopProfile?.();stopAuth();};
  },[setFirebaseUser,setUser,setLoading]);

  return <BrowserRouter>
    <FirestoreNetworkBanner/>
    <Toaster position="top-center"/>
    <Routes>
      <Route path="/" element={<Home/>}/>
      <Route path="/login" element={<Login/>}/>
      <Route path="/register" element={<Register/>}/>
      <Route path="/pin" element={<PinScreen/>}/>

      <Route path="/client" element={<Guard allowedRoles={['client']}><ClientLayout/></Guard>}>
        <Route index element={<Navigate to="/client/home" replace/>}/>
        <Route path="home" element={<ClientHome/>}/>
        <Route path="wallet" element={<ClientWallet/>}/>
        <Route path="wallet/send" element={<KycGate><WalletAction action="send"/></KycGate>}/>
        <Route path="wallet/receive" element={<WalletAction action="receive"/>}/>
        <Route path="wallet/pay" element={<KycGate><MerchantPay/></KycGate>}/>
        <Route path="wallet/withdraw" element={<KycGate><AgentWithdrawal/></KycGate>}/>
        <Route path="wallet/top-up" element={<KycGate><WalletAction action="top-up"/></KycGate>}/>
        <Route path="wallet/card-topup" element={<KycGate><WalletAction action="card-topup"/></KycGate>}/>
        <Route path="wallet/exchange" element={<KycGate><WalletAction action="exchange"/></KycGate>}/>
        <Route path="wallet/transactions" element={<WalletAction action="transactions"/>}/>
        <Route path="wallet/visa" element={<KycGate><WalletVisa/></KycGate>}/>
        <Route path="cards" element={<KycGate><ClientCards/></KycGate>}/>
        <Route path="kyc" element={<KycPageGate><ClientKyc/></KycPageGate>}/>
        <Route path="esim" element={<ComingSoonService service="e-SIM"/>}/>
        <Route path="crypto" element={<ComingSoonService service="Crypto"/>}/>
        <Route path="help" element={<ClientHelp/>}/>
        <Route path="profile" element={<ClientProfile/>}/>
      </Route>

      <Route path="/business" element={<Guard allowedRoles={['marchand']}><BusinessLayout/></Guard>}>
        <Route index element={<Navigate to="home" replace/>}/>
        <Route path="home" element={<BusinessHome/>}/>
        <Route path="collect" element={<BusinessCollect/>}/>
        <Route path="history" element={<BusinessHistory/>}/>
        <Route path="profile" element={<ClientProfile/>}/>
      </Route>

      <Route path="/agent" element={<Guard allowedRoles={['agent']}><AgentGate><AgentLayout/></AgentGate></Guard>}>
        <Route index element={<Navigate to="terminal" replace/>}/>
        <Route path="terminal" element={<AgentTerminal/>}/>
        <Route path="history" element={<AgentHistory/>}/>
        <Route path="profile" element={<AgentProfile/>}/>
      </Route>

      <Route path="/admin" element={<Guard allowedRoles={['admin_general','agent_administratif']}><AdminLayout/></Guard>}>
        <Route index element={<Navigate to="dashboard" replace/>}/>
        <Route path="dashboard" element={<AdminHome/>}/>
        <Route path="users" element={<AdminUsers/>}/>
        <Route path="account-requests" element={<AccountRequests/>}/>
        <Route path="notifications" element={<AdminNotifications/>}/>
        <Route path="profile" element={<AdminProfile/>}/>
        <Route path="agents" element={<AdminGeneralOnly><AdminAgents/></AdminGeneralOnly>}/>
        <Route path="agents/:agentUid" element={<AdminGeneralOnly><AdminAgentDetails/></AdminGeneralOnly>}/>
        <Route path="stock" element={<AdminGeneralOnly><AdminStock/></AdminGeneralOnly>}/>
        <Route path="library" element={<AdminGeneralOnly><CardLibrary/></AdminGeneralOnly>}/>
        <Route path="requests" element={<AdminGeneralOnly><AdminRequests/></AdminGeneralOnly>}/>
        <Route path="deliveries" element={<AdminGeneralOnly><AdminDeliveries/></AdminGeneralOnly>}/>
        <Route path="settings" element={<AdminGeneralOnly><AdminSettings/></AdminGeneralOnly>}/>
        <Route path="help" element={<AdminGeneralOnly><AdminHelp/></AdminGeneralOnly>}/>
        <Route path="logs" element={<AdminGeneralOnly><LogsCenter/></AdminGeneralOnly>}/>
      </Route>

      <Route path="/agency" element={<Guard allowedRoles={['chef_agence','admin_general']}><AgencyLayout/></Guard>}>
        <Route index element={<Navigate to="dashboard" replace/>}/>
        <Route path="dashboard" element={<AgencyDashboard/>}/>
        <Route path="cards" element={<AgencyCards/>}/>
        <Route path="requests" element={<AgencyRequests/>}/>
        <Route path="deliveries" element={<AgencyDeliveries/>}/>
        <Route path="notifications" element={<AgencyNotifications/>}/>
        <Route path="profile" element={<AgencyProfile/>}/>
      </Route>

      <Route path="/designer" element={<Guard allowedRoles={['designer_graphique']}><DesignerLayout/></Guard>}>
        <Route path="design" element={<AdminDesigner/>}/>
        <Route path="cards" element={<DesignerCards/>}/>
        <Route path="notifications" element={<DesignerNotifications/>}/>
        <Route path="profile" element={<DesignerProfile/>}/>
      </Route>

      <Route path="/delivery" element={<Guard allowedRoles={['livreur','admin_general']}><DeliveryLayout/></Guard>}>
        <Route index element={<Navigate to="dashboard" replace/>}/>
        <Route path="dashboard" element={<DeliveryDashboard/>}/>
        <Route path="history" element={<DeliveryHistory/>}/>
        <Route path="notifications" element={<DeliveryNotifications/>}/>
        <Route path="profile" element={<DeliveryProfile/>}/>
      </Route>

      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
  </BrowserRouter>;
}
