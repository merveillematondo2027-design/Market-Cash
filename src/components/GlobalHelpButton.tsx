import{Link,useLocation}from'react-router-dom';
import{HelpCircle}from'lucide-react';
import{useAuthStore}from'../store/authStore';

export default function GlobalHelpButton(){
 const{isAuthenticated,user}=useAuthStore();
 const location=useLocation();
 if(!isAuthenticated||!user)return null;
 if(location.pathname==='/help')return null;
 return <Link to="/help" aria-label="Aide Market-Cash" title="Aide & assistance" className="fixed right-20 top-3 z-[80] inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 text-xs font-black text-blue-950 shadow-sm backdrop-blur transition hover:bg-blue-50"><HelpCircle size={18}/><span className="hidden sm:inline">Aide</span></Link>;
}
