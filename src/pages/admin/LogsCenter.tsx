import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase/config';
import { AppLog, LogCategory, LogLevel } from '../../types';
import { downloadLogsPdf } from '../../lib/logPdfExport';
import { firestoreNetwork } from '../../lib/firestoreNetwork';
import {
  Activity, AlertTriangle, CheckCircle, Copy, Download, FileWarning,
  Info, RefreshCw, Search, ShieldAlert, UserRound, X
} from 'lucide-react';

const redactText = (value: string) => value
  .replace(/\b\d{16}\b/g, '•••• •••• •••• ••••')
  .replace(/(cvv|pin|token|secret|cardnumber|rechargenumber)\s*[:=]\s*\S+/gi, '$1: [MASQUÉ]');

const safeMetadata = (metadata: Record<string, unknown>) => Object.fromEntries(
  Object.entries(metadata).map(([key, value]) => {
    if (/(pin|cvv|token|secret|cardnumber|rechargenumber|proof)/i.test(key)) return [key, '[MASQUÉ]'];
    return [key, typeof value === 'string' ? redactText(value) : value];
  })
);

const levelClass = (level: LogLevel) => {
  switch (level) {
    case 'SUCCESS': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'WARNING': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'ERROR': return 'bg-red-50 text-red-700 border-red-200';
    case 'CRITICAL': return 'bg-purple-50 text-purple-700 border-purple-200';
    default: return 'bg-blue-50 text-blue-700 border-blue-200';
  }
};

const resultText = (log: AppLog) => log.success === false ? 'Échec' : log.success === true ? 'Succès' : 'Information';

const getNetworkLogs = (): AppLog[] => firestoreNetwork.getIncidents().map(incident => ({
  id: `local-${incident.id}`,
  timestamp: incident.timestamp,
  level: incident.event === 'FIRESTORE_OPERATION_RECOVERED' ? 'SUCCESS' : incident.event === 'FIRESTORE_NETWORK_DEGRADED' ? 'WARNING' : 'ERROR',
  category: 'FIRESTORE',
  event: incident.event,
  message: incident.message,
  operation: incident.operation,
  errorCode: incident.errorCode,
  success: incident.event === 'FIRESTORE_OPERATION_RECOVERED'
}));

