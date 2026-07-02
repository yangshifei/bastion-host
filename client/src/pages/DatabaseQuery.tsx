import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Select, Tag, MessagePlugin, Table, Textarea, Space, Popconfirm, Input } from 'tdesign-react';
import { PlayCircleIcon, DownloadIcon, RefreshIcon, TimeIcon, FolderOpenIcon, ChevronRightIcon, SaveIcon } from 'tdesign-icons-react';
import { assetService } from '../services/assetService';
import api from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import type { SafeAsset } from '../types';

export const DatabaseQuery: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const assetId = id ? parseInt(id, 10) : 0;

  const [asset, setAsset] = useState<SafeAsset | null>(null);
  const [sql, setSql] = useState('SELECT 1');
  const [results, setResults] = useState<{ columns: string[]; rows: any[]; rowCount: number; durationMs: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objects, setObjects] = useState<{ tables: string[]; views: string[]; procedures: string[] } | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableInfo, setTableInfo] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [savedQueries, setSavedQueries] = useState<any[]>([]);
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [activeTab, setActiveTab] = useState<'results' | 'objects' | 'history' | 'saved'>('results');

  useEffect(() => { loadAsset(); loadHistory(); loadSaved(); }, [assetId]);

  const loadAsset = async () => {
    try {
      const res = await assetService.getById(assetId);
      if (res.code === 0 && res.data) setAsset(res.data);
    } catch { /* ignore */ }
  };

  const loadHistory = async () => {
    try {
      const res = await api.get('/database/history').then(r => r.data);
      if (res.code === 0) setHistory(res.data);
    } catch { /* ignore */ }
  };

  const loadSaved = async () => {
    try {
      const res = await api.get('/database/saved-queries').then(r => r.data);
      if (res.code === 0) setSavedQueries(res.data);
    } catch { /* ignore */ }
  };

  const loadObjects = async () => {
    try {
      const res = await api.get(`/database/${assetId}/objects`).then(r => r.data);
      if (res.code === 0) setObjects(res.data);
    } catch { MessagePlugin.error('加载对象列表失败'); }
  };

  const execute = async () => {
    if (!sql.trim()) return;
    setLoading(true); setError(null); setResults(null);
    try {
      const res = await api.post(`/database/${assetId}/execute`, { sql }).then(r => r.data);
      if (res.code === 0) {
        setResults(res.data);
        loadHistory();
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message);
    } finally { setLoading(false); }
  };

  const exportCsv = () => {
    if (!results?.rows.length) return;
    const cols = results.columns.length ? results.columns : Object.keys(results.rows[0]);
    const header = '﻿' + cols.join(',');
    const body = results.rows.map(r => cols.map(c => {
      const v = r[c] ?? '';
      return /[,"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    }).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'query_result.csv'; a.click();
  };

  const handleTableClick = async (name: string) => {
    setSelectedTable(name); setActiveTab('results');
    try {
      const res = await api.get(`/database/${assetId}/table/${name}`).then(r => r.data);
      if (res.code === 0) setTableInfo(res.data);
    } catch { /* ignore */ }
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    try {
      await api.post('/database/saved-queries', { name: saveName.trim(), query_text: sql, asset_id: assetId });
      MessagePlugin.success('已保存'); setShowSave(false); setSaveName('');
      loadSaved();
    } catch { MessagePlugin.error('保存失败'); }
  };

  const handleDeleteSaved = async (id: number) => {
    try {
      await api.delete(`/database/saved-queries/${id}`);
      loadSaved();
    } catch { /* ignore */ }
  };

  if (!asset) return <LoadingSkeleton />;

  const tabs = [
    { key: 'results', label: '结果' },
    { key: 'objects', label: '对象' },
    { key: 'history', label: '历史' },
    { key: 'saved', label: '已保存' },
  ] as const;

  return (
    <div>
      <PageHeader title={`数据库查询 · ${asset.name}`} description={`${asset.host}:${asset.port}/${(asset as any).database_name || ''}  (${(asset as any).db_type?.toUpperCase() || ''})`}>
        <Space>
          <Button variant="outline" icon={<RefreshIcon />} onClick={() => { loadAsset(); loadObjects(); }}>刷新</Button>
          <Button variant="outline" onClick={() => navigate('/assets')}>返回</Button>
        </Space>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* ── Left panel: Objects / History / Saved ── */}
        <div className="lg:col-span-1 content-card overflow-hidden" style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
          <div className="flex border-b border-[var(--border-subtle)]">
            {tabs.map(t => (
              <button key={t.key} onClick={() => { setActiveTab(t.key); if (t.key === 'objects') loadObjects(); }}
                className={`flex-1 py-2 text-xs font-medium ${activeTab === t.key ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'objects' && (
            <div className="p-2 text-xs">
              {objects ? (
                <>
                  <div className="mb-2">
                    <p className="text-slate-500 font-medium mb-1 flex items-center gap-1"><FolderOpenIcon size="12px" /> 表 ({objects.tables.length})</p>
                    {objects.tables.slice(0, 50).map(t => (
                      <div key={t} onClick={() => handleTableClick(t)}
                        className={`px-2 py-1 cursor-pointer rounded hover:bg-[var(--bg-elevated)] ${selectedTable === t ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-300'}`}>
                        {t}
                      </div>
                    ))}
                  </div>
                  {objects.views.length > 0 && (
                    <div className="mb-2">
                      <p className="text-slate-500 font-medium mb-1">视图 ({objects.views.length})</p>
                      {objects.views.slice(0, 30).map(v => (
                        <div key={v} className="px-2 py-1 text-slate-400">{v}</div>
                      ))}
                    </div>
                  )}
                  {objects.procedures.length > 0 && (
                    <div>
                      <p className="text-slate-500 font-medium mb-1">存储过程 ({objects.procedures.length})</p>
                      {objects.procedures.slice(0, 30).map(p => (
                        <div key={p} className="px-2 py-1 text-slate-400">{p}</div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-500 text-center py-4 cursor-pointer hover:text-cyan-400" onClick={loadObjects}>点击加载对象列表</p>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="p-2 text-xs">
              {history.map(h => (
                <div key={h.id} onClick={() => setSql(h.query_text)}
                  className="p-2 mb-1 rounded cursor-pointer hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <p className="text-slate-300 truncate font-mono text-[11px]">{h.query_text.substring(0, 80)}</p>
                  <p className="text-slate-500 mt-0.5">
                    {h.status === 'success' ? `✅ ${h.row_count ?? 0} 行 · ${h.duration_ms}ms` : `❌ ${h.error_message?.substring(0, 50)}`}
                    <span className="ml-2">{h.executed_at}</span>
                  </p>
                </div>
              ))}
              {history.length === 0 && <p className="text-slate-500 text-center py-4">暂无查询记录</p>}
            </div>
          )}

          {activeTab === 'saved' && (
            <div className="p-2 text-xs">
              {savedQueries.map(s => (
                <div key={s.id} className="p-2 mb-1 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-medium truncate cursor-pointer" onClick={() => setSql(s.query_text)}>{s.name}</span>
                    <Popconfirm content="删除？" onConfirm={() => handleDeleteSaved(s.id)}>
                      <Button variant="text" size="small" theme="danger">✕</Button>
                    </Popconfirm>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{s.query_text.substring(0, 60)}</p>
                </div>
              ))}
              {savedQueries.length === 0 && <p className="text-slate-500 text-center py-4">暂无保存的查询</p>}
            </div>
          )}
        </div>

        {/* ── Right panel: Editor + Results ── */}
        <div className="lg:col-span-3 space-y-4">
          {/* SQL Editor */}
          <div className="content-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]">
              <span className="text-xs text-slate-500 font-mono">SQL</span>
              <Space size="small">
                {showSave ? (
                  <div className="flex items-center gap-1">
                    <Input value={saveName} onChange={setSaveName} placeholder="查询名称" size="small" style={{ width: 120 }}
                      onEnter={handleSave} />
                    <Button size="small" onClick={handleSave}>保存</Button>
                    <Button variant="text" size="small" onClick={() => setShowSave(false)}>取消</Button>
                  </div>
                ) : (
                  <Button variant="text" size="small" icon={<SaveIcon />} onClick={() => setShowSave(true)}>保存</Button>
                )}
                <Button theme="primary" size="small" icon={<PlayCircleIcon />} loading={loading} onClick={execute}>
                  执行 (Ctrl+Enter)
                </Button>
              </Space>
            </div>
            <textarea
              value={sql}
              onChange={e => setSql(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); execute(); } }}
              className="w-full h-32 bg-transparent text-sm text-slate-200 font-mono p-3 outline-none resize-none border-0"
              placeholder="SELECT * FROM ..."
              style={{ background: 'var(--bg-deep)' }}
            />
          </div>

          {/* Results */}
          <div className="content-card overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]">
              <span className="text-xs text-slate-500">
                {results ? `${results.rowCount} 行 · ${results.durationMs}ms` : '结果'}
              </span>
              {results?.rows?.length ? (
                <Button variant="text" size="small" icon={<DownloadIcon />} onClick={exportCsv}>导出 CSV</Button>
              ) : null}
            </div>

            {error && (
              <div className="p-4 text-sm text-red-400 font-mono">{error}</div>
            )}

            {results?.rows?.length ? (
              <div style={{ maxHeight: 'calc(100vh - 420px)', overflow: 'auto' }}>
                <Table
                  data={results.rows.slice(0, 200).map((r, i) => ({ ...r, _idx: i }))}
                  columns={(results.columns.length ? results.columns : Object.keys(results.rows[0] || {}))
                    .map(c => ({ colKey: c, title: c, ellipsis: true, width: 150 }))}
                  rowKey="_idx"
                  size="small"
                  stripe
                  hover
                  bordered
                />
                {results.rows.length >= 200 && (
                  <p className="text-xs text-amber-400 text-center py-2">结果集过大，仅显示前 200 行。请使用导出功能获取完整数据。</p>
                )}
              </div>
            ) : (
              !error && <div className="p-8 text-center text-xs text-slate-500">输入 SQL 语句后点击"执行"</div>
            )}
          </div>

          {/* Table Info */}
          {tableInfo && (
            <div className="content-card overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--border-subtle)] text-xs text-slate-500">
                表结构 · {selectedTable} ({tableInfo.columns?.length || 0} 列)
              </div>
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                <Table
                  data={tableInfo.columns || []}
                  columns={[
                    { colKey: 'name', title: '列名', width: 150 },
                    { colKey: 'type', title: '类型', width: 120 },
                    { colKey: 'nullable', title: '可空', width: 60 },
                    { colKey: 'default_val', title: '默认值', width: 100 },
                    { colKey: 'key_type', title: '键', width: 60 },
                  ]}
                  rowKey="name" size="small" stripe hover bordered
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
