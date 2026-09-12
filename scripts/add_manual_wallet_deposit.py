from pathlib import Path
p=Path('src/pages/client/WalletAction.tsx')
s=p.read_text()
needle="import{WalletCurrency}from'../../types/wallet';"
if "ManualWalletDeposit" not in s:
    s=s.replace(needle,needle+"\nimport ManualWalletDeposit from'../../components/ManualWalletDeposit';")
old="{action==='top-up'&&<div className=\"mt-6 space-y-4\">"
new="{action==='top-up'&&params.get('manual')==='1'&&<div className=\"mt-6 space-y-4\"><Link to={`?currency=${currency}`} className=\"text-sm font-bold text-blue-800\">← Autres méthodes de recharge</Link><ManualWalletDeposit currency={currency} onSettled={refreshWallet}/></div>}\n      {action==='top-up'&&params.get('manual')!=='1'&&<div className=\"mt-6 space-y-4\">"
if old not in s: raise SystemExit('top-up block not found')
s=s.replace(old,new,1)
old2="<button onClick={()=>startDeposit('bank')} className=\"flex w-full items-center justify-between rounded-2xl border p-4 text-left\"><span><Building2 className=\"mr-3 inline text-violet-700\"/><b>Banque</b><small className=\"ml-9 mt-1 block text-slate-500\">Partenaire bancaire via MHT APIs.</small></span><ChevronRight/></button>"
new2=old2+"<Link to={`?currency=${currency}&manual=1`} className=\"flex w-full items-center justify-between rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4 text-left\"><span><UploadCloud className=\"mr-3 inline text-emerald-700\"/><b>Envoi manuel</b><small className=\"ml-9 mt-1 block text-slate-500\">Envoyez votre preuve. Le contrôle SMS décide automatiquement.</small></span><ChevronRight/></Link>"
if old2 not in s: raise SystemExit('bank button not found')
s=s.replace(old2,new2,1)
s=s.replace("import{ArrowDownLeft,ArrowLeft,Building2,ChevronRight,CreditCard,Eye,EyeOff,History,QrCode,Send,Smartphone,WalletCards}from'lucide-react';","import{ArrowDownLeft,ArrowLeft,Building2,ChevronRight,CreditCard,Eye,EyeOff,History,QrCode,Send,Smartphone,UploadCloud,WalletCards}from'lucide-react';")
p.write_text(s)
# deployment trigger v1
