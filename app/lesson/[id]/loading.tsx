export default function LessonLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
        <p className="text-base font-semibold text-amber-700">පාඩම පූරණය වෙමින්...</p>
      </div>
    </main>
  );
}
