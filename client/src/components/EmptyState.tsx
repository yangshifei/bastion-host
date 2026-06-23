import React from 'react';
import { Button } from 'tdesign-react';

interface Props {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<Props> = ({
  icon,
  title = '暂无数据',
  description = '',
  actionText,
  onAction,
}) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    {icon ? (
      <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-4 text-2xl">
        {icon}
      </div>
    ) : (
      <div className="w-14 h-14 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-4 flex items-center justify-center">
        <div className="w-7 h-7 rounded-lg border-2 border-dashed border-slate-600" />
      </div>
    )}
    <p className="text-sm font-medium text-slate-400">{title}</p>
    {description && <p className="text-xs text-slate-500 mt-1.5 max-w-sm">{description}</p>}
    {actionText && onAction && (
      <Button theme="primary" className="mt-4" onClick={onAction}>{actionText}</Button>
    )}
  </div>
);
