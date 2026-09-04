import {useEffect,useState} from 'react';
import toast from 'react-hot-toast';
import {agentWalletService} from '../services/agentWalletService';

export function useSensitiveReveal(autoHideMs=90000){
  const[revealed,setRevealed]=useState(false);
  const[open,setOpen]=useState(false);
  const[busy,setBusy]=useState(false);

  useEffect(()=>{
    if(!revealed||autoHideMs<=0)return;
    const timer=window.setTimeout(()=>setRevealed(false),autoHideMs);
    return()=>window.clearTimeout(timer);
  },[revealed,autoHideMs]);

  const request=()=>{
    if(revealed){setRevealed(false);return;}
    setOpen(true);
  };

  const confirm=async(pin:string)=>{
    setBusy(true);
    try{
      await agentWalletService.verifyApplicationSecret(pin);
      setRevealed(true);
      setOpen(false);
    }catch(error:any){
      toast.error(error?.message||'Code secret incorrect.');
    }finally{
      setBusy(false);
    }
  };

  const close=()=>{if(!busy)setOpen(false)};
  return{revealed,open,busy,request,confirm,close,hide:()=>setRevealed(false)};
}
