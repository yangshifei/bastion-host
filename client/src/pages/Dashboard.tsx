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
