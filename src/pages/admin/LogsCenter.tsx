import React, { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase/config';
import { AppLog, LogCategory, LogLevel } from '../../types';
import {
  Activity, AlertTriangle, CheckCircle, Download, Eye, Info, RefreshCw,
  Search, ShieldAlert, User as UserIcon, X
} from 'lucide-react';

const sanitize = (value: unknown) => String(value ?? '')
  .replace(/\b\d{12,19}\b/g, '[NUMERO_MASQUE]')
  .replace(/\b\d{3,4}\b(?=\s*(?:CVV|CVC))/gi, '[CVV_MASQUE]');

const levelLabel: Record<LogLevel, string> = {
  INFO: 'Information', SUCCESS: 'Succès', WARNING: 'Avertissement', ERROR: 'Échec', CRITICAL: 'Critique'
};

export const LogsCenter = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'ALL'>('ALL');
  const [filterCategory, setFilterCategory] = useState<LogCategory | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AppLog | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    const q = query(collection(db, 'appLogs'), orderBy('timestamp', 'desc'), limit(300));
    return onSnapshot(q, snap => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppLog)));
      setLastUpdate(new Date());
      setLoading(false);
    }, err => {
      console.error('[LOGS_CENTER_ERROR]', err);
      setLoading(false);
    });
  }, []);

  const filteredLogs = useMemo(() => logs.filter(log => {
    if (filterLevel !== 'ALL' && log.level !== filterLevel) return false;
    if (filterCategory !== 'ALL' && log.category !== filterCategory) return false;
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    return [log.event, log.message, log.userEmail, log.userRole, log.operation, log.errorCode, log.collection]
      .some(v => String(v || '').toLowerCase().includes(term));
  }), [logs, filterLevel, filterCategory, searchTerm]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayLogs = logs.filter(l => l.timestamp >= today.getTime());
  const stats = {
    total: todayLogs.length,
    errors: todayLogs.filter(l => l.level === 'ERROR' || l.level === 'CRITICAL').length,
    warnings: todayLogs.filter(l => l.level === 'WARNING').length,
    success: todayLogs.filter(l => l.level === 'SUCCESS').length
  };

  const getLevelClasses = (level: LogLevel) => ({
    INFO: 'bg-blue-50 text-blue-700 border-blue-200',
    SUCCESS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    WARNING: 'bg-amber-50 text-amber-700 border-amber-200',
    ERROR: 'bg-red-50 text-red-700 border-red-200',
    CRITICAL: 'bg-purple-50 text-purple-700 border-purple-200'
  }[level]);

  const exportPdf = () => {
    const rows = filteredLogs.map(log => `
      <tr>
        <td>${new Date(log.timestamp).toLocaleString('fr-FR')}</td>
        <td>${sanitize(levelLabel[log.level])}</td>
        <td>${sanitize(log.category)}</td>
        <td>${sanitize(log.event)}</td>
        <td>${sanitize(log.userEmail || log.userId || 'Système')}</td>
        <td>${sanitize(log.operation || '—')}</td>
        <td>${sanitize(log.success === false ? 'Échec' : log.level === 'ERROR' || log.level === 'CRITICAL' ? 'Échec' : 'OK')}</td>
        <td>${sanitize(log.errorCode || log.message || '—')}</td>
      </tr>`).join('');

    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) {
      alert('Le navigateur a bloqué la fenêtre d’export. Autorisez les pop-ups puis réessayez.');
      return;
    }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Market-Cash - Logs</title>
      <style>
        @page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#14213d;font-size:10px}
        h1{font-size:20px;margin:0 0 4px}.meta{color:#64748b;margin-bottom:14px}.note{background:#eff6ff;padding:8px;border-radius:8px;margin-bottom:12px}
        table{width:100%;border-collapse:collapse}th,td{border:1px solid #dbe3ef;padding:6px;vertical-align:top;word-break:break-word}th{background:#172554;color:white;text-align:left}
        tr:nth-child(even){background:#f8fafc}.footer{margin-top:12px;color:#64748b;font-size:9px}
      </style></head><body>
      <h1>Market-Cash — Centre de logs</h1>
      <div class="meta">Généré le ${new Date().toLocaleString('fr-FR')} · ${filteredLogs.length} résultat(s)</div>
      <div class="note">Export de diagnostic. Les données sensibles (PIN, CVV, tokens et numéros complets de carte) ne doivent pas apparaître dans les logs.</div>
      <table><thead><tr><th>Date</th><th>Niveau</th><th>Catégorie</th><th>Événement</th><th>Utilisateur</th><th>Opération</th><th>Résultat</th><th>Détail</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="footer">Market-Cash · Document de diagnostic interne</div>
      <script>window.onload=()=>setTimeout(()=>window.print(),250);</script></body></html>`);
    win.document.close();
  };

  const openUser = (log: AppLog) => {
    const target = log.metadata?.targetUserId || log.userId;
    if (target) navigate(`/admin/users?uid=${encodeURIComponent(target)}`);
  };

  if (loading) return <div className="p-8 text-center text-slate-500 font-bold">Chargement des logs...</div>;

  return <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 pb-24 px-1 sm:px-0">
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-blue-950 flex items-center gap-2"><Activity size={24}/>Centre de logs</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">Diagnostic technique et traçabilité métier en temps réel.</p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={exportPdf} className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-blue-950 text-white text-xs font-black shadow-sm"><Download size={15}/>Exporter PDF</button>
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-white text-xs font-bold text-slate-600"><RefreshCw size={13}/>{lastUpdate.toLocaleTimeString('fr-FR')}</div>
      </div>
    </div>

    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      <Stat label="Aujourd’hui" value={stats.total} />
      <Stat label="Succès" value={stats.success} tone="success" />
      <Stat label="Avertissements" value={stats.warnings} tone="warning" />
      <Stat label="Erreurs" value={stats.errors} tone="error" />
    </div>

    <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 space-y-2 sm:space-y-0 sm:flex sm:gap-2">
      <div className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Email, événement, erreur..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:border-blue-500"/></div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <select value={filterLevel} onChange={e=>setFilterLevel(e.target.value as LogLevel|'ALL')} className="w-full sm:w-auto p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold"><option value="ALL">Tous niveaux</option><option value="ERROR">Erreurs</option><option value="CRITICAL">Critiques</option><option value="WARNING">Warnings</option><option value="SUCCESS">Succès</option><option value="INFO">Infos</option></select>
        <select value={filterCategory} onChange={e=>setFilterCategory(e.target.value as LogCategory|'ALL')} className="w-full sm:w-auto p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold"><option value="ALL">Toutes catégories</option>{['AUTH','USER','PAYMENT','CARD','STOCK','DELIVERY','FIRESTORE','STORAGE','SECURITY','SYSTEM'].map(c=><option key={c} value={c}>{c}</option>)}</select>
      </div>
    </div>

    <div className="sm:hidden space-y-2.5">
      {filteredLogs.map(log => <button key={log.id} onClick={()=>setSelectedLog(log)} className="w-full text-left bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm active:bg-slate-50">
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="text-[10px] text-slate-400 font-bold">{new Date(log.timestamp).toLocaleString('fr-FR')}</div><div className="font-black text-sm text-slate-900 mt-1 break-words">{log.event}</div></div><span className={`shrink-0 px-2 py-1 rounded-lg border text-[10px] font-black ${getLevelClasses(log.level)}`}>{levelLabel[log.level]}</span></div>
        <div className="mt-2 text-xs text-slate-600 line-clamp-2">{log.message}</div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div><span className="text-slate-400">Utilisateur</span><div className="font-bold text-slate-700 truncate">{log.userEmail || 'Système'}</div></div><div><span className="text-slate-400">Opération / résultat</span><div className={log.success===false || log.level==='ERROR' || log.level==='CRITICAL' ? 'font-bold text-red-600':'font-bold text-emerald-600'}>{log.operation || '—'} · {log.success===false || log.level==='ERROR' || log.level==='CRITICAL' ? 'Échec':'OK'}</div></div></div>
      </button>)}
      {!filteredLogs.length && <Empty/>}
    </div>

    <div className="hidden sm:block bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500 uppercase"><tr><th className="p-3">Heure</th><th className="p-3">Niveau</th><th className="p-3">Événement</th><th className="p-3">Utilisateur</th><th className="p-3">Opération / résultat</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredLogs.map(log=><tr key={log.id} onClick={()=>setSelectedLog(log)} className="hover:bg-slate-50 cursor-pointer"><td className="p-3 whitespace-nowrap">{new Date(log.timestamp).toLocaleString('fr-FR')}</td><td className="p-3"><span className={`px-2 py-1 rounded-lg border font-black ${getLevelClasses(log.level)}`}>{levelLabel[log.level]}</span></td><td className="p-3 font-bold max-w-xs truncate">{log.event}</td><td className="p-3"><button onClick={e=>{e.stopPropagation();openUser(log)}} className="text-blue-700 font-bold hover:underline">{log.userEmail || 'Système'}</button><div className="text-[10px] text-slate-400">{log.userRole || '—'}</div></td><td className="p-3">{log.operation || '—'}<div className={log.success===false || log.level==='ERROR'||log.level==='CRITICAL'?'text-red-600 font-bold':'text-emerald-600 font-bold'}>{log.success===false || log.level==='ERROR'||log.level==='CRITICAL'?'Échec':'Succès'}</div></td></tr>)}</tbody></table></div>
    </div>

    {selectedLog && <div className="fixed inset-0 z-50 bg-slate-950/70 p-3 flex items-center justify-center" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedLog(null)}}><div className="w-full max-w-xl max-h-[88vh] overflow-hidden bg-white rounded-3xl shadow-2xl flex flex-col"><div className="p-4 border-b flex items-center justify-between"><div><div className="font-black text-slate-900">Détail du log</div><div className="text-[10px] text-slate-400">{new Date(selectedLog.timestamp).toLocaleString('fr-FR')}</div></div><button onClick={()=>setSelectedLog(null)} className="p-2 rounded-full bg-slate-100"><X size={17}/></button></div><div className="p-4 overflow-y-auto space-y-3 text-sm"><Detail label="Niveau" value={levelLabel[selectedLog.level]}/><Detail label="Catégorie" value={selectedLog.category}/><Detail label="Événement" value={selectedLog.event}/><Detail label="Message" value={sanitize(selectedLog.message)}/><Detail label="Opération" value={selectedLog.operation}/><Detail label="Erreur" value={selectedLog.errorCode}/><Detail label="Utilisateur" value={selectedLog.userEmail || selectedLog.userId}/>{(selectedLog.userId || selectedLog.metadata?.targetUserId) && <button onClick={()=>openUser(selectedLog)} className="w-full mt-2 py-2.5 rounded-xl bg-blue-950 text-white font-black text-xs flex items-center justify-center gap-2"><UserIcon size={15}/>Ouvrir le dossier utilisateur</button>}</div></div></div>}
  </div>;
};

function Stat({label,value,tone='default'}:{label:string,value:number,tone?:'default'|'success'|'warning'|'error'}) { const cls={default:'bg-white text-blue-950',success:'bg-emerald-50 text-emerald-700',warning:'bg-amber-50 text-amber-700',error:'bg-red-50 text-red-700'}[tone]; return <div className={`${cls} rounded-2xl border border-slate-200 p-3`}><div className="text-[10px] font-black uppercase opacity-70">{label}</div><div className="text-xl font-black mt-0.5">{value}</div></div>; }
function Detail({label,value}:{label:string,value?:unknown}) { return <div className="bg-slate-50 rounded-xl p-3"><div className="text-[10px] uppercase font-black text-slate-400">{label}</div><div className="font-semibold text-slate-800 break-words mt-0.5">{value ? String(value) : '—'}</div></div>; }
function Empty(){return <div className="p-10 text-center bg-white rounded-2xl border text-slate-400"><Info className="mx-auto mb-2"/>Aucun log correspondant.</div>}
