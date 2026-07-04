"use client";

/**
 * app/guide/page.tsx
 *
 * In-app "how to use this app" tour guide, in Sinhala and English with a
 * toggle to switch between them — linked from the dashboard footer.
 *
 * Design note on the Sinhala-only UI rule elsewhere in this app: every
 * button/UI reference below quotes the ACTUAL Sinhala button text from
 * the app (e.g. "පාඩම සකස් කරන්න"), in both language versions. That way
 * a reader of either version can visually match the quoted Sinhala
 * against what's actually on screen — the app's real buttons are never
 * in English, so an English-only description of "tap Generate Lesson"
 * would describe a button that doesn't exist. The one exception is step
 * 7 (installing via the browser), which quotes Chrome's own menu item —
 * that's the browser's UI, not this app's, so it stays in whatever
 * language the visitor's browser happens to be in.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Mic,
  RotateCcw,
  Share2,
  Smartphone,
  Sparkles,
  WifiOff,
} from "lucide-react";

type Lang = "si" | "en";

interface GuideStep {
  Icon: typeof Mic;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
}

const STEPS: GuideStep[] = [
  {
    Icon: Sparkles,
    title: { si: "මෙය මොකක්ද?", en: "What is this app?" },
    description: {
      si: "ඔබේ අදහසකින් සහායකය සම්පූර්ණ දහම් පාඩමක් — කතාව, බයිබල් පදය, ප්‍රශ්න, සහ රූපයක් — ස්වයංක්‍රීයව සකස් කරයි.",
      en: "From a single idea, the assistant automatically prepares a complete lesson — story, Bible verse, questions, and an illustration.",
    },
  },
  {
    Icon: Mic,
    title: { si: "පාඩමක් සකස් කරන්නේ කොහොමද?", en: "How to create a lesson" },
    description: {
      si: "මුලින්ම දරුවන්ගේ වයස් කාණ්ඩය (අවු. 5-7 / 8-10 / 11-12) තෝරන්න. පසුව මයික්‍රෆෝනය ඔබා ඔබේ අදහස කථා කරන්න, හෝ පහළ කොටුවේ ලියන්න. ඉන් පසු \u201cපාඩම සකස් කරන්න\u201d ඔබන්න.",
      en: "First select the children's age band (5-7 / 8-10 / 11-12) — this shapes the vocabulary and complexity of the generated lesson. Then tap the microphone and speak your idea, or type it in the box. Finally tap \u201cපාඩම සකස් කරන්න\u201d (Generate Lesson).",
    },
  },
  {
    Icon: BookOpen,
    title: { si: "පන්තියට ඉදිරිපත් කිරීම", en: "Presenting to the class" },
    description: {
      si: "\u201cඉදිරිපත් කිරීම අරඹන්න\u201d ඔබලා, ඇඟිල්ලෙන් ඇද දමා රූපය/කතාව/ප්‍රශ්න අතර යාගත හැක. \u201cහඬින් කියවන්න\u201d බොත්තමෙන් එම කොටස ඔබට කියවා පෙන්වයි.",
      en: "Tap \u201cඉදිරිපත් කිරීම අරඹන්න\u201d (Start Presentation), then swipe through the image, story, and quiz slides. \u201cහඬින් කියවන්න\u201d (Read Aloud) reads each slide out loud.",
    },
  },
  {
    Icon: RotateCcw,
    title: { si: "පාඩම අසතුටුදායකද?", en: "Not happy with the lesson?" },
    description: {
      si: "\u201cනැවත සකස් කරන්න\u201d ඔබලා එම අදහසින්ම අලුත් පාඩමක් ලබාගත හැක.",
      en: "Tap \u201cනැවත සකස් කරන්න\u201d (Regenerate) to get a fresh take on the same idea.",
    },
  },
  {
    Icon: Share2,
    title: { si: "බෙදාගැනීම සහ සුරැකීම", en: "Sharing & saving" },
    description: {
      si: "ඉදිරිපත් කිරීම තුළ WhatsApp බෙදාගැනීම, මුද්‍රණය, සහ PDF බාගත කිරීම තිබේ. ඔබ සකස් කළ සියලු පාඩම් \u201cපැරණි පාඩම්\u201d යටතේ සුරැකේ.",
      en: "Inside the presentation you'll find WhatsApp sharing, printing, and PDF download. Every lesson you create is saved under \u201cපැරණි පාඩම්\u201d (Old Lessons).",
    },
  },
  {
    Icon: WifiOff,
    title: { si: "අන්තර්ජාලය නැති විට", en: "When there's no internet" },
    description: {
      si: "ඔබේ ඉල්ලීම ස්වයංක්‍රීයව සුරැකේ. අන්තර්ජාලය ලැබුණු විගස පාඩම ස්වයංක්‍රීයව සකස් වේ.",
      en: "Your request is saved automatically. The lesson is prepared automatically the moment your internet connection returns.",
    },
  },
  {
    Icon: Smartphone,
    title: { si: "යෙදුම ස්ථාපනය කිරීම", en: "Installing the app" },
    description: {
      si: "Chrome මෙනුවෙන් (⋮) \u201cAdd to Home Screen\u201d තෝරන්න — එවිට යෙදුම ඔබේ දුරකථනයේ අයිකනයක් ලෙස පෙනේ.",
      en: "From Chrome's menu (⋮), choose \u201cAdd to Home Screen\u201d — the app then appears as an icon on your phone, just like any other app.",
    },
  },
];

const UI_TEXT = {
  back: { si: "ආපසු", en: "Back" },
  pageTitle: { si: "භාවිත මඟ පෙන්වීම", en: "How to Use This App" },
  pageSubtitle: {
    si: "දහම් පාසල් සහායක භාවිතා කරන ආකාරය",
    en: "A quick tour of every feature",
  },
};

export default function GuidePage() {
  const [lang, setLang] = useState<Lang>("si");

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-base font-semibold text-amber-700 hover:text-amber-900"
          >
            <ArrowLeft className="h-5 w-5" /> {UI_TEXT.back[lang]}
          </Link>

          <div className="flex gap-2 rounded-full bg-amber-100 p-1">
            <button
              type="button"
              onClick={() => setLang("si")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                lang === "si" ? "bg-amber-600 text-white shadow" : "text-amber-700"
              }`}
            >
              සිංහල
            </button>
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                lang === "en" ? "bg-amber-600 text-white shadow" : "text-amber-700"
              }`}
            >
              ඉංග්‍රීසි
            </button>
          </div>
        </div>

        <header className="space-y-1">
          <h1 className="text-3xl font-bold text-amber-900">{UI_TEXT.pageTitle[lang]}</h1>
          <p className="text-base text-amber-700">{UI_TEXT.pageSubtitle[lang]}</p>
        </header>

        <ol className="space-y-4">
          {STEPS.map((step, i) => (
            <li
              key={i}
              className="flex gap-4 rounded-2xl border-2 border-amber-200 bg-white/80 p-5 shadow-md"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white">
                <step.Icon className="h-6 w-6" />
              </span>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-amber-900">{step.title[lang]}</h2>
                <p className="text-base leading-relaxed text-stone-700">{step.description[lang]}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
