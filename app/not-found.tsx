import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "හමු නොවිණ — දහම් පාසල් සහායක" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100 px-4 text-center">
      <p className="text-7xl">📖</p>
      <h1 className="text-3xl font-bold text-amber-900">පිටුව හමු නොවිණ</h1>
      <p className="max-w-sm text-base text-amber-700">
        ඔබ සොයන පිටුව නොමැත. link එක වැරදිද හෝ ඒ page එක remove කර ඇත.
      </p>
      <Link href="/" className="rounded-2xl bg-amber-700 px-6 py-3 text-lg font-bold text-white shadow hover:bg-amber-800">
        මුල් පිටුවට යන්න
      </Link>
    </main>
  );
}
