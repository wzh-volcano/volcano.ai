import React from 'react';

interface BadgeProps {
  icon?: React.ReactNode;
  text: string;
  variant?: 'default' | 'branch';
}

export const Badge: React.FC<BadgeProps> = ({ icon, text, variant = 'default' }) => (
  <span
    className={`
      inline-flex items-center gap-1 text-xs
      px-2 py-[3px] rounded-md
      bg-bg-3 text-text-dim border border-border
      ${variant === 'branch' ? 'text-[#9aa3b0]' : ''}
    `}
  >
    {icon}
    {text}
  </span>
);
