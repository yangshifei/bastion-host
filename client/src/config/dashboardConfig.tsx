import React from 'react';
import {
  ServerIcon, UserIcon, TerminalIcon, ErrorCircleIcon,
  LinkIcon, CodeIcon, DesktopIcon, FileIcon, VideoIcon,
} from 'tdesign-icons-react';
import type { DashboardStats } from '../types';

export type DashboardRole = 'admin' | 'operator' | 'auditor';

export const DASHBOARD_ROLES = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  AUDITOR: 'auditor',
} as const satisfies Record<string, DashboardRole>;

export interface QuickAction {
  label: string;
  desc: string;
  icon: React.ReactNode;
  path: string;
}

export interface StatCardConfig {
  key: string;
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  accent: 'cyan' | 'blue' | 'green' | 'red' | 'amber' | 'purple';
  href?: string;
  alert?: boolean;
  hidden?: boolean;
}

export function resolveDashboardRole(isAdmin: boolean, isAuditor: boolean): DashboardRole {
  if (isAdmin) return 'admin';
  if (isAuditor) return 'auditor';
  return 'operator';
}

export function formatStatValue(value: number | undefined | null, hasData: boolean): string | number {
  if (!hasData) return '--';
  return value ?? 0;
}

export function getQuickActions(role: DashboardRole): QuickAction[] {
  if (role === 'auditor') {
    return [
      { label: '安全审计', desc: '操作与命令追溯', icon: <FileIcon size="18px" />, path: '/audit' },
      { label: '会话回放', desc: '查看历史录像', icon: <VideoIcon size="18px" />, path: '/replay' },
    ];
  }

  const actions: QuickAction[] = [
    { label: 'SSH 连接', desc: '远程终端访问', icon: <TerminalIcon size="18px" />, path: '/terminal/ssh' },
    { label: 'RDP 桌面', desc: '远程桌面连接', icon: <DesktopIcon size="18px" />, path: '/terminal/rdp' },
    { label: 'SQL 窗口', desc: '数据库查询', icon: <CodeIcon size="18px" />, path: '/database' },
  ];

  if (role === 'admin') {
    actions.push(
      { label: '资产管理', desc: '配置远程目标', icon: <ServerIcon size="18px" />, path: '/assets' },
      { label: '授权管理', desc: '分配访问权限', icon: <LinkIcon size="18px" />, path: '/authorizations' },
      { label: '安全审计', desc: '操作与命令追溯', icon: <FileIcon size="18px" />, path: '/audit' },
    );
  }

  return actions;
}

export function getStatCards(stats: DashboardStats | null, role: DashboardRole): StatCardConfig[] {
  const hasData = stats !== null;
  const dbTotal = stats?.dbAssets?.total ?? 0;
  const dangerous = stats?.commandStats?.dangerous ?? 0;
  const failedLogins = stats?.todayFailedLogins ?? 0;
  const cmdTotal = stats?.commandStats?.total ?? 0;

  const cards: StatCardConfig[] = [
    {
      key: 'totalAssets',
      title: '资产总数',
      value: formatStatValue(stats?.totalAssets, hasData),
      subtitle: hasData ? `${stats?.sshAssets ?? 0} SSH · ${stats?.rdpAssets ?? 0} RDP · ${dbTotal} DB` : '--',
      icon: <ServerIcon size="20px" />,
      accent: 'cyan',
      href: '/assets',
    },
    {
      key: 'onlineAssets',
      title: '在线资产',
      value: formatStatValue(stats?.onlineAssets, hasData),
      subtitle: hasData ? `离线 ${stats?.offlineAssets ?? 0} 台` : '--',
      icon: <TerminalIcon size="20px" />,
      accent: 'green',
      href: '/assets',
    },
    {
      key: 'activeSessions',
      title: '活跃会话',
      value: formatStatValue(stats?.activeSessions, hasData),
      subtitle: hasData ? `今日 ${stats?.todaySessions ?? 0} 个` : '--',
      icon: <LinkIcon size="20px" />,
      accent: 'blue',
      href: '/sessions',
    },
    {
      key: 'todayQueries',
      title: '今日查询',
      value: formatStatValue(stats?.todayQueries, hasData),
      subtitle: hasData ? `${stats?.querySuccessCount ?? 0} 成功 · ${stats?.queryErrorCount ?? 0} 失败` : '--',
      icon: <CodeIcon size="20px" />,
      accent: 'purple',
      href: '/database',
    },
    {
      key: 'totalUsers',
      title: '用户数',
      value: formatStatValue(stats?.totalUsers, hasData),
      subtitle: '系统注册用户',
      icon: <UserIcon size="20px" />,
      accent: 'amber',
      href: '/users',
      hidden: role === 'operator',
    },
    {
      key: 'dangerous',
      title: '危险命令',
      value: formatStatValue(dangerous, hasData),
      subtitle: hasData
        ? `危险 ${dangerous} · 今日失败登录 ${failedLogins}${cmdTotal > 0 ? ` · 累计 ${cmdTotal} 条` : ''}`
        : '--',
      icon: <ErrorCircleIcon size="20px" />,
      accent: 'red',
      href: '/audit',
      alert: hasData && (dangerous > 0 || failedLogins > 0),
    },
  ];

  let visible = cards.filter((c) => !c.hidden);

  if (role === 'auditor') {
    const order = ['dangerous', 'activeSessions', 'todayQueries', 'totalAssets', 'onlineAssets', 'totalUsers'];
    visible = order
      .map((k) => visible.find((c) => c.key === k))
      .filter((c): c is StatCardConfig => !!c);
  }

  return visible;
}
