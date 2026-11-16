export default function PlayersLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading players directory…">
      {/* Page Header Skeleton */}
      <div className="players-page-header">
        <div>
          <div className="h-3 w-32 bg-white/20 mb-2" />
          <div className="h-9 w-60 bg-white/30" />
          <div className="h-4 w-48 bg-white/20 mt-2" />
        </div>
        <div className="h-11 w-32 bg-white/20 border border-white/20" />
      </div>

      {/* Toolbar Skeleton */}
      <div className="players-toolbar flex justify-between gap-4">
        <div className="h-11 flex-1 bg-white/10 border border-white/20" />
        <div className="h-11 w-36 bg-white/15" />
      </div>

      {/* Grid of Players Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="bg-[#0b163d] border-2 border-[#192b66] p-4 flex gap-4 min-h-[140px]"
          >
            <div className="w-20 h-24 bg-white/20 shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 w-28 bg-white/30" />
              <div className="h-3 w-16 bg-white/20" />
              <div className="h-5 w-20 bg-white/25 mt-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
