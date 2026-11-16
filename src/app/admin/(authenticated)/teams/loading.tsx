export default function TeamsLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading clubs directory…">
      {/* Page Header Skeleton */}
      <div className="manage-page-header">
        <div>
          <div className="h-3 w-32 bg-white/20 mb-2" />
          <div className="h-9 w-52 bg-white/30" />
          <div className="h-4 w-44 bg-white/20 mt-2" />
        </div>
        <div className="h-11 w-32 bg-white/20 border border-white/20" />
      </div>

      {/* Toolbar Skeleton */}
      <div className="manage-toolbar flex justify-between gap-4">
        <div className="h-11 flex-1 bg-white/10 border border-white/20" />
        <div className="h-11 w-32 bg-white/15" />
      </div>

      {/* Grid of Teams Skeleton */}
      <div className="manage-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="manage-card bg-[#0b163d] border-2 border-[#192b66] p-4 flex flex-col justify-between min-h-[160px]"
          >
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-white/20" />
              <div className="space-y-2 flex-1">
                <div className="h-5 w-32 bg-white/30" />
                <div className="h-3 w-20 bg-white/20" />
              </div>
            </div>
            <div className="h-8 w-full bg-white/10 mt-4" />
          </div>
        ))}
      </div>
    </div>
  );
}
