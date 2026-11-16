export default function AuctionLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading auction console…">
      {/* Page Header Skeleton */}
      <div className="page-header">
        <div>
          <div className="h-3 w-32 bg-white/20 mb-2 rounded-none" />
          <div className="h-9 w-64 bg-white/30 rounded-none" />
          <div className="h-4 w-48 bg-white/20 mt-2 rounded-none" />
        </div>
        <div className="h-12 w-40 bg-white/10 rounded-none border border-white/20" />
      </div>

      {/* Hero: Player Stage & Bid Board Skeletons */}
      <div className="hero">
        <div className="player-stage bg-[#0d1c4b] border-2 border-[#1c2e6b] p-6 min-h-[300px]">
          <div className="h-4 w-28 bg-white/20 mb-3" />
          <div className="h-8 w-60 bg-white/30 mb-4" />
          <div className="flex gap-3 mb-4">
            <div className="h-10 w-24 bg-white/15" />
            <div className="h-10 w-24 bg-white/15" />
          </div>
          <div className="h-4 w-36 bg-white/20" />
        </div>

        <div className="bid-board bg-[#0a1435] border-2 border-[#1c2e6b] p-6 min-h-[300px] flex flex-col justify-between">
          <div>
            <div className="h-4 w-20 bg-white/20 mb-3" />
            <div className="h-14 w-48 bg-white/30 mb-2" />
            <div className="h-4 w-40 bg-white/20" />
          </div>
          <div className="h-12 w-full bg-white/10 border border-white/20" />
        </div>
      </div>

      {/* Teams Grid Skeleton */}
      <div className="teams-grid">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="team-card bg-[#0b163d] border-2 border-[#192b66] p-4 min-h-[170px]"
          >
            <div className="flex justify-between items-center mb-3">
              <div className="h-3 w-16 bg-white/20" />
              <div className="h-3 w-12 bg-white/20" />
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-white/20" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-28 bg-white/30" />
                <div className="h-3 w-16 bg-white/15" />
              </div>
            </div>
            <div className="h-10 w-full bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
