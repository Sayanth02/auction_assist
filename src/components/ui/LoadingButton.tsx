'use client';

import React from 'react';

export interface LoadingButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isPending?: boolean;
  pendingText?: React.ReactNode;
  children: React.ReactNode;
}

export const LoadingButton = React.forwardRef<
  HTMLButtonElement,
  LoadingButtonProps
>(function LoadingButton(
  {
    isPending = false,
    pendingText,
    disabled,
    children,
    className = '',
    onClick,
    ...props
  },
  ref
) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isPending || disabled) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  return (
    <button
      ref={ref}
      disabled={disabled || isPending}
      aria-busy={isPending}
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center font-bold uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {isPending ? (
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
          <span>{pendingText || children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
});
