import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as TLayout, Button } from 'tdesign-react';
import { NotificationCenter } from './NotificationCenter';
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
  SettingIcon,
  FolderOpenIcon,
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
  const { sidebarCollapsed, theme, toggleSidebar, toggleTheme } = useAppStore();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleLabel =
    user?.role === 'admin' ? '管理员' : user?.role === 'auditor' ? '审计员' : '操作员';

  const roleGradient: Record<string, string> = {
    admin: 'from-rose-500/20 to-rose-500/5 border-rose-500/20',
    auditor: 'from-amber-500/20 to-amber-500/5 border-amber-500/20',
    operator: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/20',
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, closeMenu]);

  const initials = (user?.username || '?').slice(0, 2).toUpperCase();

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
          { path: '/database', icon: <FolderOpenIcon />, label: '数据库管理' },
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
          { path: '/security', icon: <SecuredIcon />, label: '安全策略' },
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
        }}
        className={`sidebar-aside flex flex-col shrink-0 bg-slate-950 border-r border-slate-700/30${sidebarCollapsed ? ' sidebar-aside--collapsed' : ''}`}
      >
        <div
          className="flex items-center shrink-0 border-b border-slate-700/30"
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

        <div className="shrink-0 border-t border-slate-700/30 px-3 py-3">
          {!sidebarCollapsed && (
            <div className="rounded-lg bg-slate-700/20 border border-slate-600/20 px-3 py-2.5">
              <p className="text-xs font-medium truncate text-slate-300">{user?.username}</p>
              <p className="text-[10px] text-slate-500 mt-1">{roleLabel}</p>
            </div>
          )}
        </div>
      </Aside>

      <TLayout>
        <Header
          style={{ height: 52 }}
          className="flex items-center justify-between px-4 shrink-0 bg-slate-800 border-b border-slate-700/30"
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

          <div className="flex items-center gap-1">
            <NotificationCenter />
            <Button
              variant="text"
              shape="square"
              size="small"
              onClick={toggleTheme}
              title={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </Button>

            {/* ── User Menu ── */}
            <div className="relative">
              <div
                ref={triggerRef}
                className={`flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-1.5 transition-all duration-200 ${
                  menuOpen ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-elevated)]'
                }`}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className={`flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br ${roleGradient[user?.role || 'operator']} text-[11px] font-semibold text-[var(--accent)] border`}>
                  {user?.username?.[0]?.toUpperCase() || '?'}
                </span>
                <span className="text-xs text-[var(--text-secondary)] hidden sm:inline">{user?.username}</span>
              </div>

              {menuOpen && (
                <div
                  ref={menuRef}
                  className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl z-50 overflow-hidden animate-slide-up"
                  style={{
                    background: 'var(--bg-elevated)',
                    borderColor: 'var(--border-default)',
                  }}
                >
                  {/* User info */}
                  <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <div className="flex items-center gap-3">
                      <span className={`flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br ${roleGradient[user?.role || 'operator']} text-sm font-semibold text-[var(--accent)] border shrink-0`}>
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{user?.username}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{roleLabel}</p>
                      </div>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div className="py-1.5">
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => { navigate('/profile'); closeMenu(); }}
                    >
                      <span className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: 'var(--bg-surface)' }}>
                        <SettingIcon size="15px" style={{ color: 'var(--text-muted)' }} />
                      </span>
                      个人设置
                    </button>
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left"
                      style={{ color: 'var(--text-secondary)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                        e.currentTarget.style.color = '#f87171';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                      }}
                      onClick={() => { handleLogout(); closeMenu(); }}
                    >
                      <span className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: 'rgba(239, 68, 68, 0.10)' }}>
                        <LogoutIcon size="15px" style={{ color: '#f87171' }} />
                      </span>
                      退出登录
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Header>

        <Content
          className={
            isTerminalPage
              ? 'overflow-hidden p-5 flex flex-col min-h-0'
              : 'overflow-auto p-5 page-content'
          }
          style={{ background: 'var(--td-bg-color-page)' }}
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
