import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Tag } from 'tdesign-react';
import {
  PlayCircleIcon, ChevronRightIcon, RefreshIcon,
} from 'tdesign-icons-react';
import api from '../services/api';
import type { DashboardStats } from '../types';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { SectionCard } from '../components/SectionCard';
import { EmptyState } from '../components/EmptyState';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { BarChart, DonutRing, ChartEmpty } from '../components/dashboard/ChartComponents';
import { useAuth } from '../hooks/useAuth';
import { getQuickActions, getStatCards, resolveDashboardRole } from '../config/dashboardConfig';

const COLORS: Record<string, string> = {
  ssh: '#3b82f6', mysql: '#10b981', postgresql: '#6366f1', mssql: '#f97316', rdp: '#f59e0b',
};

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, isAuditor } = useAuth();
  const role = resolveDashboardRole(isAdmin, isAuditor);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await api.get('/dashboard/stats');
      if (res.data.code === 0) setStats(res.data.data);
    } catch {
      /* keep last data on failure */
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    intervalRef.current = setInterval(() => fetchStats(false), 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStats]);

  if (loading && !stats) return <LoadingSkeleton />;

  const protoSegments = stats?.protocolDist
    ? Object.entries(stats.protocolDist)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ label: k.toUpperCase(), value: v, color: COLORS[k] || '#64748b' }))
    : [];

  const recentSessions = stats?.recentSessions || [];
  const sessionColumns = [
    { colKey: 'username', title: '用户', width: 80, ellipsis: true },
    { colKey: 'asset_name', title: '资产', ellipsis: true },
    { colKey: 'protocol', title: '协议', width: 65, cell: ({ row }: any) => (
      <Tag theme={row.protocol === 'ssh' ? 'primary' : 'warning'} variant="light" size="small">{row.protocol?.toUpperCase()}</Tag>
    )},
    { colKey: 'status', title: '状态', width: 65, cell: ({ row }: any) => (
      <Tag theme={row.status === 'active' ? 'success' : 'default'} variant="light" size="small">{row.status === 'active' ? '活跃' : '已关闭'}</Tag>
    )},
    { colKey: 'start_time', title: '开始时间', width: 140, cell: ({ row }: any) => (
      <span className="text-xs text-slate-500">{row.start_time?.replace('T', ' ').substring(0, 19)}</span>
    )},
  ];

  const quickActions = getQuickActions(role);
  const statCards = getStatCards(stats, role);
  const cmdTotal = stats?.commandStats?.total ?? 0;
  const cmdDangerous = stats?.commandStats?.dangerous ?? 0;
  const cmdSafe = cmdTotal - cmdDangerous;

  return (
    <div>
      <PageHeader title="仪表盘" description="系统运行状态与安全态势概览">
        <Button variant="outline" icon={<RefreshIcon />} loading={refreshing} onClick={() => fetchStats(true)}>刷新</Button>
        {role !== 'auditor' && (
          <Button theme="primary" icon={<PlayCircleIcon />} onClick={() => navigate('/terminal/ssh')} className="ml-2">新建会话</Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {statCards.map((card) => (
          <StatCard
            key={card.key}
            title={card.title}
            value={card.value}
            subtitle={card.subtitle}
            icon={card.icon}
            accent={card.accent}
            alert={card.alert}
            onClick={card.href ? () => navigate(card.href!) : undefined}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <SectionCard title="7 日会话趋势" description="每日新建会话数量">
          {stats?.sessionTrend && stats.sessionTrend.length > 0 ? (
            <BarChart data={stats.sessionTrend.map((d) => ({
              label: d.date.slice(5),
              value: d.count,
              max: Math.max(...stats.sessionTrend!.map((x) => x.count), 1),
            }))} />
          ) : (
            <ChartEmpty />
          )}
        </SectionCard>

        <SectionCard title="资产类型分布" description="全部已注册资产">
          {protoSegments.length > 0 ? <DonutRing segments={protoSegments} /> : <ChartEmpty />}
        </SectionCard>

        <SectionCard title="命令安全" description={`累计 ${cmdTotal} 条命令`}>
          {cmdTotal > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">安全命令</span>
                <span className="text-emerald-400 font-medium">{cmdSafe}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${(cmdSafe / cmdTotal) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">危险命令</span>
                <span className="text-red-400 font-medium">{cmdDangerous}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full transition-all"
                  style={{ width: `${(cmdDangerous / cmdTotal) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <EmptyState title="暂无命令记录" description="远程会话执行命令后，安全统计将在此展示" />
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="lg:col-span-1">
          <SectionCard title="快捷入口" description="常用功能一键直达">
            <div className="space-y-2">
              {quickActions.map((action) => (
                <button key={action.path} type="button" className="quick-action w-full text-left" onClick={() => navigate(action.path)}>
                  <div className="quick-action-icon">{action.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200">{action.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{action.desc}</p>
                  </div>
                  <ChevronRightIcon size="16px" className="text-slate-600 shrink-0" />
                </button>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="lg:col-span-2">
          <SectionCard
            title="最近会话"
            description="最新的远程连接记录"
            flush
            extra={recentSessions.length > 0 && (
              <Button variant="text" size="small" onClick={() => navigate('/replay')}>查看全部</Button>
            )}
          >
            {recentSessions.length > 0 ? (
              <Table
                data={recentSessions}
                columns={sessionColumns}
                rowKey="id"
                size="small"
                hover
                stripe
                onRowClick={({ row }: any) => navigate(`/replay/${row.id}`)}
              />
            ) : (
              <div className="p-8">
                <EmptyState
                  title="暂无会话记录"
                  description="连接远程资产后，会话记录将在此展示"
                  actionText="开始连接"
                  onAction={() => navigate('/terminal/ssh')}
                />
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
};
