import React from 'react';

interface IconButtonProps {
  icon: React.ReactNode;
  title?: string;
  className?: string;
  onClick?: () => void;
}

export const IconButton: React.FC<IconButtonProps> = ({ icon, title, className = '', onClick }) => (
  <button
    title={title}
    onClick={onClick}
    className={`
      w-7 h-7 inline-flex items-center justify-center
      text-text-dim rounded-md text-sm
      transition-colors duration-150 ease-out
      hover:bg-bg-hover hover:text-text
      ${className}
    `}
  >
    {icon}
  </button>
);
