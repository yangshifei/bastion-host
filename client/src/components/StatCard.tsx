import React from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  accent?: 'cyan' | 'blue' | 'green' | 'red' | 'amber' | 'purple';
  onClick?: () => void;
  alert?: boolean;
  loading?: boolean;
}

const accentMap = {
  cyan:  { bg: 'from-cyan-500/15 to-cyan-500/5', border: 'border-cyan-500/15', text: 'text-cyan-400' },
  blue:  { bg: 'from-blue-500/15 to-blue-500/5', border: 'border-blue-500/15', text: 'text-blue-400' },
  green: { bg: 'from-emerald-500/15 to-emerald-500/5', border: 'border-emerald-500/15', text: 'text-emerald-400' },
  red:   { bg: 'from-red-500/15 to-red-500/5', border: 'border-red-500/15', text: 'text-red-400' },
  amber:  { bg: 'from-amber-500/15 to-amber-500/5', border: 'border-amber-500/15', text: 'text-amber-400' },
  purple: { bg: 'from-purple-500/15 to-purple-500/5', border: 'border-purple-500/15', text: 'text-purple-400' },
};

export const StatCard: React.FC<StatCardProps> = ({
  title, value, subtitle, icon, accent = 'cyan', onClick, alert, loading,
}) => {
  const a = accentMap[accent];
  const interactive = !!onClick;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={`stat-card group${interactive ? ' stat-card-clickable' : ''}${alert ? ' stat-card-alert' : ''}${loading ? ' stat-card-loading' : ''}`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="stat-label uppercase tracking-wider">{title}</p>
          <p className="stat-value mt-1">{loading ? '…' : value}</p>
          {subtitle && <p className="stat-label mt-1.5 truncate">{subtitle}</p>}
        </div>
        <div className={`stat-icon bg-gradient-to-br ${a.bg} ${a.border} ${a.text} transition-transform duration-300 group-hover:scale-105`}>
          {icon}
        </div>
      </div>
    </div>
  );
};
