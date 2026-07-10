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
      si: "ඔබේ අදහසකින් සහායකය සම්පූර්ණ බයිබල් පාඩමක් — කතාව, බයිබල් පදය, ප්‍රශ්න, සහ රූපයක් — ස්වයංක්‍රීයව සිංහලෙන් සකස් කරයි.",
      en: "From a single idea, the assistant automatically prepares a complete Bible lesson in Sinhala — story, verse, questions, and an illustration.",
    },
  },
  {
    Icon: Mic,
    title: { si: "1. කාණ්ඩය තෝරන්න", en: "1. Choose the age group" },
    description: {
      si: "අවු. 5-7, 8-10, 11-12 — ළමුන් සඳහා; හෝ 'වැඩිහිටි' — වැඩිහිටි අධ්‍යයන සඳහා. ඒ ඒ කාණ්ඩයට ගැළපෙන භාෂාවෙන් සහ ගැඹුරින් පාඩම සකස් වේ.",
      en: "Choose 5-7, 8-10, or 11-12 for children's classes, or 'වැඩිහිටි' (Adult) for adult Bible study. The lesson's language, depth, and question style adapt automatically.",
    },
  },
  {
    Icon: BookOpen,
    title: { si: "2. ඕනේ කොටස් තෝරන්න", en: "2. Choose which sections to generate" },
    description: {
      si: "'කතාව', 'ප්‍රශ්න', 'රූපය' — ඕනේ ඒවා ඔබා (amber වර්ණ = ✓ selected). ඕනේ නැති ඒවා skip කළොත් ඒවා generate නොවී ඉක්මනින් ලැබේ. බයිබල් පදය සහ මාතෘකාව සැමවිටම ලැබේ.",
      en: "Tap 'කතාව' (Story), 'ප්‍රශ්න' (Quiz), 'රූපය' (Image) to toggle each section on or off. Only selected sections are generated — so if you only need the verse and story, skip quiz and image for a faster result.",
    },
  },
  {
    Icon: Mic,
    title: { si: "3. අදහස කියන්න හෝ ලියන්න", en: "3. Speak or type your idea" },
    description: {
      si: "මයික්‍රෆෝනය ඔබා ඔබේ අදහස කථා කරන්න, හෝ පහළ කොටුවේ ලියන්න. 'පාඩම සකස් කරන්න' ඔබන්න.",
      en: "Tap the microphone and speak your idea, or type it in the box below. Then tap 'පාඩම සකස් කරන්න' (Generate Lesson).",
    },
  },
  {
    Icon: RotateCcw,
    title: { si: "පාඩම අසතුටුදායකද?", en: "Not happy with the lesson?" },
    description: {
      si: "'නැවත සකස් කරන්න' ඔබලා එම අදහසින්ම, ඒ ම කාණ්ඩය සහ කොටස් සමඟ, අලුත් පාඩමක් ලබාගත හැක.",
      en: "Tap 'නැවත සකස් කරන්න' (Regenerate) to get a fresh take using the same idea, age group, and selected sections.",
    },
  },
  {
    Icon: BookOpen,
    title: { si: "පන්තියට ඉදිරිපත් කිරීම", en: "Presenting to the class" },
    description: {
      si: "'ඉදිරිපත් කිරීම අරඹන්න' ඔබලා, ඇඟිල්ලෙන් ඇද දමා රූපය / කතාව / ප්‍රශ්න අතර යාගත හැක. 'හඬින් කියවන්න' බොත්තමෙන් එම කොටස ඔබට කියවා පෙන්වයි.",
      en: "Tap 'ඉදිරිපත් කිරීම අරඹන්න' (Start Presentation), then swipe through the slides. 'හඬින් කියවන්න' (Read Aloud) reads each slide out loud.",
    },
  },
  {
    Icon: Share2,
    title: { si: "බෙදාගැනීම සහ සුරැකීම", en: "Sharing & saving" },
    description: {
      si: "ඉදිරිපත් කිරීම තුළ WhatsApp බෙදාගැනීම, මුද්‍රණය, සහ PDF බාගත කිරීම තිබේ. ඔබ සකස් කළ සියලු පාඩම් 'පැරණි පාඩම්' යටතේ ස්වයංක්‍රීයව සුරැකේ.",
      en: "Inside the presentation: WhatsApp share, print, and PDF download. Every lesson is automatically saved under 'පැරණි පාඩම්' (Past Lessons).",
    },
  },
  {
    Icon: WifiOff,
    title: { si: "අන්තර්ජාලය නැති විට", en: "When there's no internet" },
    description: {
      si: "ඔබේ ඉල්ලීම ස්වයංක්‍රීයව සුරැකේ. අන්තර්ජාලය ලැබුණු විගස පාඩම ස්වයංක්‍රීයව සකස් වේ.",
      en: "Your request is saved automatically. The lesson is prepared the moment your connection returns.",
    },
  },
  {
    Icon: Smartphone,
    title: { si: "යෙදුම ස්ථාපනය කිරීම", en: "Installing the app" },
    description: {
      si: "Chrome මෙනුවෙන් (⋮) 'Add to Home Screen' තෝරන්න — එවිට යෙදුම ඔබේ දුරකථනයේ අයිකනයක් ලෙස පෙනේ.",
      en: "From Chrome's menu (⋮), choose 'Add to Home Screen' — the app appears as an icon on your phone's home screen.",
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
