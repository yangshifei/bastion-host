import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Table,
  Button,
  Tag,
  Space,
  DateRangePicker,
  Select,
  Input,
  MessagePlugin,
} from 'tdesign-react';
import type { DateRangeValue } from 'tdesign-react';
import {
  DownloadIcon,
  RefreshIcon,
  SearchIcon,
  ErrorCircleIcon,
  FileIcon,
  SecuredIcon,
  BrowseIcon,
  TerminalIcon,
} from 'tdesign-icons-react';
import { auditService } from '../services/auditService';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/EmptyState';
import { usePagination } from '../hooks/usePagination';
import { useRequestGuard } from '../hooks/useRequestGuard';
import type { AuditLog as AuditLogEntry } from '../types';
import type { AuditStats, CommandLogEntry } from '../services/auditService';
import {
  ACTION_LABELS,
  ACTION_THEMES,
  TARGET_TYPE_LABELS,
  RISK_LEVEL_LABELS,
  RISK_LEVEL_THEMES,
  formatDateTime,
} from '../utils/auditLabels';

const ACTION_OPTIONS = Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }));
const TARGET_OPTIONS = Object.entries(TARGET_TYPE_LABELS).map(([value, label]) => ({ value, label }));

export const AuditLog: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'operations' | 'commands'>('operations');
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [commands, setCommands] = useState<CommandLogEntry[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [username, setUsername] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>([]);
  const [dangerousOnly, setDangerousOnly] = useState(false);

  const opsPag = usePagination();
  const cmdPag = usePagination();
  const { begin, isLatest } = useRequestGuard();
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const buildQuery = useCallback(
    (page: number, pageSize: number) => {
      const params: Record<string, unknown> = { page, pageSize };
      if (username.trim()) params.username = username.trim();
      if (actionFilter) params.action = actionFilter;
      if (targetTypeFilter) params.targetType = targetTypeFilter;
      if (dateRange[0]) params.startDate = String(dateRange[0]).slice(0, 10);
      if (dateRange[1]) params.endDate = String(dateRange[1]).slice(0, 10);
      return params;
    },
    [username, actionFilter, targetTypeFilter, dateRange]
  );

  const fetchStats = useCallback(async () => {
    try {
      const res = await auditService.getStats();
      if (res.code === 0 && res.data) setStats(res.data);
    } catch {
      // ignore
    }
  }, []);

  const fetchLogs = useCallback(
    async (page = opsPag.page, pageSize = opsPag.pageSize) => {
      const seq = begin();
      setLoading(true);
      try {
        const res = await auditService.getList(buildQuery(page, pageSize) as any);
        if (!isLatest(seq) || activeTabRef.current !== 'operations') return;
        if (res.code === 0 && res.data) {
          setLogs(res.data.list);
          opsPag.updateTotal(res.data.pagination.total, pageSize);
        }
      } catch {
        if (isLatest(seq)) MessagePlugin.error('加载操作审计失败');
      } finally {
        if (isLatest(seq)) setLoading(false);
      }
    },
    [begin, isLatest, buildQuery, opsPag.page, opsPag.pageSize, opsPag.updateTotal]
  );

  const fetchCommands = useCallback(
    async (page = cmdPag.page, pageSize = cmdPag.pageSize) => {
      const seq = begin();
      setLoading(true);
      try {
        const params = buildQuery(page, pageSize) as any;
        if (dangerousOnly) params.isDangerous = true;
        const res = await auditService.getCommands(params);
        if (!isLatest(seq) || activeTabRef.current !== 'commands') return;
        if (res.code === 0 && res.data) {
          setCommands(res.data.list);
          cmdPag.updateTotal(res.data.pagination.total, pageSize);
        }
      } catch {
        if (isLatest(seq)) MessagePlugin.error('加载命令审计失败');
      } finally {
        if (isLatest(seq)) setLoading(false);
      }
    },
    [begin, isLatest, buildQuery, dangerousOnly, cmdPag.page, cmdPag.pageSize, cmdPag.updateTotal]
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (activeTab === 'operations') fetchLogs();
    else fetchCommands();
  }, [activeTab, opsPag.page, opsPag.pageSize, cmdPag.page, cmdPag.pageSize, fetchLogs, fetchCommands]);

  const switchTab = (tab: 'operations' | 'commands') => {
    setActiveTab(tab);
    if (tab === 'operations') opsPag.setPage(1);
    else cmdPag.setPage(1);
  };

  const handleSearch = () => {
    if (activeTab === 'operations') {
      opsPag.setPage(1);
      fetchLogs(1, opsPag.pageSize);
    } else {
      cmdPag.setPage(1);
      fetchCommands(1, cmdPag.pageSize);
    }
  };

  const handleReset = () => {
    setUsername('');
    setActionFilter('');
    setTargetTypeFilter('');
    setDateRange([]);
    setDangerousOnly(false);
    opsPag.setPage(1);
    cmdPag.setPage(1);
    if (activeTab === 'operations') fetchLogs(1, opsPag.pageSize);
    else fetchCommands(1, cmdPag.pageSize);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = buildQuery(1, opsPag.pageSize);
      delete params.page;
      delete params.pageSize;
      await auditService.exportCsv(params);
      MessagePlugin.success('导出成功');
    } catch {
      MessagePlugin.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  const operationColumns = [
    { colKey: 'id', title: 'ID', width: 70 },
    { colKey: 'username', title: '操作人', width: 110, cell: ({ row }: any) => row.username || '系统' },
    {
      colKey: 'action',
      title: '操作',
      width: 100,
      cell: ({ row }: any) => (
        <Tag theme={ACTION_THEMES[row.action] || 'default'} variant="light" size="small">
          {ACTION_LABELS[row.action] || row.action}
        </Tag>
      ),
    },
    {
      colKey: 'target_type',
      title: '目标',
      width: 140,
      cell: ({ row }: any) => (
        <span className="text-slate-300">
          {row.target_name
            ? row.target_name
            : `${TARGET_TYPE_LABELS[row.target_type] || row.target_type || '-'}${row.target_id ? ` #${row.target_id}` : ''}`
          }
        </span>
      ),
    },
    { colKey: 'ip', title: '来源 IP', width: 130 },
    {
      colKey: 'created_at',
      title: '时间',
      width: 170,
      cell: ({ row }: any) => formatDateTime(row.created_at),
    },
  ];

  const commandColumns = [
    { colKey: 'id', title: 'ID', width: 70 },
    { colKey: 'username', title: '用户', width: 100 },
    {
      colKey: 'asset_name',
      title: '资产',
      ellipsis: true,
      cell: ({ row }: any) => `${row.asset_name} (${row.asset_host})`,
    },
    {
      colKey: 'protocol',
      title: '协议',
      width: 80,
      cell: ({ row }: any) => (
        <Tag theme={row.protocol === 'ssh' ? 'primary' : 'warning'} variant="light" size="small">
          {row.protocol?.toUpperCase()}
        </Tag>
      ),
    },
    {
      colKey: 'command',
      title: '命令',
      ellipsis: true,
      cell: ({ row }: any) => {
        const raw = String(row.command || '');
        const preview = raw.replace(/[\r\n]+/g, ' ↵ ').trim();
        const display = preview.length > 100 ? `${preview.slice(0, 100)}…` : preview;
        return (
          <code className="text-xs text-cyan-300/90 font-mono break-all">{display || '-'}</code>
        );
      },
    },
    {
      colKey: 'risk_level',
      title: '风险',
      width: 90,
      cell: ({ row }: any) =>
        row.risk_level ? (
          <Tag theme={RISK_LEVEL_THEMES[row.risk_level] || 'default'} variant="light" size="small">
            {RISK_LEVEL_LABELS[row.risk_level] || row.risk_level}
          </Tag>
        ) : (
          '-'
        ),
    },
    {
      colKey: 'is_blocked',
      title: '状态',
      width: 90,
      cell: ({ row }: any) =>
        row.is_blocked ? (
          <Tag theme="danger" variant="light" size="small">已阻断</Tag>
        ) : row.is_dangerous ? (
          <Tag theme="warning" variant="light" size="small">危险</Tag>
        ) : (
          <Tag theme="default" variant="light" size="small">正常</Tag>
        ),
    },
    {
      colKey: 'timestamp',
      title: '时间',
      width: 170,
      cell: ({ row }: any) => formatDateTime(row.timestamp),
    },
  ];

  const commandExpandedRow = ({ row }: any) => (
    <div className="p-4 rounded-lg bg-slate-900 border border-slate-700/30">
      <p className="text-xs text-slate-500 mb-2">完整命令</p>
      <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed text-cyan-400">
        {row.command || '-'}
      </pre>
    </div>
  );

  const expandedRow = ({ row }: any) => (
    <div className="p-4 rounded-lg max-h-60 overflow-auto bg-slate-900 border border-slate-700/30">
      {row.detail ? (
        <div className="space-y-2 text-sm">
          {Object.entries(row.detail).map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="text-slate-500 shrink-0 w-24">{key}:</span>
              <span className="text-slate-300 break-all font-mono text-xs">
                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <span className="text-slate-500 text-sm">无详情</span>
      )}
      {row.user_agent && (
        <p className="text-xs text-slate-600 mt-3 pt-3 border-t border-white/[0.06] truncate">
          UA: {row.user_agent}
        </p>
      )}
    </div>
  );

  const filterBar = (
    <FilterBar>
      <Input
        prefixIcon={<SearchIcon />}
        placeholder="搜索用户名"
        value={username}
        onChange={setUsername}
        onEnter={handleSearch}
        className="w-44"
        clearable
      />
      {activeTab === 'operations' && (
        <>
          <Select
            value={actionFilter}
            onChange={(v) => setActionFilter(String(v || ''))}
            placeholder="操作类型"
            clearable
            options={ACTION_OPTIONS}
            style={{ width: 130 }}
          />
          <Select
            value={targetTypeFilter}
            onChange={(v) => setTargetTypeFilter(String(v || ''))}
            placeholder="目标类型"
            clearable
            options={TARGET_OPTIONS}
            style={{ width: 130 }}
          />
        </>
      )}
      {activeTab === 'commands' && (
        <Select
          value={dangerousOnly ? '1' : ''}
          onChange={(v) => setDangerousOnly(String(v) === '1')}
          placeholder="命令筛选"
          options={[
            { value: '', label: '全部命令' },
            { value: '1', label: '仅危险命令' },
          ]}
          style={{ width: 140 }}
        />
      )}
      <DateRangePicker
        value={dateRange}
        onChange={(val) => setDateRange(val)}
        placeholder={['开始日期', '结束日期']}
        style={{ width: 280 }}
      />
      <Button theme="primary" onClick={handleSearch}>查询</Button>
      <Button variant="outline" onClick={handleReset}>重置</Button>
    </FilterBar>
  );

  return (
    <div>
      <PageHeader
        title="安全审计"
        description="追踪系统操作与 SSH 危险命令，满足合规审计要求"
      >
        <Space>
          {activeTab === 'operations' && (
            <Button variant="outline" icon={<DownloadIcon />} loading={exporting} onClick={handleExport}>
              导出 CSV
            </Button>
          )}
          <Button
            variant="outline"
            icon={<RefreshIcon />}
            onClick={() => {
              fetchStats();
              activeTab === 'operations' ? fetchLogs() : fetchCommands();
            }}
          >
            刷新
          </Button>
        </Space>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="今日操作"
          value={stats?.todayCount ?? '-'}
          subtitle="审计日志条目"
          icon={<FileIcon size="22px" />}
          accent="cyan"
        />
        <StatCard
          title="远程连接"
          value={stats?.connectCount ?? '-'}
          subtitle="近 30 天连接次数"
          icon={<SecuredIcon size="22px" />}
          accent="blue"
        />
        <StatCard
          title="危险命令"
          value={stats?.dangerousCount ?? '-'}
          subtitle="近 30 天检出"
          icon={<ErrorCircleIcon size="22px" />}
          accent="red"
        />
        <StatCard
          title="已阻断"
          value={stats?.blockedCount ?? '-'}
          subtitle="近 30 天拦截次数"
          icon={<ErrorCircleIcon size="22px" />}
          accent="amber"
        />
      </div>

      <div className="content-card">
        {/* Custom Tab Bar */}
        <div className="flex items-center border-b px-2" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            type="button"
            onClick={() => switchTab('operations')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px ${
              activeTab === 'operations'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            <FileIcon size="16px" />
            操作审计
          </button>
          <button
            type="button"
            onClick={() => switchTab('commands')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px ${
              activeTab === 'commands'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            <TerminalIcon size="16px" />
            命令审计
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'operations' && (
          <>
            {filterBar}
            <Table
              data={logs}
              columns={operationColumns}
              rowKey="id"
              loading={loading}
              pagination={opsPag.paginationProps}
              expandedRow={expandedRow}
              hover
              stripe
              empty={<EmptyState title="暂无审计记录" description="调整筛选条件后重试" />}
            />
          </>
        )}
        {activeTab === 'commands' && (
          <>
            {filterBar}
            <Table
              data={commands}
              columns={commandColumns}
              rowKey="id"
              loading={loading}
              pagination={cmdPag.paginationProps}
              expandedRow={commandExpandedRow}
              hover
              stripe
              empty={<EmptyState title="暂无命令记录" description="SSH 会话中的命令将在此展示" />}
            />
          </>
        )}
      </div>
    </div>
  );
};
