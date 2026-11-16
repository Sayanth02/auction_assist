'use client';

import React, { useEffect, useRef, useState } from 'react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: React.ReactNode;
  eyebrow?: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  isPending?: boolean;
  pendingText?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  eyebrow = 'CONFIRM ACTION',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false,
  isPending = false,
  pendingText = 'Processing…',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const [prevPending, setPrevPending] = useState(isPending);
  const [isSlow, setIsSlow] = useState(false);

  // React 19 pattern: sync isSlow when isPending finishes during render
  if (prevPending !== isPending) {
    setPrevPending(isPending);
    if (!isPending) {
      setIsSlow(false);
    }
  }

  // Focus restoration: capture trigger element before dialog opens
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement | null;
    } else {
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
    }
  }, [isOpen]);

  // Trap focus inside dialog & handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    // Focus confirm button when dialog appears
    const timer = setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isPending) {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isPending, onClose]);

  // Slow operation warning if action takes > 4.5 seconds
  useEffect(() => {
    if (!isPending) return;

    const slowTimer = setTimeout(() => {
      setIsSlow(true);
    }, 4500);

    return () => clearTimeout(slowTimer);
  }, [isPending]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmDialogTitle"
      aria-describedby="confirmDialogDesc"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div className="modal" ref={dialogRef}>
        <div className="modal-top">
          <span className="modal-eyebrow">{eyebrow}</span>
          {!isPending && (
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Close dialog"
            >
              ✕
            </button>
          )}
        </div>

        <h2 id="confirmDialogTitle" className="modal-title">
          {title}
        </h2>

        <div id="confirmDialogDesc" className="modal-desc">
          {description}
        </div>

        {isSlow && (
          <p className="mt-3 p-2 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold">
            Server response is taking longer than expected. Please wait—do not refresh the page.
          </p>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn cancel"
            onClick={onClose}
            disabled={isPending}
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className={`modal-btn confirm ${
              isDanger ? '!bg-red-600 !text-white hover:!bg-red-700' : ''
            }`}
            onClick={() => {
              if (!isPending) {
                onConfirm();
              }
            }}
            disabled={isPending}
          >
            {isPending ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
                  aria-hidden="true"
                />
                <span>{pendingText}</span>
              </span>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
