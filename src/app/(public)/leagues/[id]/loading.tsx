export default function LoadingLeague() {
  return (
    <div className="flex flex-1 flex-col animate-pulse">
      <div className="bg-gradient-to-r from-[#12240F] to-background px-6 md:px-16 py-8 space-y-3">
        <div className="h-9 w-72 max-w-full rounded-md bg-white/10" />
        <div className="h-4 w-52 rounded-md bg-white/5" />
      </div>
      <div className="px-6 md:px-16 py-8 space-y-6">
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-md bg-white/5" />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-white/10 bg-card" />
      </div>
    </div>
  );
}
