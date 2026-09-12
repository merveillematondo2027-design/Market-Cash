from pathlib import Path

repo = Path('.')

page = r'''import {useEffect,useMemo,useState} from 'react';
import {doc,onSnapshot,setDoc} from 'firebase/firestore';
import {BadgeDollarSign,CheckCircle2,Info,RefreshCcw,Save,ShieldCheck} from 'lucide-react';
import toast from 'react-hot-toast';
import {db} from '../../firebase/config';
import {useAuthStore} from '../../store/authStore';

type FeeKey='merchant_payment'|'market_cash_transfer'|'wallet_to_card'|'agent_cash_in'|'agent_cash_out'|'mobile_money_withdrawal'|'bank_withdrawal';
type FeeRule={percent:number;minUsd:number;minCdf:number;enabled?:boolean;chargedTo?:string};
type FeeConfig=Record<FeeKey,FeeRule>;

const defaults:FeeConfig={
  merchant_payment:{percent:2,minUsd:0.10,minCdf:250,enabled:true,chargedTo:'payer'},
  market_cash_transfer:{percent:1.5,minUsd:0.05,minCdf:150,enabled:true,chargedTo:'sender'},
  wallet_to_card:{percent:0,minUsd:0,minCdf:0,enabled:false,chargedTo:'none'},
  agent_cash_in:{percent:1,minUsd:0.05,minCdf:100,enabled:true,chargedTo:'platform_commission'},
  agent_cash_out:{percent:3.5,minUsd:0.15,minCdf:350,enabled:true,chargedTo:'client'},
  mobile_money_withdrawal:{percent:4,minUsd:0.20,minCdf:500,enabled:true,chargedTo:'client'},
  bank_withdrawal:{percent:3,minUsd:0.20,minCdf:500,enabled:true,chargedTo:'client'},
};

const meta:Record<FeeKey,{title:string;description:string;locked?:boolean}>={
  merchant_payment:{title:'Paiement marchand / API',description:'Frais supportés par le payeur. Le marchand reçoit exactement le montant du paiement.'},
  market_cash_transfer:{title:'Transfert vers un autre utilisateur',description:'Le bénéficiaire reçoit exactement le montant saisi. Les frais sont ajoutés au débit de l’expéditeur.'},
  wallet_to_card:{title:'Wallet → Carte locale',description:'Mouvement interne Market-Cash : aucun frais.',locked:true},
  agent_cash_in:{title:'Dépôt effectué par un agent',description:'Le client reçoit exactement le dépôt. Ce taux sert au calcul de la commission liée au dépôt.'},
  agent_cash_out:{title:'Retrait auprès d’un agent',description:'Le client reçoit le montant demandé et les frais sont ajoutés au débit de sa carte.'},
  mobile_money_withdrawal:{title:'Retrait vers Mobile Money',description:'Frais appliqués au retrait externe vers un opérateur Mobile Money.'},
  bank_withdrawal:{title:'Retrait bancaire',description:'Frais appliqués aux retraits externes vers une banque.'},
};

const keys=Object.keys(defaults) as FeeKey[];
const money=(n:number,digits=2)=>Number.isFinite(n)?n.toFixed(digits):'0.00';

export default function TransactionFees(){
  const {user}=useAuthStore();
  const [config,setConfig]=useState<FeeConfig>(defaults);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [lastUpdate,setLastUpdate]=useState<number|undefined>();
  const isAdmin=user?.role==='admin_general';

  useEffect(()=>{
    const ref=doc(db,'app_settings','transaction_fees');
    return onSnapshot(ref,snap=>{
      const data=(snap.data()||{}) as Partial<FeeConfig>&{updatedAt?:number};
      const next={...defaults} as FeeConfig;
      for(const key of keys){
        const incoming=(data as any)[key]||{};
        next[key]={...defaults[key],...incoming};
      }
      next.wallet_to_card={...defaults.wallet_to_card,percent:0,minUsd:0,minCdf:0,enabled:false};
      setConfig(next);
      setLastUpdate(Number((data as any).updatedAt||0)||undefined);
      setLoading(false);
    },err=>{console.error(err);toast.error('Impossible de charger les frais.');setLoading(false)});
  },[]);

  const estimated=useMemo(()=>{
    const sample=5;
    const out:any={};
    for(const key of keys){
      const rule=config[key];
      out[key]=Math.max(sample*Number(rule.percent||0)/100,Number(rule.minUsd||0));
    }
    return out as Record<FeeKey,number>;
  },[config]);

  const change=(key:FeeKey,field:keyof FeeRule,value:number|boolean)=>{
    if(meta[key].locked)return;
    setConfig(prev=>({...prev,[key]:{...prev[key],[field]:value}}));
  };

  const reset=()=>{
    setConfig(defaults);
    toast.success('Valeurs par défaut restaurées localement. Cliquez sur Enregistrer pour les appliquer.');
  };

  const save=async()=>{
    if(!isAdmin){toast.error('Seul l’Administrateur Général peut modifier les frais.');return}
    for(const key of keys){
      const r=config[key];
      if(!Number.isFinite(Number(r.percent))||Number(r.percent)<0||Number(r.percent)>100){toast.error(`Pourcentage invalide pour ${meta[key].title}.`);return}
      if(Number(r.minUsd)<0||Number(r.minCdf)<0){toast.error(`Minimum invalide pour ${meta[key].title}.`);return}
    }
    const clean={...config,wallet_to_card:{...defaults.wallet_to_card}};
    setSaving(true);
    try{
      await setDoc(doc(db,'app_settings','transaction_fees'),{
        ...clean,
        updatedAt:Date.now(),
        updatedBy:user?.uid||'',
        updatedByEmail:user?.email||'',
      },{merge:true});
      toast.success('Frais et commissions Market-Cash mis à jour.');
    }catch(err:any){console.error(err);toast.error(err?.message||'Échec de l’enregistrement des frais.')}finally{setSaving(false)}
  };

  if(loading)return <div className="flex min-h-[320px] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-950"/></div>;

  return <div className="space-y-6 pb-10">
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-950 text-amber-400"><BadgeDollarSign size={24}/></div>
          <div><h1 className="text-2xl font-black text-slate-950">Frais & commissions</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Fixez les pourcentages appliqués par Market-Cash à chaque catégorie de transaction. Les nouvelles valeurs sont utilisées par le moteur de frais backend.</p></div>
        </div>
        <div className="flex gap-2"><button onClick={reset} disabled={!isAdmin||saving} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-40"><RefreshCcw size={16}/>Valeurs par défaut</button><button onClick={save} disabled={!isAdmin||saving} className="inline-flex items-center gap-2 rounded-2xl bg-blue-950 px-5 py-3 text-sm font-black text-white shadow disabled:opacity-40"><Save size={17}/>{saving?'Enregistrement…':'Enregistrer'}</button></div>
      </div>
      {!isAdmin&&<div className="mt-5 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900"><ShieldCheck size={18}/>Mode lecture seule : réservé à l’Administrateur Général.</div>}
      {lastUpdate&&<p className="mt-4 text-xs font-medium text-slate-400">Dernière mise à jour : {new Date(lastUpdate).toLocaleString('fr-FR')}</p>}
    </section>

    <div className="grid gap-4 lg:grid-cols-2">
      {keys.map(key=>{const rule=config[key],locked=Boolean(meta[key].locked);return <section key={key} className={`rounded-3xl border bg-white p-5 shadow-sm ${locked?'border-emerald-200':'border-slate-200'}`}>
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-slate-950">{meta[key].title}</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">{meta[key].description}</p></div>{locked?<span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">0 % verrouillé</span>:<label className="flex items-center gap-2 text-xs font-bold text-slate-500"><input type="checkbox" checked={rule.enabled!==false} onChange={e=>change(key,'enabled',e.target.checked)} disabled={!isAdmin} className="h-4 w-4"/>Actif</label>}</div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <label className="space-y-1"><span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Pourcentage</span><div className="relative"><input type="number" min="0" max="100" step="0.01" value={rule.percent} onChange={e=>change(key,'percent',Number(e.target.value))} disabled={!isAdmin||locked} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 pr-7 font-black outline-none focus:border-blue-700 disabled:opacity-60"/><span className="absolute right-3 top-3 text-sm font-black text-slate-400">%</span></div></label>
          <label className="space-y-1"><span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Minimum USD</span><input type="number" min="0" step="0.01" value={rule.minUsd} onChange={e=>change(key,'minUsd',Number(e.target.value))} disabled={!isAdmin||locked} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-black outline-none focus:border-blue-700 disabled:opacity-60"/></label>
          <label className="space-y-1"><span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Minimum CDF</span><input type="number" min="0" step="1" value={rule.minCdf} onChange={e=>change(key,'minCdf',Number(e.target.value))} disabled={!isAdmin||locked} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-black outline-none focus:border-blue-700 disabled:opacity-60"/></label>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600"><Info size={15} className="shrink-0 text-blue-700"/><span>Exemple sur 5 USD : frais calculé ≈ <b>{money(estimated[key])} USD</b>{rule.minUsd>5*rule.percent/100?' (minimum appliqué)':''}.</span></div>
      </section>})}
    </div>

    <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5 text-sm text-blue-950"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 shrink-0" size={19}/><div><p className="font-black">Règle comptable</p><p className="mt-1 text-xs leading-relaxed text-blue-900/75">Le montant destiné au bénéficiaire ne change pas : les frais sont comptabilisés séparément. Les mouvements internes Wallet → Carte locale restent gratuits. Pour les dépôts, le client reçoit le montant prévu ; la commission agent est traitée séparément.</p></div></div></section>
  </div>;
}
'''
(repo/'src/pages/admin/TransactionFees.tsx').write_text(page)

