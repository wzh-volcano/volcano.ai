import React from 'react';

interface ChipProps {
  children: React.ReactNode;
  ghost?: boolean;
  onClick?: () => void;
}

export const Chip: React.FC<ChipProps> = ({ children, ghost = false, onClick }) => (
  <button
    onClick={onClick}
    className={`
      inline-flex items-center gap-1
      px-2.5 py-1 rounded-md text-xs
      transition-colors duration-150 ease-out
      ${ghost
        ? 'bg-transparent border-0 text-text-dim hover:text-text'
        : 'bg-bg-3 text-text-dim border border-border hover:bg-bg-hover hover:text-text'
      }
    `}
  >
    {children}
  </button>
);
