import React from 'react';

interface Props {
  title: string;
  description?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}

export const SectionCard: React.FC<Props> = ({
  title,
  description,
  extra,
  children,
  className = '',
  flush = false,
}) => (
  <div className={`content-card ${className}`}>
    <div className="section-header">
      <div>
        <h3 className="section-title">{title}</h3>
        {description && <p className="section-desc">{description}</p>}
      </div>
      {extra && <div className="flex items-center gap-2 shrink-0">{extra}</div>}
    </div>
    <div className={flush ? '' : 'section-body'}>{children}</div>
  </div>
);
