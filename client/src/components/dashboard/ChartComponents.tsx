import React from 'react';

export const ChartEmpty: React.FC<{ message?: string }> = ({ message = '暂无数据' }) => (
  <div className="h-24 flex items-center justify-center text-xs text-slate-500">{message}</div>
);

export const BarChart: React.FC<{ data: { label: string; value: number; max: number }[] }> = ({ data }) => (
  <div className="flex items-end gap-1.5 h-24 px-1">
    {data.map((d, i) => (
      <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
        <span className="text-[10px] text-slate-500">{d.value || ''}</span>
        <div
          className="w-full rounded-t transition-all duration-500"
          style={{
            height: `${d.max > 0 ? (d.value / d.max) * 100 : 0}%`,
            minHeight: d.value > 0 ? '4px' : '0',
            background: '#6366f1',
            opacity: d.value > 0 ? 1 : 0.2,
          }}
        />
        <span className="text-[10px] text-slate-600 mt-1">{d.label}</span>
      </div>
    ))}
  </div>
);

export const DonutRing: React.FC<{ segments: { label: string; value: number; color: string }[] }> = ({ segments }) => {
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
            <circle
              key={i}
              cx="36"
              cy="36"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="10"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-segOffset}
              strokeLinecap="round"
              style={{ transform: 'rotate(-90deg)', transformOrigin: '36px 36px' }}
            />
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
