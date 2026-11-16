'use client';

import React from 'react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`border-2 border-dashed border-[#b6c5ea] bg-white/60 p-8 text-center flex flex-col items-center justify-center min-h-[160px] ${className}`}
    >
      {icon && (
        <div className="mb-3 text-[#183ec2] text-2xl" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-base font-black uppercase tracking-wider text-[#09143f]">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-xs text-[#5a6b8c] font-medium max-w-md">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
