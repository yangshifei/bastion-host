import React from 'react';
import { Loading } from 'tdesign-react';

interface Props {
  fullScreen?: boolean;
  text?: string;
}

export const LoadingSkeleton: React.FC<Props> = ({ fullScreen = false, text = '加载中...' }) => {
  if (fullScreen) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen" style={{ background: 'var(--bastion-deep)' }}>
        <div className="flex flex-col items-center gap-5">
          <span className="text-4xl">🏰</span>
          <Loading text={text} size="large" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-48 rounded-xl border border-white/[0.06] bg-bastion-surface/50">
      <Loading text={text} />
    </div>
  );
};