app=repo/'src/App.tsx'
s=app.read_text()
old="import AdminDashboard from'./pages/admin/Dashboard';import AdminUsers from'./pages/admin/Users';"
new="import AdminDashboard from'./pages/admin/Dashboard';import TransactionFees from'./pages/admin/TransactionFees';import AdminUsers from'./pages/admin/Users';"
if old not in s: raise SystemExit('APP_IMPORT_NOT_FOUND')
s=s.replace(old,new,1)
old_route='<Route path="payment-control" element={<AdminGeneralOnly><PaymentControl/></AdminGeneralOnly>}/>'
new_route=old_route+'<Route path="transaction-fees" element={<AdminGeneralOnly><TransactionFees/></AdminGeneralOnly>}/>'
if old_route not in s: raise SystemExit('APP_ROUTE_NOT_FOUND')
s=s.replace(old_route,new_route,1)
app.write_text(s)

layout=repo/'src/components/layout/AdminLayout.tsx'
s=layout.read_text()
old="import{Bell,Boxes,Building2,FileClock,HandCoins,LayoutDashboard,Library,Menu,ScrollText,Settings,Shield,ShieldCheck,Truck,User,WalletCards,X}from'lucide-react';"
new="import{BadgeDollarSign,Bell,Boxes,Building2,FileClock,HandCoins,LayoutDashboard,Library,Menu,ScrollText,Settings,Shield,ShieldCheck,Truck,User,WalletCards,X}from'lucide-react';"
if old not in s: raise SystemExit('LAYOUT_IMPORT_NOT_FOUND')
s=s.replace(old,new,1)
old_item="    {name:'Contrôle paiements',path:'/admin/payment-control',icon:Shield,group:'Opérations'},"
new_item=old_item+"\n    {name:'Frais & commissions',path:'/admin/transaction-fees',icon:BadgeDollarSign,group:'Pilotage'},"
if old_item not in s: raise SystemExit('LAYOUT_ITEM_NOT_FOUND')
s=s.replace(old_item,new_item,1)
layout.write_text(s)

print('Admin transaction fee configuration page added.')
