"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("App error:", error); }, [error]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100 px-4 text-center">
      <p className="text-7xl">⚠️</p>
      <h1 className="text-3xl font-bold text-amber-900">දෝෂයක් ඇති විය</h1>
      <p className="max-w-sm text-base text-amber-700">
        මෙම page-ය load කිරීමේදී ගැටළුවක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={reset}
          className="rounded-2xl bg-amber-700 px-6 py-3 text-lg font-bold text-white shadow hover:bg-amber-800">
          නැවත උත්සාහ කරන්න
        </button>
        <Link href="/" className="rounded-2xl border-2 border-amber-400 px-6 py-3 text-lg font-bold text-amber-800 hover:bg-amber-50">
          මුල් පිටුව
        </Link>
      </div>
    </main>
  );
}
