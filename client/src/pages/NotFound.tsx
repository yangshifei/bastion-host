import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'tdesign-react';
import { HomeIcon } from 'tdesign-icons-react';

export const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center h-screen bg-bastion-deep relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-20" />
      <div className="absolute inset-0 bg-gradient-radial" />

      <div className="relative text-center animate-fade-in px-6">
        <p className="text-[120px] font-bold leading-none text-transparent bg-clip-text bg-gradient-to-b from-slate-600 to-slate-800 select-none">
          404
        </p>
        <h1 className="text-2xl font-semibold text-slate-200 -mt-4 mb-2">页面未找到</h1>
        <p className="text-slate-500 mb-8">您访问的页面不存在或已被移除</p>
        <Button theme="primary" icon={<HomeIcon />} onClick={() => navigate('/dashboard')}>
          返回首页
        </Button>
      </div>
    </div>
  );
};
