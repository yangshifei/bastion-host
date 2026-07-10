import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Tag } from 'tdesign-react';
import {
  ServerIcon, UserIcon, TerminalIcon, ErrorCircleIcon, PlayCircleIcon,
  DesktopIcon, LinkIcon, FileIcon, ChevronRightIcon,
} from 'tdesign-icons-react';
import api from '../services/api';
import type { DashboardStats } from '../types';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { SectionCard } from '../components/SectionCard';
import { EmptyState } from '../components/EmptyState';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { useAuth } from '../hooks/useAuth';

// ── Simple CSS bar chart ──
const BarChart: React.FC<{ data: { label: string; value: number; max: number; color?: string }[] }> = ({ data }) => (
  <div className="flex items-end gap-1.5 h-24 px-1">
    {data.map((d, i) => (
      <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
        <span className="text-[10px] text-slate-500">{d.value || ''}</span>
        <div
          className="w-full rounded-t transition-all duration-500"
          style={{
            height: `${d.max > 0 ? (d.value / d.max) * 100 : 0}%`,
            minHeight: d.value > 0 ? '4px' : '0',
            background: d.color || 'var(--accent)',
            opacity: d.value > 0 ? 1 : 0.2,
          }}
        />
        <span className="text-[10px] text-slate-600 mt-1">{d.label}</span>
      </div>
    ))}
  </div>
);

