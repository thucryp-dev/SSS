export default function HistoryLoading() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-5 animate-pulse">
        <div className="h-6 w-24 rounded-full bg-amber-200" />
        <div className="h-10 w-48 rounded-xl bg-amber-200" />
        <div className="h-12 w-full rounded-2xl bg-amber-100" />
        {[1,2,3,4].map((i) => (
          <div key={i} className="rounded-2xl border-2 border-amber-100 bg-white/60 p-4">
            <div className="flex gap-3">
              <div className="h-9 w-9 shrink-0 rounded-full bg-amber-100" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-3/4 rounded-lg bg-amber-100" />
                <div className="h-4 w-1/2 rounded-lg bg-amber-50" />
                <div className="flex gap-2">
                  <div className="h-5 w-16 rounded-full bg-amber-50" />
                  <div className="h-5 w-6 rounded-full bg-amber-50" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
