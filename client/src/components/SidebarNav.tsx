import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export interface SidebarNavItem {
  path: string;
  icon: React.ReactNode;
  label: string;
}

interface SidebarNavProps {
  collapsed: boolean;
  sections: {
    title?: string;
    items: SidebarNavItem[];
  }[];
}

export const SidebarNav: React.FC<SidebarNavProps> = ({ collapsed, sections }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);

  return (
    <nav className="sidebar-nav px-2 py-1">
      {sections.map((section, si) => (
        <div key={si} className={si > 0 ? 'sidebar-group' : ''}>
          {section.title && !collapsed && (
            <p className="sidebar-section-label">{section.title}</p>
          )}
          <ul className="sidebar-list">
            {section.items.map((item) => {
              const active = isActive(item.path);
              return (
                <li key={item.path}>
                  <button
                    type="button"
                    title={collapsed ? item.label : undefined}
                    className={`sidebar-link${active ? ' sidebar-link--active' : ''}`}
                    onClick={() => navigate(item.path)}
                  >
                    <span className="sidebar-link-icon">{item.icon}</span>
                    {!collapsed && <span className="sidebar-link-label">{item.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
};