// ── Simple donut ring ──
const DonutRing: React.FC<{ segments: { label: string; value: number; color: string }[] }> = ({ segments }) => {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width="72" height="72" viewBox="0 0 72 72">
        {segments.map((seg, i) => {
          const dash = (seg.value / total) * circumference;
          const segOffset = offset;
          offset += dash;
          return (
            <circle key={i} cx="36" cy="36" r={radius} fill="none" stroke={seg.color}
              strokeWidth="10" strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-segOffset} strokeLinecap="round"
              style={{ transform: 'rotate(-90deg)', transformOrigin: '36px 36px' }} />
          );
        })}
        {segments.length === 0 && (
          <circle cx="36" cy="36" r={radius} fill="none" stroke="#334155" strokeWidth="10" />
        )}
      </svg>
      <div className="space-y-1.5 text-xs">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: seg.color }} />
            <span className="text-slate-300">{seg.label}</span>
            <span className="text-slate-500 ml-auto">{Math.round((seg.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { isAdmin, isAuditor } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/stats').then((res) => {
      if (res.data.code === 0) setStats(res.data.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;

  const statCards = [
    { title: '资产总数', value: stats?.totalAssets || 0, subtitle: `${stats?.onlineAssets || 0} 在线 · ${stats?.offlineAssets || 0} 离线`, icon: <ServerIcon size="20px" />, accent: 'cyan' as const },
    { title: '用户数', value: stats?.totalUsers || 0, subtitle: '系统注册用户', icon: <UserIcon size="20px" />, accent: 'blue' as const },
    { title: '活跃会话', value: stats?.activeSessions || 0, subtitle: `今日新增 ${stats?.todaySessions || 0} 个`, icon: <TerminalIcon size="20px" />, accent: 'green' as const },
    { title: '危险命令', value: stats?.commandStats?.dangerous || 0, subtitle: `累计 ${stats?.commandStats?.total || 0} 条命令记录`, icon: <ErrorCircleIcon size="20px" />, accent: 'red' as const },
  ];

  const quickActions = [
    { label: 'SSH 连接', desc: '远程终端访问', icon: <TerminalIcon size="18px" />, path: '/terminal/ssh' },
    { label: 'RDP 桌面', desc: '远程桌面连接', icon: <DesktopIcon size="18px" />, path: '/terminal/rdp' },
    ...(isAdmin ? [
      { label: '资产管理', desc: '配置 SSH/RDP 目标', icon: <ServerIcon size="18px" />, path: '/assets' },
      { label: '授权管理', desc: '分配访问权限', icon: <LinkIcon size="18px" />, path: '/authorizations' },
    ] : []),
    ...(isAdmin || isAuditor ? [
      { label: '安全审计', desc: '操作与命令追溯', icon: <FileIcon size="18px" />, path: '/audit' },
    ] : []),
  ];

  const recentColumns = [
    { colKey: 'id', title: 'ID', width: 60 },
    { colKey: 'username', title: '用户', width: 90 },
    { colKey: 'asset_name', title: '资产', ellipsis: true },
    { colKey: 'protocol', title: '协议', width: 70, cell: ({ row }: any) => (
      <Tag theme={row.protocol === 'ssh' ? 'primary' : 'warning'} variant="light" size="small">{row.protocol.toUpperCase()}</Tag>
    )},
    { colKey: 'status', title: '状态', width: 80, cell: ({ row }: any) => (
      <Tag theme={row.status === 'active' ? 'success' : 'default'} variant="light" size="small">{row.status === 'active' ? '活跃' : '已关闭'}</Tag>
    )},
    { colKey: 'start_time', title: '开始时间', width: 160 },
  ];

  const recentSessions = stats?.recentSessions || [];

  return (
    <div>
      <PageHeader title="仪表盘" description="系统运行状态与安全态势概览">
        <Button theme="primary" icon={<PlayCircleIcon />} onClick={() => navigate('/terminal/ssh')}>
          新建会话
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {statCards.map((card) => <StatCard key={card.title} {...card} />)}
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Session trend */}
        <SectionCard title="7日会话趋势" description="每日新建会话数量">
          {stats?.sessionTrend && stats.sessionTrend.length > 0 ? (
            <BarChart
              data={stats.sessionTrend.map(d => ({
                label: d.date.slice(5),
                value: d.count,
                max: Math.max(...stats.sessionTrend!.map(x => x.count), 1),
              }))}
            />
          ) : (
            <div className="h-24 flex items-center justify-center text-xs text-slate-500">暂无数据</div>
          )}
        </SectionCard>

        {/* Protocol distribution */}
        <SectionCard title="资产协议分布" description="SSH 与 RDP 资产占比">
          {stats?.protocolDist ? (
            <DonutRing
              segments={[
                { label: 'SSH', value: stats.protocolDist.ssh || 0, color: '#3b82f6' },
                { label: 'RDP', value: stats.protocolDist.rdp || 0, color: '#f59e0b' },
              ]}
            />
          ) : (
            <div className="h-24 flex items-center justify-center text-xs text-slate-500">暂无数据</div>
          )}
        </SectionCard>

        {/* Command safety */}
        <SectionCard title="命令安全" description={`累计 ${stats?.commandStats?.total || 0} 条命令`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">安全命令</span>
              <span className="text-emerald-400 font-medium">{(stats?.commandStats?.total || 0) - (stats?.commandStats?.dangerous || 0)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${stats?.commandStats?.total ? (((stats.commandStats.total - stats.commandStats.dangerous) / stats.commandStats.total) * 100) : 0}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">危险命令</span>
              <span className="text-red-400 font-medium">{stats?.commandStats?.dangerous || 0}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
              <div className="h-full bg-red-500 rounded-full transition-all"
                style={{ width: `${stats?.commandStats?.total ? ((stats.commandStats.dangerous / stats.commandStats.total) * 100) : 0}%` }} />
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="lg:col-span-1">
          <SectionCard title="快捷入口" description="常用功能一键直达">
            <div className="space-y-2">
              {quickActions.map((action) => (
                <button
                  key={action.path}
                  type="button"
                  className="quick-action w-full text-left"
                  onClick={() => navigate(action.path)}
                >
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
            extra={
              recentSessions.length > 0 && (
                <Button variant="text" size="small" onClick={() => navigate('/replay')}>
                  查看全部
                </Button>
              )
            }
          >
            {recentSessions.length > 0 ? (
              <Table
                data={recentSessions}
                columns={recentColumns}
                rowKey="id"
                size="small"
                hover
                stripe
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
