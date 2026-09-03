import React,{useEffect,useRef}from'react';
import{doc,onSnapshot}from'firebase/firestore';
import{useNavigate}from'react-router-dom';
import toast from'react-hot-toast';
import{db}from'../firebase/config';
import{useAuthStore}from'../store/authStore';

export default function KycPageGate({children}:{children:React.ReactNode}){
  const{user,setUser}=useAuthStore();
  const navigate=useNavigate();
  const redirected=useRef(false);

  useEffect(()=>{
    if(!user?.uid)return;
    return onSnapshot(doc(db,'kyc_requests',user.uid),snapshot=>{
      if(!snapshot.exists())return;
      const status=String(snapshot.data().status||'pending');
      if(status==='approved'&&!redirected.current){
        redirected.current=true;
        if(user.kycStatus!=='approved')setUser({...user,kycStatus:'approved',updatedAt:Date.now()});
        toast.success('Identité confirmée. Votre dossier KYC est fermé.');
        navigate('/client/profile',{replace:true});
      }
    },error=>console.error('[KYC_PAGE_GATE_ERROR]',error));
  },[navigate,setUser,user]);

  return <>{children}</>;
}