export const LogsCenter = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'ALL'>('ALL');
  const [filterCategory, setFilterCategory] = useState<LogCategory | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AppLog | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [networkLogs, setNetworkLogs] = useState<AppLog[]>(getNetworkLogs);

  useEffect(() => firestoreNetwork.subscribe(() => {
    setNetworkLogs(getNetworkLogs());
  }), []);

  useEffect(() => {
    const q = query(collection(db, 'appLogs'), orderBy('timestamp', 'desc'), limit(300));
    return onSnapshot(q, snap => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppLog)));
      firestoreNetwork.reportRecovered('logs.listen');
      setLastUpdate(new Date());
      setLoading(false);
    }, error => {
      firestoreNetwork.reportFailure('logs.listen', error);
      setLoading(false);
    });
  }, []);

  const allLogs = useMemo(() => [...networkLogs, ...logs].sort((a, b) => b.timestamp - a.timestamp), [logs, networkLogs]);
  const filteredLogs = useMemo(() => allLogs.filter(log => {
    if (filterLevel !== 'ALL' && log.level !== filterLevel) return false;
    if (filterCategory !== 'ALL' && log.category !== filterCategory) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.trim().toLowerCase();
    return [log.event, log.message, log.userId, log.userEmail, log.userRole, log.errorCode, log.errorName, log.operation, log.route, log.collection]
      .some(value => String(value || '').toLowerCase().includes(term));
  }), [allLogs, filterLevel, filterCategory, searchTerm]);

  const today = new Date().setHours(0, 0, 0, 0);
  const todayLogs = allLogs.filter(l => l.timestamp >= today);
  const stats = {
    total: todayLogs.length,
    errors: todayLogs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL').length,
    warnings: todayLogs.filter(l => l.level === 'WARNING').length,
    success: todayLogs.filter(l => l.level === 'SUCCESS').length,
  };

  const openClient = (log: AppLog) => {
    const target = String(log.metadata?.targetUserId || log.userId || '');
    if (target) navigate(`/admin/users?uid=${encodeURIComponent(target)}`);
  };

  const copyDiagnostic = async (log: AppLog) => {
    const text = [
      `[${new Date(log.timestamp).toISOString()}]`,
      `Niveau: ${log.level}`,
      `Catégorie: ${log.category}`,
      `Événement: ${log.event}`,
      `Résultat: ${resultText(log)}`,
      `Utilisateur: ${log.userEmail || log.userId || 'Système'}`,
      `Rôle: ${log.userRole || '-'}`,
      `Opération: ${log.operation || log.route || '-'}`,
      `Erreur: ${log.errorCode || log.errorName || '-'}`,
      `Message: ${redactText(log.message || '')}`
    ].join('\n');
    await navigator.clipboard.writeText(text);
  };

  return <div className="max-w-6xl mx-auto space-y-4 pb-24 px-1 sm:px-0">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-blue-950 flex items-center gap-2"><Activity size={22}/>Centre de logs</h1>
        <p className="text-xs sm:text-sm text-slate-500">Diagnostic et traçabilité en temps réel, optimisés pour mobile.</p>
      </div>
      <div className="flex gap-2">
        <div className="px-3 py-2 rounded-xl border bg-white text-[11px] text-slate-500 flex items-center gap-1.5"><RefreshCw size={13}/>{lastUpdate.toLocaleTimeString('fr-FR')}</div>
        <button onClick={() => downloadLogsPdf(filteredLogs)} className="px-3 py-2 rounded-xl bg-blue-950 text-white text-xs font-black flex items-center gap-1.5"><Download size={14}/>PDF ({filteredLogs.length})</button>
      </div>
    </div>

    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Stat icon={<Activity size={17}/>} label="Aujourd'hui" value={stats.total} tone="blue"/>
      <Stat icon={<AlertTriangle size={17}/>} label="Erreurs" value={stats.errors} tone="red"/>
      <Stat icon={<FileWarning size={17}/>} label="Avertissements" value={stats.warnings} tone="amber"/>
      <Stat icon={<CheckCircle size={17}/>} label="Succès" value={stats.success} tone="green"/>
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2 sm:space-y-0 sm:flex sm:gap-2">
      <div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Rechercher erreur, email, événement..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm outline-none focus:border-blue-500"/></div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <select value={filterLevel} onChange={e=>setFilterLevel(e.target.value as LogLevel|'ALL')} className="min-w-0 px-2.5 py-2.5 rounded-xl bg-slate-50 border text-xs font-bold"><option value="ALL">Tous niveaux</option><option value="INFO">Information</option><option value="SUCCESS">Succès</option><option value="WARNING">Avertissement</option><option value="ERROR">Erreur</option><option value="CRITICAL">Critique</option></select>
        <select value={filterCategory} onChange={e=>setFilterCategory(e.target.value as LogCategory|'ALL')} className="min-w-0 px-2.5 py-2.5 rounded-xl bg-slate-50 border text-xs font-bold"><option value="ALL">Toutes catégories</option><option value="AUTH">Auth</option><option value="FIRESTORE">Firestore</option><option value="STORAGE">Storage</option><option value="PAYMENT">Paiement</option><option value="CARD">Carte</option><option value="STOCK">Stock</option><option value="DELIVERY">Livraison</option><option value="SECURITY">Sécurité</option><option value="SYSTEM">Système</option><option value="UI">Interface</option></select>
      </div>
    </div>

    {loading ? <div className="p-10 text-center text-slate-500 font-bold">Chargement des logs...</div> : <>
      <div className="sm:hidden space-y-2.5">
        {filteredLogs.map(log => <button key={log.id} onClick={()=>setSelectedLog(log)} className="w-full text-left bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleString('fr-FR')}</div><div className="font-black text-sm text-slate-900 break-words mt-1">{log.event}</div></div><span className={`shrink-0 px-2 py-1 rounded-lg border text-[9px] font-black ${levelClass(log.level)}`}>{log.level}</span></div>
          <div className="mt-2 text-xs text-slate-600 line-clamp-2">{redactText(log.message || '')}</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div><span className="text-slate-400">Utilisateur</span><div className="font-bold text-slate-700 truncate">{log.userEmail || 'Système'}</div></div><div><span className="text-slate-400">Résultat</span><div className={`font-black ${log.success===false?'text-red-600':'text-emerald-600'}`}>{resultText(log)}</div></div><div className="col-span-2"><span className="text-slate-400">Opération</span><div className="font-bold text-slate-700 break-words">{log.operation || log.route || '—'}{(log.errorCode||log.errorName) ? ` · ${log.errorCode||log.errorName}` : ''}</div></div></div>
          <div className="mt-3 text-right text-[10px] font-black text-blue-700">Voir le diagnostic →</div>
        </button>)}
        {!filteredLogs.length && <Empty/>}
      </div>

      <div className="hidden sm:block bg-white border border-slate-200 rounded-2xl overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500 uppercase"><tr><th className="p-3">Date</th><th className="p-3">Niveau</th><th className="p-3">Événement</th><th className="p-3">Utilisateur</th><th className="p-3">Opération / résultat</th><th className="p-3">Erreur</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredLogs.map(log=><tr key={log.id} onClick={()=>setSelectedLog(log)} className="hover:bg-slate-50 cursor-pointer"><td className="p-3 whitespace-nowrap">{new Date(log.timestamp).toLocaleString('fr-FR')}</td><td className="p-3"><span className={`px-2 py-1 rounded-lg border text-[9px] font-black ${levelClass(log.level)}`}>{log.level}</span></td><td className="p-3 font-black max-w-xs">{log.event}</td><td className="p-3"><div className="font-bold">{log.userEmail||'Système'}</div><div className="text-[10px] text-slate-400">{log.userRole||'—'}</div></td><td className="p-3"><div>{log.operation||log.route||'—'}</div><div className={log.success===false?'text-red-600':'text-emerald-600'}>{resultText(log)}</div></td><td className="p-3 text-red-600 max-w-[180px] truncate">{log.errorCode||log.errorName||'—'}</td></tr>)}</tbody></table></div></div>
    </>}

    {selectedLog && <div className="fixed inset-0 z-50 bg-slate-950/70 p-2 sm:p-5 flex items-center justify-center" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedLog(null)}}><div className="w-full max-w-2xl max-h-[94vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">
      <div className="p-4 bg-slate-50 border-b flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-black text-lg">Diagnostic</h2><span className={`px-2 py-1 rounded-lg border text-[9px] font-black ${levelClass(selectedLog.level)}`}>{selectedLog.level}</span></div><div className="text-xs text-slate-400 mt-1">{new Date(selectedLog.timestamp).toLocaleString('fr-FR')}</div></div><button onClick={()=>setSelectedLog(null)} className="p-2 rounded-full bg-white border"><X size={17}/></button></div>
      <div className="p-4 overflow-y-auto space-y-3 text-sm"><Detail label="Événement" value={`${selectedLog.category} › ${selectedLog.event}`}/><Detail label="Message" value={redactText(selectedLog.message||'—')}/><div className="grid grid-cols-2 gap-2"><Detail label="Résultat" value={resultText(selectedLog)}/><Detail label="Opération" value={selectedLog.operation||selectedLog.route||'—'}/></div><Detail label="Utilisateur" value={`${selectedLog.userEmail||selectedLog.userId||'Système'} · ${selectedLog.userRole||'—'}`}/>{(selectedLog.errorCode||selectedLog.errorName)&&<Detail label="Erreur" value={`${selectedLog.errorCode||''} ${selectedLog.errorName||''}`.trim()}/>} {selectedLog.metadata && Object.keys(selectedLog.metadata).length>0 && <div><div className="text-[10px] font-black uppercase text-slate-400 mb-1">Metadata sécurisée</div><pre className="bg-slate-100 border rounded-xl p-3 text-[10px] whitespace-pre-wrap break-words overflow-hidden">{JSON.stringify(safeMetadata(selectedLog.metadata),null,2)}</pre></div>}</div>
      <div className="p-3 border-t bg-slate-50 grid grid-cols-2 sm:flex sm:justify-end gap-2">{(selectedLog.userId||selectedLog.metadata?.targetUserId)&&<button onClick={()=>openClient(selectedLog)} className="px-3 py-2.5 rounded-xl bg-blue-50 text-blue-800 font-black text-xs flex justify-center items-center gap-1.5"><UserRound size={14}/>Dossier client</button>}<button onClick={()=>void copyDiagnostic(selectedLog)} className="px-3 py-2.5 rounded-xl bg-white border text-slate-700 font-black text-xs flex justify-center items-center gap-1.5"><Copy size={14}/>Copier</button></div>
    </div></div>}
  </div>;
};

function Stat({icon,label,value,tone}:{icon:React.ReactNode,label:string,value:number,tone:'blue'|'red'|'amber'|'green'}){
  const classes={blue:'bg-blue-50 text-blue-700',red:'bg-red-50 text-red-700',amber:'bg-amber-50 text-amber-700',green:'bg-emerald-50 text-emerald-700'}[tone];
  return <div className="bg-white border rounded-2xl p-3 flex items-center gap-2"><div className={`p-2 rounded-xl ${classes}`}>{icon}</div><div><div className="text-[10px] font-bold text-slate-400">{label}</div><div className="text-xl font-black text-slate-900">{value}</div></div></div>;
}
function Detail({label,value}:{label:string,value:string}){return <div className="bg-slate-50 border rounded-xl p-3"><div className="text-[10px] font-black uppercase text-slate-400 mb-1">{label}</div><div className="font-semibold text-slate-800 break-words">{value}</div></div>}
function Empty(){return <div className="p-10 text-center bg-white border rounded-2xl text-slate-400"><Info className="mx-auto mb-2"/>Aucun log avec ces filtres.</div>}
