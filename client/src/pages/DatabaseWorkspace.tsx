import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Tag,
  MessagePlugin,
  Input,
  Table,
  Space,
  Popconfirm,
  Loading,
  Select,
} from 'tdesign-react';
import {
  PlayCircleIcon,
  DownloadIcon,
  RefreshIcon,
  FolderOpenIcon,
  SaveIcon,
  SearchIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  RootListIcon,
  TableIcon,
  ViewListIcon,
  CodeIcon,
  LinkIcon,
  AddIcon,
  ClearIcon,
  UploadIcon,
} from 'tdesign-icons-react';
import { assetService } from '../services/assetService';
import {
  databaseService,
  type DbObjects,
  type DbQueryResult,
  type DbTableInfo,
  type QueryHistoryItem,
  type SavedQueryItem,
  type DbSchema,
} from '../services/databaseService';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { SqlEditor } from '../components/SqlEditor';
import { DmcScrollTable } from '../components/DmcScrollTable';
import { DmcDataTransfer } from '../components/DmcDataTransfer';
import { getSqlToExecute } from '../utils/sqlStatement';
import type { editor } from 'monaco-editor';
import type { SafeAsset } from '../types';
import type { DbSession } from '../services/databaseService';

const DB_META: Record<string, { label: string; abbr: string; color: string; bg: string; tag: 'primary' | 'warning' | 'danger' }> = {
  mysql: { label: 'MySQL', abbr: 'MY', color: 'text-blue-400', bg: 'bg-blue-500/15', tag: 'primary' },
  postgresql: { label: 'PostgreSQL', abbr: 'PG', color: 'text-indigo-400', bg: 'bg-indigo-500/15', tag: 'primary' },
  mssql: { label: 'SQL Server', abbr: 'MS', color: 'text-orange-400', bg: 'bg-orange-500/15', tag: 'warning' },
};

const DbBadge: React.FC<{ dbType: string; size?: 'sm' | 'md' }> = ({ dbType, size = 'sm' }) => {
  const m = DB_META[dbType];
  if (!m) return <span className={`${size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5'} rounded-full shrink-0 bg-slate-500`} />;
  const dim = size === 'md' ? 'w-4 h-4 text-[9px]' : 'w-3.5 h-3.5 text-[8px]';
  return <span className={`inline-flex items-center justify-center ${dim} rounded ${m.bg} ${m.color} font-bold shrink-0`}>{m.abbr}</span>;
};

function quoteTable(name: string, dbType: string): string {
  if (dbType === 'mssql') return `[${name.replace(/]/g, ']]')}]`;
  if (dbType === 'postgresql') return `"${name.replace(/"/g, '""')}"`;
  return `\`${name.replace(/`/g, '``')}\``;
}

function previewSql(table: string, dbType: string): string {
  const q = quoteTable(table, dbType);
  if (dbType === 'mssql') return `SELECT TOP 100 * FROM ${q}`;
  return `SELECT * FROM ${q} LIMIT 100`;
}

function procedureSql(name: string, dbType: string): string {
  const q = quoteTable(name, dbType);
  if (dbType === 'mssql') return `-- 存储过程: ${name}\nEXEC ${q};`;
  if (dbType === 'postgresql') return `-- 存储过程: ${name}\nCALL ${q}();`;
  return `-- 存储过程: ${name}\nCALL ${q}();`;
}

type ResultTab = 'result' | 'structure' | 'ddl' | 'history' | 'saved' | 'sessions';
type TreeSection = 'tables' | 'views' | 'procedures';

function formatSql(sql: string): string {
  const keywords = [
    'SELECT', 'FROM', 'WHERE', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT',
    'INSERT INTO', 'UPDATE', 'DELETE FROM', 'SET', 'VALUES', 'LEFT JOIN',
    'RIGHT JOIN', 'INNER JOIN', 'JOIN', 'ON', 'AND', 'OR',
  ];
  let out = sql.trim();
  keywords.forEach((kw) => {
    const re = new RegExp(`\\b${kw}\\b`, 'gi');
    out = out.replace(re, `\n${kw.toUpperCase()}`);
  });
  return out.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n').trim();
}

function exportRows(rows: Record<string, unknown>[], columns: string[], format: 'csv' | 'json') {
  if (!rows.length) return;
  if (format === 'json') {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'query_result.json';
    a.click();
    return;
  }
  const header = '\uFEFF' + columns.join(',');
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const v = r[c] ?? '';
          return /[,"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
        })
        .join(',')
    )
    .join('\n');
  const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'query_result.csv';
  a.click();
}

