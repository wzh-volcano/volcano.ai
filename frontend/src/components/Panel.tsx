import React from 'react';

interface PanelProps {
  children: React.ReactNode;
  className?: string;
}

export const Panel: React.FC<PanelProps> = ({ children, className = '' }) => (
  <div className={`bg-bg-3 border border-border rounded-xl p-3.5 ${className}`}>
    {children}
  </div>
);
