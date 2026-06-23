import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRightIcon } from 'tdesign-icons-react';

const ROUTE_LABELS: Record<string, string> = {
  '/': '首页',
  '/dashboard': '仪表盘',
  '/assets': '资产管理',
  '/users': '用户管理',
  '/authorizations': '授权管理',
  '/audit': '审计日志',
  '/terminal': '终端',
  '/terminal/ssh': 'SSH 终端',
  '/terminal/rdp': 'RDP 终端',
  '/replay': '会话回放',
  '/sessions': '活跃会话',
  '/profile': '个人设置',
};

export const BreadcrumbNav: React.FC = () => {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  const breadcrumbs = [
    { label: '首页', path: '/dashboard' },
    ...segments.map((seg, i) => {
      const path = '/' + segments.slice(0, i + 1).join('/');
      return { label: ROUTE_LABELS[path] || seg, path };
    }),
  ];

  if (breadcrumbs.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-sm">
      {breadcrumbs.map((crumb, i) => (
        <React.Fragment key={crumb.path}>
          {i > 0 && (
            <ChevronRightIcon size="14px" className="text-slate-600 shrink-0" />
          )}
          {i === breadcrumbs.length - 1 ? (
            <span className="text-slate-300 font-medium truncate">{crumb.label}</span>
          ) : (
            <Link
              to={crumb.path}
              className="text-slate-500 hover:text-cyan-400 transition-colors truncate"
            >
              {crumb.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};
