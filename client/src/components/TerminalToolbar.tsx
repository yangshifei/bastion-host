import React from 'react';

interface TerminalToolbarProps {
  children: React.ReactNode;
  status?: React.ReactNode;
  meta?: React.ReactNode;
}

export const TerminalToolbar: React.FC<TerminalToolbarProps> = ({ children, status, meta }) => {
  return (
    <div className="terminal-toolbar">
      {children}
      <div className="flex-1" />
      {status}
      {meta}
    </div>
  );
};

interface TerminalEmptyProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
}

export const TerminalEmpty: React.FC<TerminalEmptyProps> = ({ icon, title, description }) => {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#060a12]">
      <div className="text-center max-w-sm px-6 animate-fade-in">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/15 mb-5 text-cyan-400">
          {icon}
        </div>
        <p className="text-base font-medium text-slate-300">{title}</p>
        {description && (
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">{description}</p>
        )}
      </div>
    </div>
  );
};