// ── Instance list (Tencent Cloud style) ──

const InstanceList: React.FC<{
  assets: SafeAsset[];
  onOpen: (a: SafeAsset) => void;
  onRefresh: () => void;
  onAdd: () => void;
}> = ({ assets, onOpen, onRefresh, onAdd }) => {
  const [keyword, setKeyword] = useState('');
  const [testingId, setTestingId] = useState<number | null>(null);
  const [connStatus, setConnStatus] = useState<Record<number, 'ok' | 'fail'>>({});

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return assets;
    return assets.filter(
      (a) =>
        a.name.toLowerCase().includes(k) ||
        a.host.toLowerCase().includes(k) ||
        String((a as SafeAsset & { database_name?: string }).database_name || '').toLowerCase().includes(k)
    );
  }, [assets, keyword]);

  const testConn = async (a: SafeAsset) => {
    setTestingId(a.id);
    try {
      const res = await databaseService.testConnection(a.id);
      if (res.code === 0 && res.data?.success) {
        setConnStatus((s) => ({ ...s, [a.id]: 'ok' }));
        MessagePlugin.success(`${a.name} 连接成功`);
      } else {
        setConnStatus((s) => ({ ...s, [a.id]: 'fail' }));
        MessagePlugin.error(res.message || '连接失败');
      }
    } catch (err: unknown) {
      setConnStatus((s) => ({ ...s, [a.id]: 'fail' }));
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      MessagePlugin.error(msg || '连接失败');
    } finally {
      setTestingId(null);
    }
  };

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    assets.forEach((a) => {
      const t = (a as SafeAsset & { db_type?: string }).db_type || 'unknown';
      c[t] = (c[t] || 0) + 1;
    });
    return c;
  }, [assets]);

  const columns = [
    {
      colKey: 'name',
      title: '实例名称',
      width: 180,
      cell: ({ row }: { row: SafeAsset }) => (
        <div className="flex items-center gap-2 min-w-0">
          <DbBadge dbType={(row as SafeAsset & { db_type?: string }).db_type || ''} />
          <span className="font-medium text-[var(--text-primary)] truncate">{row.name}</span>
        </div>
      ),
    },
    {
      colKey: 'db_type',
      title: '引擎',
      width: 110,
      cell: ({ row }: { row: SafeAsset }) => {
        const t = (row as SafeAsset & { db_type?: string }).db_type || '';
        const meta = DB_META[t];
        return <Tag theme={meta?.tag || 'default'} variant="light" size="small">{meta?.label || t}</Tag>;
      },
    },
    {
      colKey: 'address',
      title: '连接地址',
      ellipsis: true,
      cell: ({ row }: { row: SafeAsset }) => (
        <code className="text-xs text-cyan-400/90">
          {row.host}:{row.port}/{(row as SafeAsset & { database_name?: string }).database_name}
        </code>
      ),
    },
    {
      colKey: 'status',
      title: '状态',
      width: 90,
      cell: ({ row }: { row: SafeAsset }) => {
        const st = connStatus[row.id];
        if (st === 'ok') return <Tag theme="success" variant="light" size="small">已连通</Tag>;
        if (st === 'fail') return <Tag theme="danger" variant="light" size="small">异常</Tag>;
        return <Tag variant="light" size="small">未检测</Tag>;
      },
    },
    {
      colKey: 'actions',
      title: '操作',
      width: 200,
      cell: ({ row }: { row: SafeAsset }) => (
        <Space size="small">
          <Button theme="primary" variant="text" size="small" onClick={() => onOpen(row)}>
            SQL 窗口
          </Button>
          <Button
            variant="text"
            size="small"
            loading={testingId === row.id}
            onClick={() => testConn(row)}
          >
            测试连接
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="page-content">
      <PageHeader title="数据库管理" description="DMC 数据管理 — SQL 查询、库表浏览、数据导出">
        <Space>
          <Button variant="outline" icon={<RefreshIcon />} onClick={onRefresh}>
            刷新
          </Button>
          <Button theme="primary" icon={<AddIcon />} onClick={onAdd}>
            新建实例
          </Button>
        </Space>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
        <StatCard title="实例总数" value={assets.length} icon={<RootListIcon size="20px" />} accent="cyan" />
        <StatCard title="MySQL" value={typeCounts.mysql || 0} icon={<TableIcon size="20px" />} accent="blue" />
        <StatCard title="PostgreSQL" value={typeCounts.postgresql || 0} icon={<ViewListIcon size="20px" />} accent="green" />
        <StatCard title="SQL Server" value={typeCounts.mssql || 0} icon={<CodeIcon size="20px" />} accent="red" />
      </div>

      <div className="content-card overflow-hidden dmc-instance-table">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
          <span className="text-sm font-medium text-[var(--text-primary)]">实例列表</span>
          <Input
            prefixIcon={<SearchIcon />}
            placeholder="搜索实例名称、地址、库名"
            value={keyword}
            onChange={setKeyword}
            clearable
            style={{ width: 280 }}
          />
        </div>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<FolderOpenIcon size="22px" className="text-slate-500" />}
            title={assets.length === 0 ? '暂无数据库实例' : '无匹配结果'}
            description={
              assets.length === 0
                ? '请先在资产管理中注册数据库类型的资产'
                : '尝试调整搜索关键词'
            }
            actionText={assets.length === 0 ? '去添加' : undefined}
            onAction={assets.length === 0 ? onAdd : undefined}
          />
        ) : (
          <Table data={filtered} columns={columns} rowKey="id" hover stripe size="small" />
        )}
      </div>
    </div>
  );
};

