'use client';

import React, { useEffect } from 'react';

export default function DisplayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Projector display error:', error.message);
  }, [error]);

  return (
    <div className="fixed inset-0 bg-[#060b24] text-white flex flex-col items-center justify-center p-8 select-none">
      <div className="border-4 border-[#efff00] bg-[#0c163b] p-8 max-w-md text-center shadow-[6px_6px_0_#030718]">
        <div className="inline-block px-3 py-1 bg-[#efff00] text-[#09143f] font-black text-xs uppercase tracking-wider mb-4">
          STAGE DISCONNECTED
        </div>

        <h1 className="text-xl font-black uppercase tracking-wider text-white mb-2">
          Projector Stage Interrupted
        </h1>

        <p className="text-xs text-[#8fa7db] font-medium mb-6">
          The live stage stream encountered a network or synchronization error.
        </p>

        <button
          type="button"
          onClick={() => reset()}
          className="px-6 py-3 bg-[#efff00] text-[#09143f] font-black uppercase tracking-wider hover:bg-[#d4e400] transition-colors"
        >
          Reconnect Stage
        </button>
      </div>
    </div>
  );
}
