import React from 'react';

interface Props {
  children: React.ReactNode;
}

export const FilterBar: React.FC<Props> = ({ children }) => (
  <div className="filter-bar">{children}</div>
);
