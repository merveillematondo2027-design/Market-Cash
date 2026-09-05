import React,{useState}from'react';
import{Link,Outlet,useLocation}from'react-router-dom';
import{Code2,History,Home,LogOut,QrCode,User}from'lucide-react';
import{cn}from'../../lib/utils';
import{useAuthStore}from'../../store/authStore';
import LogoutModal from'../LogoutModal';

export default function BusinessLayout(){
  const location=useLocation();const{user}=useAuthStore();const[logout,setLogout]=useState(false);
  const role=String(user?.role||'');
  const inferredMode=role==='api_partner'?'api_provider':role==='developer'?'direct_developer':user?.businessAccountType||'merchant';
  const mode=inferredMode;const developer=role==='developer'||role==='api_partner'||mode==='direct_developer'||mode==='api_provider';
  const nav=developer?[{name:mode==='api_provider'||role==='api_partner'?'Partner':'Console',path:'/business/developer',icon:Code2},{name:'Profil',path:'/business/profile',icon:User}]:[
    {name:'Accueil',path:'/business/home',icon:Home},{name:'Encaisser',path:'/business/collect',icon:QrCode},{name:'Transactions',path:'/business/history',icon:History},{name:'Profil',path:'/business/profile',icon:User},
  ];
  const home=developer?'/business/developer':'/business/home';
  return <div className="min-h-screen bg-slate-50 text-slate-800">
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-white px-4"><Link to={home} className="font-black text-blue-950">MARKET-<span className="text-amber-500">CASH</span> {developer?(mode==='api_provider'||role==='api_partner'?'PARTNER':'DEVELOPER'):'BUSINESS'}</Link><button onClick={()=>setLogout(true)} className="rounded-xl p-2 text-red-600" aria-label="Se déconnecter"><LogOut size={20}/></button></header>
    <main className="pb-20"><Outlet/></main>
    <nav className={`fixed inset-x-0 bottom-0 z-50 grid h-16 border-t bg-white ${developer?'grid-cols-2':'grid-cols-4'}`}>{nav.map(item=>{const Icon=item.icon;const active=location.pathname.startsWith(item.path);return <Link key={item.name} to={item.path} className={cn('flex flex-col items-center justify-center gap-1 text-[9px] font-black',active?'text-blue-950':'text-slate-400')}><Icon size={19}/><span>{item.name}</span></Link>})}</nav>
    <LogoutModal isOpen={logout} onClose={()=>setLogout(false)}/>
  </div>;
}
