import React from 'react';
import { SecuredIcon } from 'tdesign-icons-react';

interface BrandLogoProps {
  collapsed?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: { icon: '20px', title: 'text-sm', sub: 'text-[10px]' },
  md: { icon: '24px', title: 'text-base', sub: 'text-xs' },
  lg: { icon: '32px', title: 'text-2xl', sub: 'text-sm' },
};

export const BrandLogo: React.FC<BrandLogoProps> = ({ collapsed = false, size = 'md' }) => {
  const s = sizeMap[size];

  if (collapsed) {
    return (
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-500/20">
        <SecuredIcon size={s.icon} className="text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 border border-cyan-500/20 shadow-glow-sm">
        <SecuredIcon size={s.icon} className="text-cyan-400" />
      </div>
      <div className="min-w-0">
        <h1 className={`${s.title} font-semibold text-slate-100 tracking-tight leading-tight`}>
          堡垒机
        </h1>
        <p className={`${s.sub} text-slate-500 font-medium tracking-wider uppercase`}>
          Bastion Host
        </p>
      </div>
    </div>
  );
};
