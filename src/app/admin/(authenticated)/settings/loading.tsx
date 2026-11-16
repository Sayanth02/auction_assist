export default function SettingsLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading settings…">
      {/* Page Header Skeleton */}
      <div className="settings-page-header">
        <div className="h-3 w-32 bg-white/20 mb-2" />
        <div className="h-9 w-64 bg-white/30" />
        <div className="h-4 w-72 bg-white/20 mt-2" />
      </div>

      {/* 2-Column Layout Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#0b163d] border-2 border-[#192b66] p-6 space-y-4">
            <div className="h-6 w-40 bg-white/30 mb-4" />
            <div className="h-10 w-full bg-white/10" />
            <div className="h-10 w-full bg-white/10" />
            <div className="h-10 w-full bg-white/10" />
          </div>
          <div className="bg-[#0b163d] border-2 border-[#192b66] p-6 space-y-4">
            <div className="h-6 w-40 bg-white/30 mb-4" />
            <div className="h-10 w-full bg-white/10" />
            <div className="h-10 w-full bg-white/10" />
          </div>
        </div>

        <div className="bg-[#0a1435] border-2 border-[#192b66] p-6 space-y-4">
          <div className="h-6 w-36 bg-white/30 mb-4" />
          <div className="h-24 w-24 bg-white/20 mx-auto" />
          <div className="h-5 w-44 bg-white/25 mx-auto" />
          <div className="h-12 w-full bg-white/10 mt-6" />
        </div>
      </div>
    </div>
  );
}
