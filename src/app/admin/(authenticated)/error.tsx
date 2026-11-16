'use client';

import React, { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log safe error reference for debugging without exposing raw DB credentials
    console.error('Admin route error:', error.message);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="bg-[#0b163d] border-4 border-[#efff00] p-8 max-w-lg w-full text-center shadow-[6px_6px_0_#050b20]">
        <div className="inline-block px-3 py-1 bg-[#efff00] text-[#09143f] font-black text-xs uppercase tracking-wider mb-4">
          TEMPORARY INTERRUPT
        </div>

        <h1 className="text-2xl font-black uppercase tracking-wider text-white mb-2">
          Unable to load console
        </h1>

        <p className="text-sm text-[#8fa7db] font-medium mb-6">
          A server or network error occurred while loading this view. You can retry loading or return to the main console.
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => reset()}
            className="px-6 py-3 bg-[#efff00] text-[#09143f] font-black uppercase tracking-wider hover:bg-[#d4e400] transition-colors"
          >
            Retry Connection
          </button>
          <a
            href="/admin/auction"
            className="px-6 py-3 border-2 border-white/30 text-white font-bold uppercase tracking-wider hover:bg-white/10 transition-colors"
          >
            Auction Console
          </a>
        </div>
      </div>
    </div>
  );
}
