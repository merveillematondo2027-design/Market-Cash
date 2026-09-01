import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Bitcoin, CreditCard, HelpCircle, Home, Menu, RadioTower, User, WalletCards, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuthStore } from '../../store/authStore';
import { Notification } from '../../types';
import { cn, playNotificationSound } from '../../lib/utils';
import LogoutModal from '../LogoutModal';
import toast from 'react-hot-toast';

export default function ClientLayout() {
  const location = useLocation(); const navigate = useNavigate(); const { user } = useAuthStore();
  const [notifications,setNotifications]=useState<Notification[]>([]); const [showNotif,setShowNotif]=useState(false); const [showMenu,setShowMenu]=useState(false); const [showLogoutModal,setShowLogoutModal]=useState(false);
  useEffect(()=>{ if(!user) return; let initial=true; const q=query(collection(db,'notifications'),where('userId','==',user.uid)); return onSnapshot(q,s=>{const items=s.docs.map(d=>({...d.data(),id:d.id} as Notification)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)); if(!initial&&s.docChanges().some(c=>c.type==='added')) playNotificationSound(); initial=false; setNotifications(items);},e=>console.error('[CLIENT_NOTIFICATIONS_ERROR]',e)); },[user?.uid]);
  const unread=notifications.filter(n=>!n.read).length;
  const markRead=async(id:string)=>updateDoc(doc(db,'notifications',id),{read:true});
  const markAll=async()=>{const batch=writeBatch(db);notifications.filter(n=>!n.read).forEach(n=>batch.update(doc(db,'notifications',n.id),{read:true}));await batch.commit();toast.success('Notifications lues');};
  const remove=async(id:string)=>deleteDoc(doc(db,'notifications',id));
  const nav=[
    {name:'Accueil',path:'/client/home',icon:Home},
    {name:'Cartes',path:'/client/cards',icon:CreditCard},
    {name:'e-SIM',path:'/client/esim',icon:RadioTower},
    {name:'Crypto',path:'/client/crypto',icon:Bitcoin},
    {name:'Profil',path:'/client/profile',icon:User},
  ];
  const isActive=(path:string)=>location.pathname===path || (path==='/client/home'&&location.pathname.startsWith('/client/wallet'));
  const Notifications=()=> <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden w-full max-w-md">
    <div className="p-4 flex items-center justify-between border-b"><div><h3 className="font-black text-blue-950">Notifications</h3><p className="text-xs text-slate-400">{unread} non lue{unread>1?'s':''}</p></div><div className="flex gap-2">{unread>0&&<button onClick={markAll} className="text-xs font-bold text-blue-600">Tout lire</button>}<button onClick={()=>setShowNotif(false)}><X size={18}/></button></div></div>
    <div className="max-h-[60vh] overflow-y-auto">{notifications.length===0?<div className="p-10 text-center text-slate-400">Aucune notification</div>:notifications.map(n=><div key={n.id} className={cn('p-4 border-b last:border-0',!n.read&&'bg-blue-50/50')} onClick={()=>!n.read&&markRead(n.id)}><div className="flex justify-between gap-3"><div><p className="font-black text-sm text-slate-900">{n.title}</p><p className="text-xs text-slate-500 mt-1">{n.message}</p></div><button onClick={e=>{e.stopPropagation();remove(n.id)}} className="text-slate-300 hover:text-red-500"><X size={15}/></button></div></div>)}</div>
  </div>;
  return <div className="min-h-screen bg-slate-50 text-slate-800">
    <header className="fixed top-0 inset-x-0 h-16 bg-white/95 backdrop-blur border-b z-50 flex items-center justify-between px-4 md:px-8"><Link to="/client/home" className="font-black text-blue-950 tracking-tight">MARKET-<span className="text-amber-500">CASH</span></Link><div className="flex items-center gap-2"><button onClick={()=>setShowNotif(true)} className="relative p-2.5 rounded-xl hover:bg-slate-100"><Bell size={20}/>{unread>0&&<span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">{unread>9?'9+':unread}</span>}</button><button onClick={()=>setShowMenu(true)} className="p-2.5 rounded-xl hover:bg-slate-100"><Menu size={21}/></button></div></header>
    <main className="pt-16 pb-20 min-h-screen"><Outlet/></main>
    <nav className="fixed bottom-0 inset-x-0 h-16 bg-white border-t z-50 grid grid-cols-5 md:max-w-2xl md:left-1/2 md:-translate-x-1/2 md:rounded-t-2xl md:border-x">{nav.map(item=>{const I=item.icon;const active=isActive(item.path);return <Link key={item.name} to={item.path} className={cn('flex flex-col items-center justify-center gap-1 text-[10px] font-bold',active?'text-blue-700':'text-slate-400')}><I size={20} strokeWidth={active?2.7:2}/><span>{item.name}</span></Link>})}</nav>
    {showNotif&&<div className="fixed inset-0 z-[100] bg-slate-950/50 p-4 flex items-start justify-center pt-20" onClick={()=>setShowNotif(false)}><div onClick={e=>e.stopPropagation()} className="w-full max-w-md"><Notifications/></div></div>}
    {showMenu&&<div className="fixed inset-0 z-[110] bg-slate-950/50 flex justify-end" onClick={()=>setShowMenu(false)}><aside onClick={e=>e.stopPropagation()} className="w-[86%] max-w-sm h-full bg-white p-6 shadow-2xl"><div className="flex justify-between items-center"><h2 className="text-xl font-black text-blue-950">Menu</h2><button onClick={()=>setShowMenu(false)}><X/></button></div><div className="mt-6 space-y-2"><Link onClick={()=>setShowMenu(false)} to="/client/wallet" className="flex gap-3 p-4 rounded-2xl bg-blue-950 text-white font-black"><WalletCards/>Mon Wallet</Link><Link onClick={()=>setShowMenu(false)} to="/client/help" className="flex gap-3 p-4 rounded-2xl bg-slate-50 font-bold"><HelpCircle/>Aide & assistance</Link><button onClick={()=>{setShowMenu(false);setShowLogoutModal(true)}} className="w-full text-left p-4 rounded-2xl text-red-600 font-bold">Se déconnecter</button></div></aside></div>}
    <LogoutModal isOpen={showLogoutModal} onClose={()=>setShowLogoutModal(false)}/>
  </div>;
}
