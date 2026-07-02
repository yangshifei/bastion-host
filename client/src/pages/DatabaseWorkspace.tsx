import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Tag, MessagePlugin, Input, Textarea, Table, Space, Popconfirm, Select } from 'tdesign-react';
import { PlayCircleIcon, DownloadIcon, RefreshIcon, FolderOpenIcon, SaveIcon, AddIcon, DeleteIcon } from 'tdesign-icons-react';
import { assetService } from '../services/assetService';
import api from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import type { SafeAsset } from '../types';

const DB_COLORS: Record<string, string> = { mysql: 'bg-blue-500', postgresql: 'bg-indigo-500', mssql: 'bg-red-500' };

export const DatabaseWorkspace: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [assets, setAssets] = useState<SafeAsset[]>([]);
  const [selected, setSelected] = useState<SafeAsset | null>(null);
  const [sql, setSql] = useState('SELECT 1');
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [objects, setObjects] = useState<any>(null);
  const [tableInfo, setTableInfo] = useState<any>(null);

  useEffect(() => { loadAssets(); }, []);
  useEffect(() => {
    if (id) {
      const a = assets.find(a => a.id === parseInt(id));
      if (a) selectAsset(a);
    }
  }, [id, assets]);

  const loadAssets = async () => {
    try {
      const res = await assetService.getList({ pageSize: 200 });
      if (res.code === 0 && res.data) {
        setAssets(res.data.list.filter((a: any) => a.asset_type === 'database'));
      }
    } catch { /* ignore */ }
  };

  const selectAsset = async (a: SafeAsset) => {
    setSelected(a);
    navigate(`/database/${a.id}`, { replace: true });
    setResults(null); setError(null); setObjects(null);
    try {
      const res = await api.get(`/database/${a.id}/objects`).then(r => r.data);
      if (res.code === 0) setObjects(res.data);
    } catch { /* ignore */ }
  };

  const execute = async () => {
    if (!sql.trim() || !selected) return;
    setLoading(true); setError(null); setResults(null);
    try {
      const res = await api.post(`/database/${selected.id}/execute`, { sql }).then(r => r.data);
      if (res.code === 0) setResults(res.data);
      else setError(res.message);
    } catch (err: any) { setError(err.response?.data?.message || err.message); }
    finally { setLoading(false); }
  };

  const exportCsv = () => {
    if (!results?.rows?.length) return;
    const cols = results.columns.length ? results.columns : Object.keys(results.rows[0] || {});
    const header = '﻿' + cols.join(',');
    const body = results.rows.map((r: any) => cols.map((c: string) => {
      const v = r[c] ?? '';
      return /[,"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    }).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'query_result.csv'; a.click();
  };

  const handleTableClick = async (name: string) => {
    if (!selected) return;
    try {
      const res = await api.get(`/database/${selected.id}/table/${name}`).then(r => r.data);
      if (res.code === 0) setTableInfo(res.data);
    } catch { /* ignore */ }
  };

  if (!id) {
    return (
      <div>
        <PageHeader title="数据库管理" description="SQL 查询、表结构浏览、数据导出" />
        <div className="content-card">
          {assets.length === 0 ? (
            <EmptyState title="暂无数据库资产" description="请先在资产管理中添加数据库类型的资产"
              actionText="添加资产" onAction={() => navigate('/assets')} />
          ) : (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {assets.map(a => (
                <button key={a.id} onClick={() => navigate(`/database/${a.id}`)}
                  className="text-left p-4 rounded-xl border border-[var(--border-subtle)] hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all">
                  <div className="flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full shrink-0 ${DB_COLORS[(a as any).db_type] || 'bg-slate-500'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{a.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {(a as any).db_type?.toUpperCase()} · {a.host}:{a.port} / {(a as any).database_name}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-52px)] min-h-0">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border-subtle)] shrink-0 bg-[var(--bg-surface)]">
        <Button variant="outline" size="small" onClick={() => navigate('/database')}>← 返回</Button>
        {selected && (
          <>
            <span className={`w-2 h-2 rounded-full ${DB_COLORS[(selected as any).db_type] || 'bg-slate-500'}`} />
            <span className="text-sm font-medium text-slate-200">{selected.name}</span>
            <span className="text-xs text-slate-500">{(selected as any).db_type?.toUpperCase()} · {selected.host}:{selected.port} / {(selected as any).database_name}</span>
          </>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: Connection list + Object tree */}
        <div className="w-56 border-r border-[var(--border-subtle)] flex flex-col shrink-0 bg-[var(--bg-surface)]">
          <div className="p-2 text-xs font-medium text-slate-400 border-b border-[var(--border-subtle)]">数据源</div>
          <div className="flex-1 overflow-y-auto p-1">
            {assets.map(a => (
              <div key={a.id} onClick={() => selectAsset(a)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs ${selected?.id === a.id ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-400 hover:bg-[var(--bg-elevated)]'}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DB_COLORS[(a as any).db_type] || 'bg-slate-500'}`} />
                <span className="truncate">{a.name}</span>
              </div>
            ))}
          </div>

          {objects && (
            <>
              <div className="p-2 text-xs font-medium text-slate-400 border-b border-[var(--border-subtle)]">对象</div>
              <div className="flex-1 overflow-y-auto p-1">
                {objects.tables?.slice(0, 50).map((t: string) => (
                  <div key={t} onClick={() => handleTableClick(t)}
                    className="px-2 py-1 text-xs cursor-pointer rounded text-slate-400 hover:bg-[var(--bg-elevated)]">
                    📄 {t}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right: Editor + Results */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* SQL Editor */}
          <div className="border-b border-[var(--border-subtle)] shrink-0">
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-xs text-slate-500 font-mono">SQL</span>
              <Space size="small">
                <Button theme="primary" size="small" icon={<PlayCircleIcon />} loading={loading} onClick={execute}>
                  执行 (Ctrl+Enter)
                </Button>
              </Space>
            </div>
            <textarea
              value={sql}
              onChange={e => setSql(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); execute(); } }}
              className="w-full h-28 bg-[var(--bg-deep)] text-sm text-slate-200 font-mono p-3 outline-none resize-none border-0"
              placeholder="SELECT * FROM ..."
            />
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto min-h-0">
            {error && <div className="p-4 text-sm text-red-400 font-mono">{error}</div>}
            {results?.rows?.length ? (
              <>
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-subtle)]">
                  <span className="text-xs text-slate-500">{results.rowCount} 行 · {results.durationMs}ms</span>
                  <Button variant="text" size="small" icon={<DownloadIcon />} onClick={exportCsv}>CSV</Button>
                </div>
                <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 380px)' }}>
                  <Table data={results.rows.slice(0, 200).map((r: any, i: number) => ({ ...r, _idx: i }))}
                    columns={(results.columns.length ? results.columns : Object.keys(results.rows[0] || {})).map((c: string) => ({ colKey: c, title: c, ellipsis: true, width: 150 }))}
                    rowKey="_idx" size="small" stripe hover bordered />
                </div>
              </>
            ) : !error && (
              <div className="p-8 text-center text-xs text-slate-500">输入 SQL 后点击执行</div>
            )}

            {/* Table Info */}
            {tableInfo && (
              <div className="border-t border-[var(--border-subtle)]">
                <div className="px-3 py-1.5 text-xs text-slate-500 border-b border-[var(--border-subtle)]">
                  列定义 ({tableInfo.columns?.length || 0} 列)
                </div>
                <div className="overflow-auto" style={{ maxHeight: 160 }}>
                  <Table data={tableInfo.columns || []}
                    columns={[
                      { colKey: 'name', title: '列名', width: 140 },
                      { colKey: 'type', title: '类型', width: 120 },
                      { colKey: 'nullable', title: '可空', width: 60 },
                      { colKey: 'default_val', title: '默认值', width: 100 },
                    ]}
                    rowKey="name" size="small" stripe bordered />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
