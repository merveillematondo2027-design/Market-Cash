import React,{useEffect,useMemo,useState}from'react';
import{collection,getDocs,orderBy,query}from'firebase/firestore';
import{ChevronRight,RefreshCw,Search,UserRound}from'lucide-react';
import{useNavigate}from'react-router-dom';
import toast from'react-hot-toast';
import{db}from'../../firebase/config';
import{User}from'../../types';

export default function AdminAgents(){
  const navigate=useNavigate();
  const[users,setUsers]=useState<User[]>([]);
  const[q,setQ]=useState('');
  const[loading,setLoading]=useState(true);
  const[refreshing,setRefreshing]=useState(false);

  const load=async()=>{
    setRefreshing(true);
    try{
      const s=await getDocs(query(collection(db,'users'),orderBy('createdAt','desc')));
      setUsers(s.docs.map(d=>({...d.data(),uid:d.id}as User)));
    }catch(error){
      console.error('[ADMIN_AGENTS_LOAD_ERROR]',error);
      toast.error('Impossible de charger les agents.');
    }finally{
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(()=>{void load()},[]);

  const agents=useMemo(()=>users.filter(u=>u.role==='agent'),[users]);
  const filtered=useMemo(()=>{
    const x=q.trim().toLowerCase();
    if(!x)return agents;
    return agents.filter(u=>[u.displayName,u.email,u.phone,u.uid].some(v=>String(v||'').toLowerCase().includes(x)));
  },[agents,q]);

  return <div className="mx-auto max-w-5xl space-y-4 pb-20">
    <header className="flex items-end justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-amber-600">Réseau Market-Cash</p>
        <h1 className="text-3xl font-black text-blue-950">Agents</h1>
        <p className="mt-1 text-sm text-slate-500">{agents.length} compte(s) Agent actif(s) dans l’administration.</p>
      </div>
      <button onClick={()=>void load()} disabled={refreshing} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border bg-white text-blue-950 shadow-sm disabled:opacity-40" aria-label="Actualiser">
        <RefreshCw size={18} className={refreshing?'animate-spin':''}/>
      </button>
    </header>

    <section className="rounded-3xl border bg-white p-4 shadow-sm">
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Nom, téléphone ou e-mail" className="w-full rounded-2xl border bg-slate-50 p-3.5 pl-11 outline-none focus:border-blue-500"/>
      </div>
    </section>

    {loading?<div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-500">Chargement des agents…</div>:
      <section className="grid gap-3 md:grid-cols-2">
        {filtered.length===0?<div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-500 md:col-span-2">Aucun agent trouvé.</div>:filtered.map(u=>{
          const active=(u.accountStatus||'active')==='active';
          return <button key={u.uid} onClick={()=>navigate(`/admin/agents/${u.uid}`)} className="group flex items-center gap-4 rounded-3xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
            <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${active?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}><UserRound size={22}/></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-base font-black text-slate-950">{u.displayName||'Agent Market-Cash'}</p>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black uppercase ${active?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-800'}`}>{active?'Actif':u.accountStatus}</span>
              </div>
              <p className="mt-1 truncate text-sm text-slate-500">{u.phone||u.email||u.uid}</p>
              {u.email&&u.phone&&<p className="mt-0.5 truncate text-xs text-slate-400">{u.email}</p>}
            </div>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-50 text-blue-950 transition group-hover:bg-blue-950 group-hover:text-white"><ChevronRight size={18}/></div>
          </button>;
        })}
      </section>}
  </div>;
}
