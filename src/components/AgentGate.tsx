import React,{useEffect,useState}from'react';
import{Navigate}from'react-router-dom';
import{useAuthStore}from'../store/authStore';
import{agentWalletService}from'../services/agentWalletService';

export default function AgentGate({children}:{children:React.ReactNode}){const{isAuthenticated,user,loading}=useAuthStore();const[checking,setChecking]=useState(true);const[allowed,setAllowed]=useState(false);useEffect(()=>{let mounted=true;if(!isAuthenticated||!user){setChecking(false);return;}agentWalletService.ensureWalletProfile().then(r=>{if(mounted)setAllowed(Boolean(r.isAgent));}).catch(()=>{if(mounted)setAllowed(false);}).finally(()=>{if(mounted)setChecking(false);});return()=>{mounted=false}},[isAuthenticated,user?.uid]);if(loading||checking)return <div className="min-h-screen grid place-items-center bg-slate-50"><div className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-blue-950 animate-spin"/></div>;if(!isAuthenticated||!user)return <Navigate to="/login" replace/>;if(!allowed)return <Navigate to="/client/home" replace/>;return <>{children}</>}
