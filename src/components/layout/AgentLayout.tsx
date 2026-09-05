import React,{useState}from'react';
import{Link,Outlet,useLocation}from'react-router-dom';
import{Banknote,History,LogOut,User}from'lucide-react';
import{cn}from'../../lib/utils';
import LogoutModal from'../LogoutModal';

export default function AgentLayout(){const location=useLocation();const[logout,setLogout]=useState(false);const nav=[{name:'Terminal',path:'/agent/terminal',icon:Banknote},{name:'Transactions',path:'/agent/history',icon:History},{name:'Profil',path:'/agent/profile',icon:User}];return <div className="min-h-screen bg-slate-50 text-slate-800"><header className="h-16 px-4 border-b bg-white flex items-center justify-between sticky top-0 z-40"><Link to="/agent/terminal" className="font-black text-blue-950">MARKET-<span className="text-amber-500">CASH</span> AGENT</Link><button onClick={()=>setLogout(true)} className="p-2 rounded-xl text-red-600"><LogOut size={20}/></button></header><main className="pb-20"><Outlet/></main><nav className="fixed bottom-0 inset-x-0 h-16 bg-white border-t grid grid-cols-3 z-50">{nav.map(n=>{const I=n.icon;const active=location.pathname.startsWith(n.path);return <Link key={n.name} to={n.path} className={cn('flex flex-col items-center justify-center gap-1 text-[10px] font-black',active?'text-blue-950':'text-slate-400')}><I size={20}/><span>{n.name}</span></Link>})}</nav><LogoutModal isOpen={logout} onClose={()=>setLogout(false)}/></div>}
