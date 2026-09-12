import{FormEvent,useState}from'react';
import{ArrowLeft,Bot,MessageCircle,Send,Sparkles}from'lucide-react';
import{Link}from'react-router-dom';
import{openWhatsAppSupport}from'../../lib/whatsappSupport';

type ChatMessage={id:number;role:'assistant'|'user';text:string};

export default function AssistantChat(){
 const[input,setInput]=useState('');
 const[messages,setMessages]=useState<ChatMessage[]>([{id:1,role:'assistant',text:"Bonjour 👋 Je suis l’assistant Market-Cash. Cet espace est prêt pour l’intégration de notre API IA. En attendant son activation, vous pouvez préparer votre question ou contacter notre équipe sur WhatsApp."}]);
 const send=(event:FormEvent)=>{event.preventDefault();const text=input.trim();if(!text)return;setMessages(current=>[...current,{id:Date.now(),role:'user',text},{id:Date.now()+1,role:'assistant',text:"Votre message a bien été reçu dans l’espace Assistant. L’API IA Market-Cash sera connectée ici prochainement. Pour une assistance immédiate, utilisez « Discuter sur WhatsApp »."}]);setInput('')};
 return <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col bg-slate-50 pb-24">
  <header className="sticky top-0 z-30 border-b bg-white/95 px-4 py-3 backdrop-blur"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Link to="/help" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700" aria-label="Retour"><ArrowLeft size={19}/></Link><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-950 text-white"><Bot size={23}/></div><div className="min-w-0"><h1 className="truncate text-base font-black text-slate-950">Assistant Market-Cash</h1><p className="flex items-center gap-1 text-[10px] font-bold text-emerald-700"><Sparkles size={11}/> Espace IA Market-Cash</p></div></div><button onClick={()=>openWhatsAppSupport('ASSISTANT_CHAT')} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-[11px] font-black text-white shadow-sm"><MessageCircle size={16}/><span className="hidden sm:inline">Discuter sur WhatsApp</span><span className="sm:hidden">WhatsApp</span></button></div></header>
  <main className="flex-1 space-y-3 overflow-y-auto p-4">{messages.map(message=><div key={message.id} className={`flex ${message.role==='user'?'justify-end':'justify-start'}`}><div className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${message.role==='user'?'rounded-br-md bg-blue-950 text-white':'rounded-bl-md border bg-white text-slate-700'}`}>{message.text}</div></div>)}</main>
  <form onSubmit={send} className="sticky bottom-0 border-t bg-white p-3"><div className="flex items-end gap-2 rounded-2xl border bg-slate-50 p-2 focus-within:border-blue-400"><textarea value={input} onChange={e=>setInput(e.target.value)} rows={1} placeholder="Écrire à l’assistant Market-Cash…" className="max-h-28 min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-sm outline-none"/><button type="submit" disabled={!input.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-950 text-white disabled:opacity-35" aria-label="Envoyer"><Send size={18}/></button></div><p className="mt-2 text-center text-[9px] font-semibold text-slate-400">L’API conversationnelle Market-Cash sera branchée sur cet espace.</p></form>
 </div>;
}
