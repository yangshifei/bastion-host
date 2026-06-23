import React from 'react';

interface Props {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export const PageHeader: React.FC<Props> = ({ title, description, children }) => (
  <div className="page-header">
    <div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
    {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
  </div>
);