// ── Object tree ──

const ObjectTree: React.FC<{
  dbName: string;
  objects: DbObjects | null;
  loading: boolean;
  filter: string;
  selectedTable: string | null;
  expanded: Record<TreeSection, boolean>;
  onToggle: (s: TreeSection) => void;
  onSelectTable: (name: string, action: 'preview' | 'structure') => void;
  onSelectObject: (name: string, type: 'view' | 'procedure') => void;
}> = ({
  dbName,
  objects,
  loading,
  filter,
  selectedTable,
  expanded,
  onToggle,
  onSelectTable,
  onSelectObject,
}) => {
  const match = (name: string) => !filter || name.toLowerCase().includes(filter.toLowerCase());

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loading size="small" />
      </div>
    );
  }

  if (!objects) {
    return <p className="text-xs text-slate-500 text-center py-6">加载对象中...</p>;
  }

  const sections: { key: TreeSection; label: string; icon: React.ReactNode; items: string[] }[] = [
    { key: 'tables', label: '表', icon: <TableIcon size="14px" />, items: objects.tables.filter(match) },
    { key: 'views', label: '视图', icon: <ViewListIcon size="14px" />, items: objects.views.filter(match) },
    { key: 'procedures', label: '可编程对象', icon: <CodeIcon size="14px" />, items: objects.procedures.filter(match) },
  ];

  return (
    <div className="flex-1 overflow-y-auto py-1">
      <div className="dmc-tree-node font-medium text-slate-400 px-2">
        <FolderOpenIcon size="14px" />
        <span className="truncate">{dbName}</span>
      </div>
      {sections.map((sec) => (
        <div key={sec.key}>
          <div className="dmc-tree-node" onClick={() => onToggle(sec.key)}>
            {expanded[sec.key] ? <ChevronDownIcon size="14px" /> : <ChevronRightIcon size="14px" />}
            {sec.icon}
            <span>{sec.label}</span>
            <span className="text-slate-600 ml-auto text-[10px]">{sec.items.length}</span>
          </div>
          {expanded[sec.key] && (
            <div className="dmc-tree-children">
              {sec.items.length === 0 ? (
                <p className="text-[10px] text-slate-600 px-2 py-1">无</p>
              ) : (
                sec.items.map((name) => (
                  <div
                    key={name}
                    className={`dmc-tree-node ${selectedTable === name ? 'dmc-tree-node--active' : ''}`}
                    onClick={() =>
                      sec.key === 'tables'
                        ? onSelectTable(name, 'preview')
                        : onSelectObject(name, sec.key === 'views' ? 'view' : 'procedure')
                    }
                    onDoubleClick={() => sec.key === 'tables' && onSelectTable(name, 'structure')}
                    title={sec.key === 'tables' ? '单击预览数据，双击查看结构' : undefined}
                  >
                    <span className="w-3.5" />
                    <span className="truncate">{name}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ── DMC Workspace ──

const DmcWorkspace: React.FC<{
  assets: SafeAsset[];
  selected: SafeAsset;
  onBack: () => void;
  onSwitch: (a: SafeAsset) => void;
}> = ({ assets, selected, onBack, onSwitch }) => {
  const dbType = (selected as SafeAsset & { db_type?: string }).db_type || '';
  const dbName = (selected as SafeAsset & { database_name?: string }).database_name || '';

  const [sql, setSql] = useState('SELECT 1;');
  const [results, setResults] = useState<DbQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [objects, setObjects] = useState<DbObjects | null>(null);
  const [objectsLoading, setObjectsLoading] = useState(false);
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>(dbName);
  const [treeFilter, setTreeFilter] = useState('');
  const [expanded, setExpanded] = useState<Record<TreeSection, boolean>>({
    tables: true,
    views: false,
    procedures: false,
  });
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableInfo, setTableInfo] = useState<DbTableInfo | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>('result');
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);
  const [savedQueries, setSavedQueries] = useState<SavedQueryItem[]>([]);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [connOk, setConnOk] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<DbSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [killingId, setKillingId] = useState<number | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [schema, setSchema] = useState<DbSchema | null>(null);
  const [schemaDegraded, setSchemaDegraded] = useState(false);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const selectedDbRef = useRef(selectedDb);
  selectedDbRef.current = selectedDb;

  const loadDatabases = useCallback(async () => {
    try {
      const res = await databaseService.listDatabases(selected.id);
      if (res.code === 0 && res.data) {
        setDatabases(res.data);
        // Auto-select only when nothing is selected yet
        if (!selectedDbRef.current) {
          if (res.data.length === 1) {
            setSelectedDb(res.data[0]);
          } else if (dbName && res.data.includes(dbName)) {
            setSelectedDb(dbName);
          }
        }
      }
    } catch { /* ignore */ }
  }, [selected.id, dbName]);

  const loadObjects = useCallback(async () => {
    if (!selectedDb) return;
    setObjectsLoading(true);
    try {
      const res = await databaseService.getObjects(selected.id, selectedDb);
      if (res.code === 0 && res.data) setObjects(res.data);
    } catch {
      MessagePlugin.error('加载对象列表失败');
    } finally {
      setObjectsLoading(false);
    }
  }, [selected.id, selectedDb]);

  const loadSchema = useCallback(async () => {
    if (!selectedDb) return;
    try {
      const res = await databaseService.getSchema(selected.id, selectedDb);
      if (res.code === 0 && res.data) {
        setSchema(res.data);
        setSchemaDegraded(false);
      }
    } catch {
      setSchemaDegraded(true);
    }
  }, [selected.id, selectedDb]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await databaseService.getHistory();
      if (res.code === 0 && res.data) setHistory(res.data);
    } catch { /* ignore */ }
  }, []);

  const loadSaved = useCallback(async () => {
    try {
      const res = await databaseService.getSavedQueries();
      if (res.code === 0 && res.data) setSavedQueries(res.data);
    } catch { /* ignore */ }
  }, []);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await databaseService.getSessions(selected.id);
      if (res.code === 0 && res.data) setSessions(res.data);
    } catch {
      MessagePlugin.error('加载会话列表失败');
    } finally {
      setSessionsLoading(false);
    }
  }, [selected.id]);

  const killSession = async (sessionId: number) => {
    setKillingId(sessionId);
    try {
      const res = await databaseService.killSession(selected.id, sessionId);
      if (res.code === 0) {
        MessagePlugin.success('会话已终止');
        loadSessions();
      } else {
        MessagePlugin.error(res.message || '操作失败');
      }
    } catch {
      MessagePlugin.error('终止会话失败');
    } finally {
      setKillingId(null);
    }
  };

  useEffect(() => {
    loadDatabases();
    loadObjects();
    loadSchema();
    loadHistory();
    loadSaved();
    setResults(null);
    setError(null);
    setTableInfo(null);
    setSelectedTable(null);
    setConnOk(null);
  }, [selected.id, loadDatabases, loadObjects, loadSchema, loadHistory, loadSaved, selectedDb]);

  const runExecute = () => {
    const sqlToExec = getSqlToExecute(editorRef.current, sql);
    if (!sqlToExec) {
      MessagePlugin.warning('请输入 SQL');
      return;
    }
    execute(sqlToExec);
  };

  const execute = async (forceSql?: string) => {
    const sqlToExec = (forceSql ?? sql).trim().replace(/;+$/, '');
    if (!sqlToExec) {
      MessagePlugin.warning('请输入 SQL');
      return;
    }
    setExecuting(true);
    setError(null);
    setResults(null);
    setResultTab('result');
    try {
      const res = await databaseService.execute(selected.id, sqlToExec, selectedDb);
      if (res.code === 0 && res.data) {
        setResults(res.data);
        loadHistory();
      } else {
        setError(res.message || '执行失败');
        loadHistory();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || '执行失败');
      loadHistory();
    } finally {
      setExecuting(false);
    }
  };

  const loadTableInfo = async (name: string) => {
    try {
      const res = await databaseService.getTableInfo(selected.id, name, selectedDb);
      if (res.code === 0 && res.data) {
        setTableInfo(res.data);
        setResultTab('structure');
      }
    } catch {
      MessagePlugin.warning('无法加载表结构');
    }
  };

  const handleSelectTable = (name: string, action: 'preview' | 'structure') => {
    setSelectedTable(name);
    if (action === 'preview') {
      setSql(previewSql(name, dbType));
      setResultTab('result');
      loadTableInfo(name);
    } else {
      loadTableInfo(name);
    }
  };

  const handleSave = async () => {
    if (!saveName.trim()) {
      MessagePlugin.warning('请输入查询名称');
      return;
    }
    try {
      const res = await databaseService.saveQuery({
        name: saveName.trim(),
        query_text: sql,
        asset_id: selected.id,
      });
      if (res.code === 0) {
        MessagePlugin.success('已保存');
        setShowSaveInput(false);
        setSaveName('');
        loadSaved();
      } else {
        MessagePlugin.error(res.message || '保存失败');
      }
    } catch {
      MessagePlugin.error('保存失败');
    }
  };

  const testConn = async () => {
    try {
      const res = await databaseService.testConnection(selected.id);
      const ok = res.code === 0 && !!res.data?.success;
      setConnOk(ok);
      MessagePlugin[ok ? 'success' : 'error'](ok ? '连接正常' : res.message || '连接失败');
    } catch {
      setConnOk(false);
      MessagePlugin.error('连接失败');
    }
  };

  const assetHistory = history.filter((h) => h.asset_id === selected.id);
  const assetSaved = savedQueries.filter((s) => !s.asset_id || s.asset_id === selected.id);

  const resultColumns = useMemo(() => {
    if (!results) return [];
    const rowKeys = results.rows[0] ? Object.keys(results.rows[0]) : [];
    if (rowKeys.length > 0) return rowKeys;
    return results.columns;
  }, [results]);

  const scrollResultColumns = useMemo(
    () =>
      resultColumns.map((c) => ({
        key: c,
        title: c,
        width: Math.min(Math.max(String(c).length * 9 + 40, 120), 260),
      })),
    [resultColumns],
  );

  const resultTabs: { key: ResultTab; label: string }[] = [
    { key: 'result', label: '执行结果' },
    { key: 'structure', label: '表结构' },
    { key: 'ddl', label: 'DDL' },
    { key: 'sessions', label: `实时会话 (${sessions.length})` },
    { key: 'history', label: `执行历史 (${assetHistory.length})` },
    { key: 'saved', label: `已保存 (${assetSaved.length})` },
  ];

  return (
    <div className="dmc-workspace">
      <div className="dmc-topbar">
        <div className="dmc-topbar-left">
          <Button variant="text" size="small" onClick={onBack}>
            ← 实例列表
          </Button>
          <DbBadge dbType={dbType} size="md" />
          <span className="text-sm font-semibold text-slate-100 truncate">{selected.name}</span>
          <code className="text-xs text-slate-500 hidden sm:inline truncate">
            {selected.host}:{selected.port}/{dbName}
          </code>
          {connOk === true && <Tag theme="success" variant="light" size="small">已连接</Tag>}
          {connOk === false && <Tag theme="danger" variant="light" size="small">连接异常</Tag>}
        </div>
        <div className="dmc-topbar-right">
          <Select
            value={selected.id}
            onChange={(val) => {
              const a = assets.find((x) => x.id === (val as number));
              if (a) onSwitch(a);
            }}
            options={assets.map((a) => ({
              label: a.name,
              value: a.id,
              content: (
                <div className="flex items-center gap-2 min-w-0">
                  <DbBadge dbType={(a as SafeAsset & { db_type?: string }).db_type || ''} />
                  <span className="truncate">{a.name}</span>
                  <code className="text-[10px] text-slate-500 ml-auto shrink-0 hidden sm:inline truncate">{a.host}</code>
                </div>
              ),
            }))}
            filterable
            placeholder="选择实例"
            size="small"
            style={{ width: 180 }}
            popupProps={{ overlayStyle: { maxWidth: 300 } }}
          />
          <Select
            value={selectedDb || undefined}
            onChange={(val) => setSelectedDb(val as string)}
            options={databases.map((d) => ({ label: d, value: d }))}
            filterable
            placeholder="选择数据库"
            size="small"
            style={{ width: 160 }}
            empty="暂无数据库"
          />
          <Button variant="outline" size="small" icon={<LinkIcon />} onClick={testConn}>
            测试连接
          </Button>
          <Button variant="outline" size="small" icon={<RefreshIcon />} onClick={loadObjects}>
            刷新对象
          </Button>
        </div>
      </div>

      {schemaDegraded && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs">
          <span>⚠ 表名/字段名提示暂时不可用（元数据加载失败），关键字和函数补全仍可用</span>
          <Button variant="text" size="small" theme="warning" onClick={() => { setSchemaDegraded(false); if (selectedDb) loadSchema(); }}>
            重试
          </Button>
        </div>
      )}

      <div className="dmc-body">
        <div className="dmc-sidebar">
          <div className="px-2 py-2 border-b border-[var(--border-subtle)]">
            <Input
              size="small"
              prefixIcon={<SearchIcon />}
              placeholder="过滤对象"
              value={treeFilter}
              onChange={setTreeFilter}
              clearable
            />
          </div>
          <ObjectTree
            dbName={dbName}
            objects={objects}
            loading={objectsLoading}
            filter={treeFilter}
            selectedTable={selectedTable}
            expanded={expanded}
            onToggle={(s) => setExpanded((e) => ({ ...e, [s]: !e[s] }))}
            onSelectTable={handleSelectTable}
            onSelectObject={(name, type) => {
              setSelectedTable(name);
              const q =
                type === 'view'
                  ? previewSql(name, dbType)
                  : procedureSql(name, dbType);
              setSql(q);
            }}
          />
        </div>

        <div className="dmc-main">
          <div className="dmc-editor-section">
            <div className="dmc-editor-toolbar">
              <span className="dmc-toolbar-label">SQL 窗口</span>
              <div className="dmc-toolbar-actions">
                {showSaveInput ? (
                  <>
                    <Input
                      size="small"
                      value={saveName}
                      onChange={setSaveName}
                      placeholder="查询名称"
                      style={{ width: 120 }}
                      onEnter={handleSave}
                    />
                    <Button size="small" onClick={handleSave}>
                      确定
                    </Button>
                    <Button variant="text" size="small" onClick={() => setShowSaveInput(false)}>
                      取消
                    </Button>
                  </>
                ) : (
                  <Button variant="text" size="small" icon={<SaveIcon />} onClick={() => setShowSaveInput(true)}>
                    保存
                  </Button>
                )}
                <Button variant="text" size="small" icon={<UploadIcon />} onClick={() => setTransferOpen(true)}>
                  导入/导出
                </Button>
                <Button variant="text" size="small" icon={<ClearIcon />} onClick={() => setSql('')}>
                  清空
                </Button>
                <Button variant="text" size="small" onClick={() => setSql(formatSql(sql))}>
                  格式化
                </Button>
                <Button
                  theme="primary"
                  size="small"
                  icon={<PlayCircleIcon />}
                  loading={executing}
                  onClick={runExecute}
                >
                  执行
                </Button>
              </div>
            </div>
            <div className="dmc-editor-body">
              <SqlEditor
                value={sql}
                onChange={setSql}
                onExecute={execute}
                dbType={dbType}
                schema={schema}
                height={200}
                onMount={(ed) => { editorRef.current = ed; }}
              />
            </div>
            <p className="dmc-editor-hint">Ctrl+Enter 执行 · 选中区域执行选中 SQL · 未选中时执行光标所在语句</p>
          </div>

          {transferOpen && objects && (
            <DmcDataTransfer
              visible={transferOpen}
              assetId={selected.id}
              tables={objects.tables || []}
              defaultTable={selectedTable || undefined}
              onClose={() => setTransferOpen(false)}
            />
          )}

          <div className="dmc-result-panel">
            <div className="dmc-tabs-wrap">
              <div className="dmc-tabs">
              {resultTabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`dmc-tab ${resultTab === t.key ? 'dmc-tab--active' : ''}`}
                  onClick={() => {
                    setResultTab(t.key);
                    if (t.key === 'history') loadHistory();
                    if (t.key === 'saved') loadSaved();
                    if (t.key === 'sessions') loadSessions();
                  }}
                >
                  {t.label}
                </button>
              ))}
              {resultTab === 'result' && results?.rows?.length ? (
                <div className="ml-auto flex items-center gap-1 pr-2">
                  <span className="text-[10px] text-slate-500 mr-2">
                    {results.rowCount} 行 · {results.durationMs}ms
                  </span>
                  <Button
                    variant="text"
                    size="small"
                    icon={<DownloadIcon />}
                    onClick={() => exportRows(results.rows, resultColumns, 'csv')}
                  >
                    CSV
                  </Button>
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => exportRows(results.rows, resultColumns, 'json')}
                  >
                    JSON
                  </Button>
                </div>
              ) : null}
              </div>
            </div>

            <div className="dmc-result-body">
              {resultTab === 'result' && (
                <>
                  {error && (
                    <div className="p-4 text-sm text-red-400 font-mono whitespace-pre-wrap">{error}</div>
                  )}
                  {results ? (
                    results.rows?.length ? (
                    <div className="dmc-result-table-area">
                      <DmcScrollTable
                        columns={scrollResultColumns}
                        rows={results.rows}
                      />
                      {results.rows.length >= 200 && (
                        <p className="dmc-result-footnote text-xs text-amber-400 text-center py-2">
                          结果集超过 1000 行，仅显示前 1000 行
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="p-10 text-center text-xs text-slate-400">
                      {resultColumns.length > 0 ? (
                        <>
                          <div className="mb-2 text-slate-500">
                            {resultColumns.map((c) => (
                              <span key={c} className="inline-block px-2 py-0.5 mx-0.5 border border-[var(--border-subtle)] rounded text-[10px] font-mono">{c}</span>
                            ))}
                          </div>
                          <span>查询成功，返回 0 行 · {results.durationMs}ms</span>
                        </>
                      ) : (
                        <span>查询成功，返回 0 行 · {results.durationMs}ms</span>
                      )}
                    </div>
                  )) : (
                    !error && (
                      <div className="p-10 text-center text-xs text-slate-500">
                        在左侧选择表或输入 SQL 后执行
                      </div>
                    )
                  )}
                </>
              )}

              {resultTab === 'structure' && (
                tableInfo?.columns?.length ? (
                  <div className="dmc-result-table-area">
                    <DmcScrollTable
                      columns={[
                      { key: 'name', title: '列名', width: 150 },
                      { key: 'type', title: '类型', width: 130 },
                      { key: 'nullable', title: '可空', width: 70 },
                      { key: 'key_type', title: '键', width: 70 },
                      { key: 'default_val', title: '默认值', width: 220 },
                    ]}
                    rows={tableInfo.columns}
                    rowKey="name"
                  />
                  </div>
                ) : (
                  <div className="p-10 text-center text-xs text-slate-500">
                    {selectedTable ? '该表暂无结构信息' : '请在左侧选择一张表'}
                  </div>
                )
              )}

              {resultTab === 'ddl' && (
                tableInfo?.ddl ? (
                  <div className="dmc-result-scroll-pane">
                    <pre className="dmc-ddl-block">{tableInfo.ddl}</pre>
                  </div>
                ) : (
                  <div className="dmc-result-empty">
                    {selectedTable ? '暂无 DDL' : '请在左侧选择一张表后查看 DDL'}
                  </div>
                )
              )}

              {resultTab === 'sessions' && (
                <div className="dmc-result-sessions">
                  <div className="dmc-result-sessions-bar">
                    <span className="text-xs text-slate-500">当前数据库活跃连接</span>
                    <Button
                      variant="text"
                      size="small"
                      icon={<RefreshIcon />}
                      loading={sessionsLoading}
                      onClick={loadSessions}
                    >
                      刷新
                    </Button>
                  </div>
                  {sessionsLoading && sessions.length === 0 ? (
                    <div className="flex justify-center py-8">
                      <Loading size="small" />
                    </div>
                  ) : sessions.length > 0 ? (
                    <DmcScrollTable<DbSession>
                      columns={[
                        { key: 'id', title: 'ID', width: 70 },
                        { key: 'user', title: '用户', width: 90 },
                        { key: 'host', title: '来源', width: 140 },
                        { key: 'command', title: '状态', width: 90 },
                        { key: 'time', title: '时长(s)', width: 80 },
                        { key: 'query', title: '当前 SQL', width: 320 },
                        {
                          key: 'actions',
                          title: '操作',
                          width: 80,
                          render: (row) => (
                            <Popconfirm
                              content={`确认终止会话 #${row.id}？`}
                              onConfirm={() => killSession(row.id)}
                            >
                              <Button
                                variant="text"
                                size="small"
                                theme="danger"
                                loading={killingId === row.id}
                              >
                                Kill
                              </Button>
                            </Popconfirm>
                          ),
                        },
                      ]}
                      rows={sessions}
                      rowKey="id"
                    />
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-8">暂无活跃会话</p>
                  )}
                </div>
              )}

              {resultTab === 'history' && (
                <div className="dmc-result-scroll-pane">
                  {assetHistory.length === 0 ? (
                    <p className="dmc-result-empty">暂无执行历史</p>
                  ) : (
                    <div className="dmc-history-list">
                      {assetHistory.map((h) => (
                        <div
                          key={h.id}
                          className="dmc-history-item"
                          onClick={() => {
                            if (typeof h.query_text === 'string' && h.query_text) {
                              setSql(h.query_text);
                              setResultTab('result');
                            }
                          }}
                        >
                          <pre className="dmc-history-sql">{h.query_text}</pre>
                          <p className="dmc-history-meta">
                            <span className={h.status === 'success' ? 'text-emerald-400' : 'text-red-400'}>
                              {h.status === 'success' ? '成功' : '失败'}
                            </span>
                            {h.status === 'success' ? (
                              <span>{` · ${h.row_count ?? 0} 行 · ${h.duration_ms}ms`}</span>
                            ) : (
                              h.error_message ? (
                                <span className="dmc-history-error">{` · ${h.error_message}`}</span>
                              ) : null
                            )}
                            <span className="dmc-history-time">{h.executed_at}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {resultTab === 'saved' && (
                <div className="dmc-result-scroll-pane">
                  {assetSaved.length === 0 ? (
                    <p className="dmc-result-empty">暂无保存的查询</p>
                  ) : (
                    <div className="dmc-history-list">
                      {assetSaved.map((s) => (
                        <div key={s.id} className="dmc-history-item dmc-history-item--saved">
                          <div className="dmc-saved-head">
                            <span
                              className="dmc-saved-name"
                              onClick={() => {
                                setSql(s.query_text);
                                setResultTab('result');
                              }}
                            >
                              {s.name}
                            </span>
                            <Popconfirm content="删除此查询？" onConfirm={async () => {
                              await databaseService.deleteSavedQuery(s.id);
                              loadSaved();
                            }}>
                              <Button variant="text" size="small" theme="danger">
                                删除
                              </Button>
                            </Popconfirm>
                          </div>
                          <pre
                            className="dmc-history-sql"
                            onClick={() => {
                              setSql(s.query_text);
                              setResultTab('result');
                            }}
                          >
                            {s.query_text}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main export ──

export const DatabaseWorkspace: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [assets, setAssets] = useState<SafeAsset[]>([]);
  const [selected, setSelected] = useState<SafeAsset | null>(null);

  const loadAssets = useCallback(async () => {
    try {
      const res = await assetService.getList({ pageSize: 200 });
      if (res.code === 0 && res.data) {
        const list = res.data.list.filter((a: SafeAsset) => (a as SafeAsset & { asset_type?: string }).asset_type === 'database');
        setAssets(list);
        return list;
      }
    } catch { /* ignore */ }
    return [];
  }, []);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    if (id && assets.length) {
      const a = assets.find((x) => x.id === parseInt(id, 10));
      if (a) setSelected(a);
    } else if (!id) {
      setSelected(null);
    }
  }, [id, assets]);

  const openAsset = (a: SafeAsset) => {
    setSelected(a);
    navigate(`/database/${a.id}`);
  };

  if (!id || !selected) {
    return (
      <InstanceList
        assets={assets}
        onOpen={openAsset}
        onRefresh={loadAssets}
        onAdd={() => navigate('/assets')}
      />
    );
  }

  return (
    <DmcWorkspace
      assets={assets}
      selected={selected}
      onBack={() => navigate('/database')}
      onSwitch={openAsset}
    />
  );
};
