import React,{useState}from'react';
import{Link,Outlet,useLocation}from'react-router-dom';
import{History,Home,LogOut,QrCode,User}from'lucide-react';
import{cn}from'../../lib/utils';
import LogoutModal from'../LogoutModal';

export default function BusinessLayout(){
  const location=useLocation();
  const[logout,setLogout]=useState(false);
  const nav=[
    {name:'Accueil',path:'/business/home',icon:Home},
    {name:'Encaisser',path:'/business/collect',icon:QrCode},
    {name:'Historique',path:'/business/history',icon:History},
    {name:'Profil',path:'/business/profile',icon:User},
  ];

  return <div className="min-h-screen bg-slate-50 text-slate-800">
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-white px-4">
      <Link to="/business/home" className="font-black text-blue-950">MARKET-<span className="text-amber-500">CASH</span> BUSINESS</Link>
      <button onClick={()=>setLogout(true)} className="rounded-xl p-2 text-red-600" aria-label="Se déconnecter"><LogOut size={20}/></button>
    </header>
    <main className="pb-20"><Outlet/></main>
    <nav className="fixed inset-x-0 bottom-0 z-50 grid h-16 grid-cols-4 border-t bg-white">
      {nav.map(item=>{
        const Icon=item.icon;
        const active=location.pathname.startsWith(item.path);
        return <Link key={item.name} to={item.path} className={cn('flex flex-col items-center justify-center gap-1 text-[10px] font-black',active?'text-blue-950':'text-slate-400')}>
          <Icon size={20}/><span>{item.name}</span>
        </Link>;
      })}
    </nav>
    <LogoutModal isOpen={logout} onClose={()=>setLogout(false)}/>
  </div>;
}
