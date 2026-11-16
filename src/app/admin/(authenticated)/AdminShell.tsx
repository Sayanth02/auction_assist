'use client';

import React from 'react';
import AdminNav from './AdminNav';
import { UnsavedChangesProvider } from '@/context/UnsavedChangesContext';

interface AdminShellProps {
  tournamentName?: string | null;
  logoUrl?: string | null;
  children: React.ReactNode;
}

export default function AdminShell({
  tournamentName,
  logoUrl,
  children,
}: AdminShellProps) {
  return (
      <UnsavedChangesProvider>
        <div className="min-h-screen bg-[#1947f4] text-white relative flex flex-col overflow-x-hidden font-['DM_Sans',sans-serif] antialiased">
          {/* Full-screen fixed diagonal polygon overlays covering the entire viewport with zero cuts */}
          <div
            className="pointer-events-none fixed inset-0 z-0 bg-[#142cb4]"
            style={{ clipPath: 'polygon(83% 0, 100% 0, 100% 40%, 69% 100%, 42% 100%)' }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none fixed inset-0 z-0 bg-[#0c184d]"
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% 38%, 0 72%)' }}
            aria-hidden="true"
          />

          <AdminNav
            tournamentName={tournamentName}
            logoUrl={logoUrl}
          />

        <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-9 py-6">
          {children}
        </main>
    </div>
    </UnsavedChangesProvider >
  );
}
