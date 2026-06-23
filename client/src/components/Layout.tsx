import React, { useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as TLayout, Button, Dropdown } from 'tdesign-react';
import {
  DashboardIcon,
  ServerIcon,
  UserIcon,
  LinkIcon,
  FileIcon,
  TerminalIcon,
  DesktopIcon,
  LogoutIcon,
  MenuFoldIcon,
  MenuUnfoldIcon,
  UserCircleIcon,
  SecuredIcon,
  VideoIcon,
  PoweroffIcon,
} from 'tdesign-icons-react';
import { useAuth } from '../hooks/useAuth';
import { useAppStore } from '../stores/appStore';
import { BreadcrumbNav } from './BreadcrumbNav';
import { SidebarNav } from './SidebarNav';
import { TerminalSSH } from '../pages/TerminalSSH';
import { TerminalRDP } from '../pages/TerminalRDP';

const { Header, Aside, Content } = TLayout;

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, isAdmin, isAuditor, logout } = useAuth();
  const { sidebarCollapsed, toggleSidebar } = useAppStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleLabel =
    user?.role === 'admin' ? '管理员' : user?.role === 'auditor' ? '审计员' : '操作员';

  const navSections = useMemo(() => {
    const sections = [
      {
        title: '概览',
        items: [{ path: '/dashboard', icon: <DashboardIcon />, label: '仪表盘' }],
      },
      {
        title: '远程访问',
        items: [
          { path: '/terminal/ssh', icon: <TerminalIcon />, label: 'SSH 终端' },
          { path: '/terminal/rdp', icon: <DesktopIcon />, label: 'RDP 桌面' },
        ],
      },
    ];

    if (isAdmin) {
      sections.push({
        title: '系统管理',
        items: [
          { path: '/assets', icon: <ServerIcon />, label: '资产管理' },
          { path: '/users', icon: <UserIcon />, label: '用户管理' },
          { path: '/authorizations', icon: <LinkIcon />, label: '授权管理' },
        ],
      });
    }

    if (isAdmin || isAuditor) {
      sections.push({
        title: '安全合规',
        items: [
          { path: '/audit', icon: <FileIcon />, label: '审计日志' },
          { path: '/replay', icon: <VideoIcon />, label: '会话回放' },
          ...(isAdmin ? [{ path: '/sessions', icon: <PoweroffIcon />, label: '活跃会话' }] : []),
        ],
      });
    }

    return sections;
  }, [isAdmin, isAuditor]);

  const isTerminalPage = pathname.startsWith('/terminal');
  const isSSH = pathname.startsWith('/terminal/ssh');
  const isRDP = pathname.startsWith('/terminal/rdp');

  return (
    <TLayout className="h-screen w-screen overflow-hidden">
      <Aside
        style={{
          width: sidebarCollapsed ? 60 : 232,
          transition: 'width 0.2s ease',
          background: 'var(--bastion-deep)',
          borderRight: '1px solid var(--bastion-border)',
        }}
        className={`sidebar-aside flex flex-col shrink-0${sidebarCollapsed ? ' sidebar-aside--collapsed' : ''}`}
      >
        <div
          className="flex items-center shrink-0 border-b border-white/[0.05]"
          style={{ height: 52, padding: sidebarCollapsed ? '0 10px' : '0 16px' }}
        >
          {sidebarCollapsed ? (
            <div className="flex items-center justify-center w-9 h-9 mx-auto rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/20">
              <SecuredIcon size="18px" className="text-cyan-400" />
            </div>
          ) : (
            <div className="flex items-center gap-2.5 w-full">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/20">
                <SecuredIcon size="18px" className="text-cyan-400" />
              </div>
              <div className="min-w-0 leading-tight">
                <div className="text-sm font-semibold text-slate-100">堡垒机</div>
                <div className="text-[10px] text-slate-500 tracking-wider">Secure Bastion</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <SidebarNav collapsed={sidebarCollapsed} sections={navSections} />
        </div>

        <div className="shrink-0 border-t border-white/[0.05] px-3 py-3">
          {!sidebarCollapsed && (
            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
              <p className="text-xs text-slate-300 font-medium truncate">{user?.username}</p>
              <p className="text-[10px] text-slate-500 mt-1">{roleLabel}</p>
            </div>
          )}
        </div>
      </Aside>

      <TLayout>
        <Header
          style={{
            height: 52,
            background: 'var(--bastion-surface)',
            borderBottom: '1px solid var(--bastion-border)',
          }}
          className="flex items-center justify-between px-4 shrink-0"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="text"
              shape="square"
              size="small"
              icon={sidebarCollapsed ? <MenuUnfoldIcon /> : <MenuFoldIcon />}
              onClick={toggleSidebar}
            />
            {!isTerminalPage && (
              <div className="hidden md:block min-w-0">
                <BreadcrumbNav />
              </div>
            )}
          </div>

          <Dropdown
            options={[
              { content: '个人设置', value: 'profile', prefixIcon: <UserCircleIcon /> },
              { content: '退出登录', value: 'logout', prefixIcon: <LogoutIcon /> },
            ]}
            onClick={(data) => {
              if (data.value === 'logout') handleLogout();
              if (data.value === 'profile') navigate('/profile');
            }}
          >
            <div className="flex items-center gap-2 cursor-pointer hover:bg-white/[0.04] rounded-lg px-2.5 py-1.5 transition-colors">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500/20 to-cyan-500/10 text-[11px] font-semibold text-cyan-400 border border-cyan-500/15">
                {user?.username?.[0]?.toUpperCase() || '?'}
              </span>
              <span className="text-xs text-slate-300">{user?.username}</span>
            </div>
          </Dropdown>
        </Header>

        <Content
          className={
            isTerminalPage
              ? 'overflow-hidden p-5 flex flex-col min-h-0'
              : 'overflow-auto p-5 page-content'
          }
          style={{ background: 'var(--td-bg-color-page, #0a101c)' }}
        >
          {!isTerminalPage && <Outlet />}

          <div className={isSSH ? 'terminal-page flex flex-col flex-1 min-h-0' : 'hidden'} aria-hidden={!isSSH}>
            <TerminalSSH active={isSSH} />
          </div>
          <div className={isRDP ? 'terminal-page flex flex-col flex-1 min-h-0' : 'hidden'} aria-hidden={!isRDP}>
            <TerminalRDP active={isRDP} />
          </div>
        </Content>
      </TLayout>
    </TLayout>
  );
};
