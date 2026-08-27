import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { AppLog, LogLevel, LogCategory } from '../../types';
import { Activity, AlertTriangle, CheckCircle, Info, ShieldAlert, Search, X, Copy, RefreshCw } from 'lucide-react';

export const LogsCenter = () => {
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<LogLevel | 'ALL'>('ALL');
  const [filterCategory, setFilterCategory] = useState<LogCategory | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AppLog | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const redactText = (value: string) => value
    .replace(/\b\d{16}\b/g, '••••••••••••••••')
    .replace(/(cvv|pin|token)\s*[:=]\s*\S+/gi, '$1: [MASQUÉ]');

  const safeMetadata = (metadata: Record<string, unknown>) => Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (/(pin|cvv|token|secret|cardnumber|rechargenumber|proof)/i.test(key)) return [key, '[MASQUÉ]'];
      return [key, typeof value === 'string' ? redactText(value) : value];
    })
  );

  useEffect(() => {
    const q = query(
      collection(db, 'appLogs'),
      orderBy('timestamp', 'desc'),
      limit(200)
    );

    const unsub = onSnapshot(q, (snap) => {
      const logsData = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppLog));
      setLogs(logsData);
      setLastUpdate(new Date());
      setLoading(false);
    }, (err) => {
      console.error('LogsCenter Error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const filteredLogs = logs.filter(log => {
    if (filterLevel !== 'ALL' && log.level !== filterLevel) return false;
    if (filterCategory !== 'ALL' && log.category !== filterCategory) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        log.event?.toLowerCase().includes(term) ||
        log.message?.toLowerCase().includes(term) ||
        log.userId?.toLowerCase().includes(term) ||
        log.userEmail?.toLowerCase().includes(term) ||
        log.errorCode?.toLowerCase().includes(term) ||
        log.collection?.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const getLevelIcon = (level: LogLevel) => {
    switch (level) {
      case 'INFO': return <Info size={16} className="text-blue-500" />;
      case 'SUCCESS': return <CheckCircle size={16} className="text-emerald-500" />;
      case 'WARNING': return <AlertTriangle size={16} className="text-amber-500" />;
      case 'ERROR': return <AlertTriangle size={16} className="text-red-500" />;
      case 'CRITICAL': return <ShieldAlert size={16} className="text-purple-600" />;
    }
  };

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'INFO': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'SUCCESS': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'WARNING': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'ERROR': return 'bg-red-100 text-red-800 border-red-200';
      case 'CRITICAL': return 'bg-purple-100 text-purple-800 border-purple-200';
    }
  };

  const today = new Date().setHours(0, 0, 0, 0);
  const todayLogs = logs.filter(l => l.timestamp >= today);
  const stats = {
    total: todayLogs.length,
    success: todayLogs.filter(l => l.level === 'SUCCESS').length,
    warnings: todayLogs.filter(l => l.level === 'WARNING').length,
    errors: todayLogs.filter(l => l.level === 'ERROR').length,
    critical: todayLogs.filter(l => l.level === 'CRITICAL').length,
  };

  const copyDiagnostic = (log: AppLog) => {
    const text = `[${new Date(log.timestamp).toISOString()}]
Level: ${log.level}
Category: ${log.category}
Event: ${log.event}

Role: ${log.userRole || 'N/A'}
Email: ${log.userEmail || 'N/A'}
Collection: ${log.collection || 'N/A'}
Operation: ${log.operation || 'N/A'}
Error: ${log.errorCode || 'N/A'}
Message: ${redactText(log.message)}`;
    
    navigator.clipboard.writeText(text);
    alert('Diagnostic copié dans le presse-papier');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-blue-950 flex items-center gap-2">
            <Activity size={28} className="text-blue-600" />
            Centre de logs
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Supervision technique et traçabilité des événements.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400 font-medium mb-1">Dernière actualisation</div>
          <div className="flex items-center gap-1.5 text-sm font-bold text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            <RefreshCw size={14} className="text-blue-500" />
            {lastUpdate.toLocaleTimeString()}
          </div>
        </div>
      </div>

      
      {/* Diagnostic rapide */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <CheckCircle size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase">Authentication</div>
            <div className="text-sm font-black text-slate-800">Connecté</div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <CheckCircle size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase">Firestore</div>
            <div className="text-sm font-black text-slate-800">Connecté</div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <CheckCircle size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase">Storage</div>
            <div className="text-sm font-black text-slate-800">Connecté</div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${stats.errors > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
            {stats.errors > 0 ? <AlertTriangle size={20} /> : <Activity size={20} />}
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase">Dernière activité</div>
            <div className="text-sm font-black text-slate-800 truncate">
              {logs[0] ? (logs[0].level === 'ERROR' ? logs[0].errorCode || 'Erreur' : new Date(logs[0].timestamp).toLocaleTimeString()) : '-'}
            </div>
          </div>
        </div>
      </div>
  
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
          <div className="text-xs font-bold text-slate-500 uppercase">Aujourd'hui</div>
          <div className="text-2xl font-black text-slate-800">{stats.total}</div>
        </div>
        <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 shadow-sm">
          <div className="text-xs font-bold text-emerald-600 uppercase">Succès</div>
          <div className="text-2xl font-black text-emerald-700">{stats.success}</div>
        </div>
        <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 shadow-sm">
          <div className="text-xs font-bold text-amber-600 uppercase">Warnings</div>
          <div className="text-2xl font-black text-amber-700">{stats.warnings}</div>
        </div>
        <div className="bg-red-50 p-4 rounded-2xl border border-red-100 shadow-sm">
          <div className="text-xs font-bold text-red-600 uppercase">Erreurs</div>
          <div className="text-2xl font-black text-red-700">{stats.errors}</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100 shadow-sm">
          <div className="text-xs font-bold text-purple-600 uppercase">Critiques</div>
          <div className="text-2xl font-black text-purple-700">{stats.critical}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher (email, erreur, événement...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 font-medium"
          />
        </div>
        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value as any)}
          className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
        >
          <option value="ALL">Tous les niveaux</option>
          <option value="INFO">INFO</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="WARNING">WARNING</option>
          <option value="ERROR">ERROR</option>
          <option value="CRITICAL">CRITICAL</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as any)}
          className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
        >
          <option value="ALL">Toutes les catégories</option>
          <option value="AUTH">AUTH</option>
          <option value="FIRESTORE">FIRESTORE</option>
          <option value="STORAGE">STORAGE</option>
          <option value="PAYMENT">PAYMENT</option>
          <option value="CARD">CARD</option>
          <option value="STOCK">STOCK</option>
          <option value="DELIVERY">DELIVERY</option>
          <option value="SECURITY">SECURITY</option>
          <option value="SYSTEM">SYSTEM</option>
          <option value="UI">UI</option>
        </select>
      </div>

      {/* Log List */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Chargement des logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Aucun log trouvé.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="p-4 font-black">Date / Heure</th>
                  <th className="p-4 font-black">Niveau</th>
                  <th className="p-4 font-black">Catégorie</th>
                  <th className="p-4 font-black">Événement</th>
                  <th className="p-4 font-black">Opération / Résultat</th>
                  <th className="p-4 font-black">Erreur</th>
                  <th className="p-4 font-black">Utilisateur</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {filteredLogs.map(log => (
                  <tr 
                    key={log.id} 
                    onClick={() => setSelectedLog(log)}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="p-4 whitespace-nowrap text-xs font-bold text-slate-600">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-black tracking-wider uppercase border ${getLevelColor(log.level)}`}>
                        {getLevelIcon(log.level)}
                        {log.level}
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap text-xs font-bold text-slate-600">
                      {log.category}
                    </td>
                    <td className="p-4 whitespace-nowrap font-bold text-slate-800 text-xs">
                      {log.event}
                    </td>
                    <td className="p-4 text-slate-600 text-xs max-w-xs">
                      <div className="font-bold">{log.operation || log.route || '—'}</div>
                      <div className={log.success === false ? 'text-red-600' : 'text-emerald-600'}>{log.success === false ? 'Échec' : log.success === true ? 'Succès' : 'Information'}</div>
                    </td>
                    <td className="p-4 text-red-600 text-xs max-w-[180px] truncate">
                      {log.errorCode || log.errorName || '—'}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      <div className="text-xs font-bold text-slate-700">{log.userEmail || '-'}</div>
                      <div className="text-[10px] text-slate-500">{log.userRole || '-'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Details */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <h3 className="font-black text-lg text-slate-800 flex items-center gap-2">
                Détail du log
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase border ${getLevelColor(selectedLog.level)}`}>
                  {selectedLog.level}
                </span>
              </h3>
              <button 
                onClick={() => setSelectedLog(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Date & Heure</div>
                  <div className="text-sm font-semibold text-slate-800">
                    {new Date(selectedLog.timestamp).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Catégorie / Événement</div>
                  <div className="text-sm font-semibold text-slate-800">
                    {selectedLog.category} &rsaquo; {selectedLog.event}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Message</div>
                <div className="text-sm font-medium text-slate-800 break-words">
                  {redactText(selectedLog.message)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Utilisateur</div>
                  <div className="text-sm font-semibold text-slate-800">{selectedLog.userEmail || 'N/A'}</div>
                  <div className="text-xs text-slate-500">{selectedLog.userId || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Rôle</div>
                  <div className="text-sm font-semibold text-slate-800">{selectedLog.userRole || 'N/A'}</div>
                </div>
              </div>

              {(selectedLog.errorCode || selectedLog.errorName) && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                  <div className="text-xs font-bold text-red-500 mb-2 uppercase tracking-wider">Détails d'erreur</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {selectedLog.errorCode && <div><span className="font-semibold text-red-800">Code:</span> <span className="text-red-700">{selectedLog.errorCode}</span></div>}
                    {selectedLog.errorName && <div><span className="font-semibold text-red-800">Nom:</span> <span className="text-red-700">{selectedLog.errorName}</span></div>}
                    {selectedLog.collection && <div><span className="font-semibold text-red-800">Collection:</span> <span className="text-red-700">{selectedLog.collection}</span></div>}
                    {selectedLog.operation && <div><span className="font-semibold text-red-800">Opération:</span> <span className="text-red-700">{selectedLog.operation}</span></div>}
                  </div>
                </div>
              )}

              {selectedLog.stack && (
                <div>
                  <div className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Stack Trace</div>
                  <pre className="bg-slate-900 text-slate-300 p-4 rounded-xl text-[10px] overflow-x-auto whitespace-pre-wrap font-mono">
                    {redactText(selectedLog.stack)}
                  </pre>
                </div>
              )}
              
              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Metadata</div>
                  <pre className="bg-slate-100 text-slate-700 p-4 rounded-xl text-xs overflow-x-auto font-mono border border-slate-200">
                    {JSON.stringify(safeMetadata(selectedLog.metadata), null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button
                onClick={() => copyDiagnostic(selectedLog)}
                className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-sm font-bold flex items-center gap-2"
              >
                <Copy size={16} /> Copier le diagnostic
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
