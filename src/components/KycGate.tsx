import React,{useEffect,useState}from'react';
import{doc,getDoc}from'firebase/firestore';
import{Link}from'react-router-dom';
import{ShieldCheck}from'lucide-react';
import{db}from'../firebase/config';
import{agentWalletService}from'../services/agentWalletService';
import{useAuthStore}from'../store/authStore';

export default function KycGate({children}:{children:React.ReactNode}){
  const{user}=useAuthStore();
  const[status,setStatus]=useState<'loading'|'approved'|'required'>('loading');
  useEffect(()=>{let active=true;(async()=>{if(!user?.uid){if(active)setStatus('required');return}const snap=await getDoc(doc(db,'kyc_requests',user.uid));const approved=snap.exists()&&snap.data()?.status==='approved';if(active)setStatus(approved?'approved':'required');if(approved){void agentWalletService.ensureLocalCard().catch(error=>console.warn('[KYC_LOCAL_CARD_AUTO_ISSUE_ERROR]',error));}})().catch(()=>active&&setStatus('required'));return()=>{active=false}},[user?.uid]);
  if(status==='loading')return <div className="min-h-[50vh] grid place-items-center"><div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-950"/></div>;
  if(status==='approved')return <>{children}</>;
  return <div className="mx-auto max-w-xl p-4 md:p-8 pb-28"><div className="mt-12 rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-amber-700"><ShieldCheck size={28}/></div><h1 className="mt-4 text-xl font-black text-slate-950">Complétez votre identité</h1><p className="mt-2 text-sm leading-6 text-slate-600">Ce service nécessite un compte Market-Cash vérifié. Complétez votre KYC une seule fois pour débloquer les opérations sensibles.</p><Link to="/client/kyc" className="mt-5 inline-flex rounded-2xl bg-blue-950 px-5 py-3 font-black text-white">Compléter mon identité</Link></div></div>;
}
