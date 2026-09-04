import React from'react';
import{Navigate}from'react-router-dom';
import{useAuthStore}from'../store/authStore';

export default function AgentGate({children}:{children:React.ReactNode}){
  const{isAuthenticated,user,loading}=useAuthStore();
  if(loading)return <div className="min-h-screen grid place-items-center bg-slate-50"><div className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-blue-950 animate-spin"/></div>;
  if(!isAuthenticated||!user)return <Navigate to="/login" replace/>;
  if(user.role!=='agent')return <Navigate to="/" replace/>;
  if(user.mustChangePin)return <Navigate to="/pin" replace/>;
  return <>{children}</>;
}
