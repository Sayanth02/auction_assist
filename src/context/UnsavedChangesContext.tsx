'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { logout } from '@/app/actions/auth';

interface UnsavedChangesContextType {
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  confirmNavigation: (targetHref: string) => boolean;
  confirmSignOut: () => boolean;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextType>({
  isDirty: false,
  setIsDirty: () => {},
  confirmNavigation: () => true,
  confirmSignOut: () => true,
});

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isDirty, setIsDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: 'nav' | 'signout';
    href?: string;
  } | null>(null);

  const confirmNavigation = useCallback(
    (targetHref: string) => {
      if (!isDirty) return true;
      setPendingAction({ type: 'nav', href: targetHref });
      return false;
    },
    [isDirty]
  );

  const confirmSignOut = useCallback(() => {
    if (!isDirty) return true;
    setPendingAction({ type: 'signout' });
    return false;
  }, [isDirty]);

  const handleConfirm = useCallback(async () => {
    const action = pendingAction;
    setIsDirty(false);
    setPendingAction(null);

    if (action?.type === 'nav' && action.href) {
      router.push(action.href);
    } else if (action?.type === 'signout') {
      await logout();
    }
  }, [pendingAction, router]);

  const handleClose = useCallback(() => {
    setPendingAction(null);
  }, []);

  return (
    <UnsavedChangesContext.Provider
      value={{ isDirty, setIsDirty, confirmNavigation, confirmSignOut }}
    >
      {children}

      <ConfirmDialog
        isOpen={!!pendingAction}
        isDanger={true}
        eyebrow="UNSAVED CHANGES"
        title={
          pendingAction?.type === 'signout'
            ? 'Discard changes & sign out?'
            : 'Discard unsaved changes?'
        }
        description={
          pendingAction?.type === 'signout'
            ? 'You have unsaved changes in tournament settings. If you sign out now, your edits will be permanently lost.'
            : 'You have unsaved changes in tournament settings. If you leave this page, your edits will be permanently lost.'
        }
        confirmText={
          pendingAction?.type === 'signout'
            ? 'Discard & Sign Out'
            : 'Discard & Leave'
        }
        cancelText="Stay on Page"
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}
