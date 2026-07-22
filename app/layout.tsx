import type { Metadata, Viewport } from "next";
import { Noto_Sans_Sinhala } from "next/font/google";

import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

/**
 * app/layout.tsx
 *
 * Root layout for "Sunday School Assistant" (දහම් පාසල් සහායක).
 *
 * - Loads Noto Sans Sinhala so Sinhala script renders cleanly and legibly
 *   on every device, instead of falling back to whatever (often poor)
 *   Sinhala glyphs the OS default font ships with.
 * - Declares the PWA manifest + Apple "add to home screen" metadata.
 * - Mounts <ServiceWorkerRegister /> once, globally, so public/sw.js is
 *   active on every page (app shell caching + Background Sync wake-ups).
 *
 * Assumes a standard Next.js + Tailwind scaffold already provides
 * `./globals.css`. If shadcn/ui hasn't been initialized yet, run
 * `npx shadcn@latest init` so the CSS variables Button/Card/Textarea/Alert
 * rely on (e.g. --primary, --border) are defined there.
 */

const notoSinhala = Noto_Sans_Sinhala({
  subsets: ["sinhala"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "දහම් පාසල් සහායක",
  description: "ගුරුවරුන් සඳහා බයිබල් පාඩම් සකස් කරන සහායකය",
  manifest: "/manifest.json",
  authors: [{ name: "Prabhath Lokuge" }],
  creator: "Prabhath Lokuge",
  keywords: ["Sunday school", "Bible", "Sinhala", "lesson", "church", "Sri Lanka", "ළමා", "දහම් පාඩශාලාව"],
  openGraph: {
    type: "website",
    locale: "si_LK",
    title: "දහම් පාසල් සහායක",
    description: "ගුරුවරුන් සඳහා ස්වයංක්‍රීයව සිංහල බයිබල් පාඩම් සකස් කරන AI සහායකය",
    siteName: "දහම් පාසල් සහායක",
  },
  twitter: {
    card: "summary",
    title: "දහම් පාසල් සහායක",
    description: "ගුරුවරුන් සඳහා ස්වයංක්‍රීයව සිංහල බයිබල් පාඩම් සකස් කරන AI සහායකය",
  },
  appleWebApp: {
    capable: true,
    title: "දහම් පාසල් සහායක",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#b45309",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="si">
      <body className={`${notoSinhala.className} antialiased`}>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
