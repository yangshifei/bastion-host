import React from 'react';
import { Loading } from 'tdesign-react';

interface Props {
  fullScreen?: boolean;
  text?: string;
}

export const LoadingSkeleton: React.FC<Props> = ({ fullScreen = false, text = '加载中...' }) => {
  if (fullScreen) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-slate-950">
        <div className="flex flex-col items-center gap-5">
          <span className="text-4xl">🏰</span>
          <Loading text={text} size="large" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-48 rounded-xl bg-slate-800 border border-slate-700/30">
      <Loading text={text} />
    </div>
  );
};
