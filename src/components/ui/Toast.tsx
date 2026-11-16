'use client';

import React, { useEffect, useRef } from 'react';

export interface ToastProps {
  message: string | null;
  isError?: boolean;
  onDismiss: () => void;
  /** Auto-dismiss duration in ms for success messages (defaults to 3800ms). Errors stay until dismissed. */
  duration?: number;
}

export function Toast({
  message,
  isError = false,
  onDismiss,
  duration = 3800,
}: ToastProps) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!message) return;

    // Routine success messages auto-dismiss; errors remain until dismissed by the user
    if (!isError && duration > 0) {
      timerRef.current = setTimeout(() => {
        onDismiss();
      }, duration);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [message, isError, duration, onDismiss]);

  if (!message) return null;

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`fixed bottom-6 right-6 z-[100] max-w-md flex items-start gap-3 p-3.5 border-2 shadow-[4px_4px_0_#09143f] text-sm font-semibold transition-all duration-150 animate-in fade-in slide-in-from-bottom-2 ${
        isError
          ? 'bg-[#fef2f2] text-[#7f1d1d] border-[#991b1b]'
          : 'bg-[#09143f] text-white border-[#efff00]'
      }`}
    >
      <div className="flex-1 flex items-center gap-2.5 min-w-0">
        <span
          className={`w-2.5 h-2.5 rounded-none shrink-0 ${
            isError ? 'bg-[#ef4444]' : 'bg-[#efff00]'
          }`}
          aria-hidden="true"
        />
        <span className="leading-snug break-words">{message}</span>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className={`shrink-0 p-1 font-bold text-xs leading-none transition-colors ${
          isError
            ? 'text-[#991b1b] hover:text-[#450a0a]'
            : 'text-[#efff00] hover:text-white'
        }`}
      >
        ✕
      </button>
    </div>
  );
}
