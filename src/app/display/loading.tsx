export default function DisplayLoading() {
  return (
    <div
      className="fixed inset-0 bg-[#060b24] text-white flex flex-col items-center justify-center p-8 select-none"
      aria-label="Connecting to projector stage…"
    >
      <div className="relative mb-6">
        <div className="w-16 h-16 border-4 border-[#efff00] border-t-transparent rounded-full animate-spin" />
      </div>
      <h1 className="text-2xl font-black uppercase tracking-widest text-[#efff00] font-sans">
        AUCTION ASSIST
      </h1>
      <p className="mt-2 text-sm text-[#7f94ca] font-semibold tracking-wider uppercase">
        Connecting to live auction stage…
      </p>
    </div>
  );
}
