import React from 'react';

interface Props {
  value: boolean;
  onChange: (enabled: boolean) => void;
  size?: 'small' | 'medium' | 'large';
  label?: string;
}

/** Simple styled toggle — avoids TDesign Switch visibility issues */
export const RecordingSwitch: React.FC<Props> = ({ value, onChange, size = 'small', label }) => {
  const s = size === 'small' ? 'w-8 h-4' : size === 'large' ? 'w-14 h-7' : 'w-11 h-5';
  const dot = size === 'small' ? 'w-3 h-3' : size === 'large' ? 'w-6 h-6' : 'w-4 h-4';

  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          className={`${s} rounded-full transition-colors duration-200 ${
            value ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'bg-slate-500/40'
          }`}
        />
        <div
          className={`${dot} absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform duration-200 ${
            value ? (size === 'small' ? 'translate-x-4' : size === 'large' ? 'translate-x-7' : 'translate-x-5') : ''
          }`}
        />
      </div>
      {label !== undefined && <span className="text-xs text-slate-400">{label}</span>}
    </label>
  );
};
