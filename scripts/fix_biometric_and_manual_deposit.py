from pathlib import Path


def replace(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Pattern not found in {path}: {old[:120]}')
    p.write_text(text.replace(old, new), encoding='utf-8')

# 1) Force a fresh local user verification request before every WebAuthn authentication.
replace(
    'src/services/deviceSecurityService.ts',
    "  async verify(_uid:string){\n  if(!(await this.platformAvailable()))throw new Error('Biométrie indisponible sur cet appareil.');\n  const begin:any=await beginAuthentication({});const response=await startAuthentication({optionsJSON:begin.data as any});const finish:any=await finishAuthentication({response});if(!finish.data?.verified)throw new Error('Vérification biométrique refusée.');sessionStorage.setItem('marketcash_biometric_verified_at',String(finish.data.verifiedAt||Date.now()));return true;\n },",
    "  async verify(_uid:string){\n  if(!(await this.platformAvailable()))throw new Error('Biométrie indisponible sur cet appareil.');\n  try{await navigator.credentials.preventSilentAccess?.()}catch{}\n  const begin:any=await beginAuthentication({});\n  const response=await startAuthentication({optionsJSON:begin.data as any});\n  const finish:any=await finishAuthentication({response});\n  if(!finish.data?.verified)throw new Error('Vérification biométrique refusée.');\n  sessionStorage.setItem('marketcash_biometric_verified_at',String(finish.data.verifiedAt||Date.now()));\n  return true;\n },"
)

# 2) Add biometric support to every screen using useSensitiveReveal.
p = Path('src/hooks/useSensitiveReveal.ts')
p.write_text("""import {useEffect,useState} from 'react';
import toast from 'react-hot-toast';
import {agentWalletService} from '../services/agentWalletService';
import {deviceSecurityService} from '../services/deviceSecurityService';
import {useAuthStore} from '../store/authStore';

export function useSensitiveReveal(autoHideMs=90000){
  const {user}=useAuthStore();
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

  const biometric=async()=>{
    if(!user?.uid)throw new Error('Connexion requise.');
    setBusy(true);
    try{
      await deviceSecurityService.verify(user.uid);
      setRevealed(true);
      setOpen(false);
    }catch(error:any){
      toast.error(error?.message||'Vérification biométrique refusée.');
      throw error;
    }finally{
      setBusy(false);
    }
  };

  const close=()=>{if(!busy)setOpen(false)};
  return{revealed,open,busy,request,confirm,biometric,close,hide:()=>setRevealed(false)};
}
""", encoding='utf-8')

# 3) WalletAction: expose biometrics in its shared security modal.
replace(
    'src/pages/client/WalletAction.tsx',
    'onClose={secure.close} onConfirm={secure.confirm} title="Accès protégé"',
    'onClose={secure.close} onConfirm={secure.confirm} onBiometric={secure.biometric} title="Accès protégé"'
)

# Keep manual deposit immediately visible below Mobile Money, before Bank.
wa = Path('src/pages/client/WalletAction.tsx')
text = wa.read_text(encoding='utf-8')
mobile = '<button onClick={()=>startDeposit(\'mobile_money\')} className="flex w-full items-center justify-between rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 text-left"><span><Smartphone className="mr-3 inline text-blue-700"/><b>Mobile Money</b><small className="ml-9 mt-1 block text-slate-500">M-Pesa, Airtel Money, Orange Money, Afrimoney.</small></span><ChevronRight/></button>'
bank = '<button onClick={()=>startDeposit(\'bank\')} className="flex w-full items-center justify-between rounded-2xl border p-4 text-left"><span><Building2 className="mr-3 inline text-violet-700"/><b>Banque</b><small className="ml-9 mt-1 block text-slate-500">Partenaire bancaire via MHT APIs.</small></span><ChevronRight/></button>'
manual = '<Link to={`?currency=${currency}&manual=1`} className="flex w-full items-center justify-between rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4 text-left"><span><UploadCloud className="mr-3 inline text-emerald-700"/><b>Envoi manuel</b><small className="ml-9 mt-1 block text-slate-500">Envoyez votre preuve. Le contrôle SMS décide automatiquement.</small></span><ChevronRight/></Link>'
old_order = mobile + bank + manual
new_order = mobile + manual + bank
if old_order in text:
    text = text.replace(old_order, new_order)
elif new_order not in text:
    raise SystemExit('Deposit source buttons pattern not found')
wa.write_text(text, encoding='utf-8')

# 4) ClientHome: balance modal gets the same biometric path.
replace(
    'src/pages/client/ClientHome.tsx',
    "import{localCardPairService}from'../../services/localCardPairService';",
    "import{localCardPairService}from'../../services/localCardPairService';\nimport{deviceSecurityService}from'../../services/deviceSecurityService';"
)
replace(
    'src/pages/client/ClientHome.tsx',
    "  const confirmReveal=async(pin:string)=>{setSecurityBusy(true);try{await agentWalletService.verifyApplicationSecret(pin);setRevealed(true);setSecurityOpen(false)}catch(error:any){toast.error(error?.message||'PIN incorrect.')}finally{setSecurityBusy(false)}};",
    "  const confirmReveal=async(pin:string)=>{setSecurityBusy(true);try{await agentWalletService.verifyApplicationSecret(pin);setRevealed(true);setSecurityOpen(false)}catch(error:any){toast.error(error?.message||'PIN incorrect.')}finally{setSecurityBusy(false)}};\n  const confirmBiometric=async()=>{if(!user?.uid)return;setSecurityBusy(true);try{await deviceSecurityService.verify(user.uid);setRevealed(true);setSecurityOpen(false)}catch(error:any){toast.error(error?.message||'Vérification biométrique refusée.')}finally{setSecurityBusy(false)}};"
)
replace(
    'src/pages/client/ClientHome.tsx',
    'onConfirm={confirmReveal} title="Afficher mon solde"',
    'onConfirm={confirmReveal} onBiometric={confirmBiometric} title="Afficher mon solde"'
)

# 5) Settings: viewing the current local CVV can use biometrics too.
replace(
    'src/pages/client/Settings.tsx',
    "import{deviceSecurityService}from'../../services/deviceSecurityService';import SecurityConfirmModal",
    "import{deviceSecurityService}from'../../services/deviceSecurityService';import{localCardPairService}from'../../services/localCardPairService';import SecurityConfirmModal"
)
replace(
    'src/pages/client/Settings.tsx',
    "const testBio=async()=>{try{await deviceSecurityService.verify(user.uid);toast.success('Identité biométrique confirmée par Market-Cash.')}catch(error:any){toast.error(error?.message||'Vérification impossible.')}};const changeCurrency=",
    "const testBio=async()=>{try{await deviceSecurityService.verify(user.uid);toast.success('Identité biométrique confirmée par Market-Cash.')}catch(error:any){toast.error(error?.message||'Vérification impossible.')}};const revealCvvBiometric=async()=>{setBusy(true);try{await deviceSecurityService.verify(user.uid);const cards=await localCardPairService.list();const card=cards[0];if(!card)throw new Error('Carte locale introuvable.');const result=await localCardPairService.revealWithBiometric(card.cardId);setCurrentCvv(result.cvv);setCvvAction(null);toast.success('CVV affiché.')}catch(error:any){toast.error(error?.message||'Vérification biométrique refusée.')}finally{setBusy(false)}};const changeCurrency="
)
replace(
    'src/pages/client/Settings.tsx',
    'onConfirm={cvvAction===\'reveal\'?revealCvv:rotateCvv} title={cvvAction===\'reveal\'?\'Voir le CVV actuel\':\'Régénérer le CVV\'}',
    'onConfirm={cvvAction===\'reveal\'?revealCvv:rotateCvv} onBiometric={cvvAction===\'reveal\'?revealCvvBiometric:undefined} title={cvvAction===\'reveal\'?\'Voir le CVV actuel\':\'Régénérer le CVV\'}'
)

# 6) Make the modal wording explicit: OS decides whether fingerprint, face, or secure device lock is used.
replace(
    'src/components/SecurityConfirmModal.tsx',
    "{bioBusy?'Vérification…':'Empreinte / Face ID'}",
    "{bioBusy?'Vérification…':'Biométrie / sécurité appareil'}"
)

print('biometric + manual deposit fixes applied')
