"use client";

/**
 * app/guide/page.tsx  v2.0
 *
 * Bilingual (සිංහල / English) feature tour guide, updated for all v2.0
 * features. Toggle between languages with the pill buttons — same pattern
 * used on the dashboard's voice-language selector.
 *
 * Note on quoting the app's own Sinhala button labels: every step below
 * quotes the ACTUAL Sinhala text shown on screen so a reader of either
 * language can visually match the description to the real UI. The app's
 * buttons are never in English, so describing "tap Generate Lesson" would
 * be describing a button that doesn't exist.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ALargeSmall,
  ArrowLeft,
  BookOpen,
  Clipboard,
  Expand,
  HelpCircle,
  Lightbulb,
  Mic,
  RotateCcw,
  Search,
  Share2,
  Smartphone,
  Sparkles,
  Star,
  Timer,
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
      si: "ඔබේ අදහසකින් සහායකය සම්පූර්ණ බයිබල් පාඩමක් — කතාව, කටපාඩම් පදය, ප්‍රශ්න, ක්‍රියාකාරකම්, සහ රූපයක් — ස්වයංක්‍රීයව සිංහලෙන් සකස් කරයි.",
      en: "From a single idea, the assistant automatically prepares a complete Bible lesson in Sinhala — story, memory verse, questions, activities, and an illustration.",
    },
  },
  {
    Icon: BookOpen,
    title: { si: "1. කාණ්ඩය තෝරන්න", en: "1. Choose the age group" },
    description: {
      si: "අවු. 5-7, 8-10, 11-12 — ළමුන් සඳහා; හෝ 'වැඩිහිටි' — වැඩිහිටි බයිබල් අධ්‍යයනය සඳහා. ඒ ඒ කාණ්ඩයට ගැළපෙන භාෂාවෙන් සහ ගැඹුරින් පාඩම සකස් වේ.",
      en: "Choose 5-7, 8-10, or 11-12 for children's classes, or 'වැඩිහිටි' (Adult) for adult Bible study. The lesson's depth, vocabulary, and question style all adapt automatically.",
    },
  },
  {
    Icon: Lightbulb,
    title: { si: "2. ඕනේ කොටස් තෝරන්න", en: "2. Choose which sections to generate" },
    description: {
      si: "📖 කතාව · ❓ ප්‍රශ්න · ✨ ක්‍රියා · 🎨 රූපය — ඕනේ ඒවා ඔබා select කරන්න (amber = ✓). ඕනේ නැති ඒවා skip කළොත් ඒවා generate නොවී ඉක්මනින් ලැබේ. කටපාඩම් පදය සහ බයිබල් පදය සැමවිටම ලැබේ.",
      en: "Tap 📖 Story, ❓ Quiz, ✨ Activities, 🎨 Image to toggle sections on or off. Deselected sections are skipped for a faster result. Memory verse and Bible verse are always generated.",
    },
  },
  {
    Icon: Mic,
    title: { si: "3. අදහස කියන්න හෝ ලියන්න", en: "3. Speak or type your idea" },
    description: {
      si: "💡 ඉක්මන් අදහස් chips ස්පර්ශ කළ විගස textarea-ට ඇතුළත් වෙයි. 🕐 කලින් ඉල්ලීම් 'මෑත අදහස්' ලෙස පෙනේ. ලිව්ව දෙය refresh කළත් ස්වයංක්‍රීයව සුරැකේ. × ඔබා clear කළ හැකිය. 'පාඩම සකස් කරන්න' click කරන්න.",
      en: "Tap the 💡 quick-topic chips to fill the box instantly. 🕐 Recent topics appear below for quick reuse. Your draft is auto-saved — it survives a page refresh. Tap × to clear. Then tap 'පාඩම සකස් කරන්න'.",
    },
  },
  {
    Icon: ALargeSmall,
    title: { si: "4. අකුරු ප්‍රමාණය", en: "4. Font size" },
    description: {
      si: "ශීර්ෂකයේ 'A' button ඔබා ගිය විට Normal → A+ → A++ ලෙස වෙනස් වේ. ඔබේ choice ස්වයංක්‍රීයව සුරැකේ.",
      en: "Tap the 'A' button in the header to cycle through Normal → A+ → A++ font sizes. Your preference is saved automatically.",
    },
  },
  {
    Icon: BookOpen,
    title: { si: "5. ඉදිරිපත් කිරීම", en: "5. Presenting to the class" },
    description: {
      si: "'ඉදිරිපත් කිරීම අරඹන්න' ඔබලා, ඇඟිල්ලෙන් ඇද දමා ස්ලයිඩ් අතර ගමන් කළ හැකිය. ⭐ කටපාඩම් පදය, 📖 කතාව, ✨ ක්‍රියාකාරකම්, ❓ ප්‍රශ්න. Keyboard ← → සහ Escape ද ක්‍රියා කරයි. ⛶ fullscreen button ද ඇත.",
      en: "Tap 'ඉදිරිපත් කිරීම අරඹන්න' then swipe through: ⭐ Memory verse, 📖 Story, ✨ Activities, ❓ Quiz. Keyboard ← → and Escape also work on desktop. A ⛶ fullscreen button is available.",
    },
  },
  {
    Icon: Clipboard,
    title: { si: "6. Copy කිරීම", en: "6. Copying content" },
    description: {
      si: "සෑම ස්ලයිඩ් එකකම 'පිටපත් කරන්න' button ඔබා එම කොටස clipboard-ට copy කළ හැකිය. WhatsApp, email, document ඕනෑ ඕනෑ තැනක paste කළ හැකිය.",
      en: "Every slide has a 'පිටපත් කරන්න' (Copy) button. Tap it to copy that section to your clipboard, then paste anywhere — WhatsApp, email, document.",
    },
  },
  {
    Icon: Timer,
    title: { si: "7. Quiz Timer", en: "7. Quiz Timer" },
    description: {
      si: "Quiz ස්ලයිඩ් එකේ '⏱ Timer' button ඔබලා 60, 90, හෝ 120 තත්පර countdown timer එකක් start කළ හැකිය. අවසාන 10 තත්පරවලදී timer එක රතු පැහැයෙන් pulse වෙයි, ඉවර වූ විට vibration දෙයි.",
      en: "On the Quiz slide, tap '⏱ Timer' to reveal a 60/90/120-second countdown. It pulses red in the last 10 seconds and vibrates when time is up.",
    },
  },
  {
    Icon: RotateCcw,
    title: { si: "8. නැවත සකස් කරන්න", en: "8. Regenerate" },
    description: {
      si: "ලැබුණු පාඩම අසතුටුදායක නම් 'නැවත සකස් කරන්න' ඔබලා, ඒ ම අදහසින්, ඒ ම කාණ්ඩය සහ sections සමඟ, අලුත් පාඩමක් ලබාගත හැකිය.",
      en: "If you're not happy with the lesson, tap 'නැවත සකස් කරන්න' (Regenerate) to get a fresh take using the same idea, age group, and sections.",
    },
  },
  {
    Icon: Share2,
    title: { si: "9. බෙදාගැනීම සහ සුරැකීම", en: "9. Sharing & saving" },
    description: {
      si: "ඉදිරිපත් කිරීම තුළ WhatsApp share, print, PDF download ඇත. ඔබ සකස් කළ සියලු පාඩම් 'පැරණි පාඩම්' හි ස්වයංක්‍රීයව සුරැකේ. ⭐ ඔබා ඕනෑ ම පාඩමක් ප්‍රිය ලෙස bookmark කළ හැකිය.",
      en: "Inside the presentation: WhatsApp share, print, and PDF download. Every lesson is saved under 'පැරණි පාඩම්'. Tap ⭐ on any lesson to bookmark it as a favourite.",
    },
  },
  {
    Icon: Search,
    title: { si: "10. පැරණි පාඩම් සොයන්න", en: "10. Searching old lessons" },
    description: {
      si: "'පැරණි පාඩම්' page-ට ගොස් search bar-ට ශීර්ෂකය, බයිබල් පදය, හෝ කටපාඩම් පදය ලිවීමෙන් ඉක්මනින් හොයාගත හැකිය. ⭐ button ඔබා ප්‍රිය පාඩම් විතරක් filter කළ හැකිය.",
      en: "Go to 'පැරණි පාඩම්' and type in the search bar to filter by title, verse, or memory verse. Tap ⭐ to show only your favourite lessons.",
    },
  },
  {
    Icon: WifiOff,
    title: { si: "11. අන්තර්ජාලය නැති විට", en: "11. Offline use" },
    description: {
      si: "ඉල්ලීම ස්වයංක්‍රීයව සුරැකේ. අන්තර්ජාලය ලැබුණු විගස, app-ය open නොවුණත්, ස්වයංක්‍රීයව සකස් වේ.",
      en: "Your request is saved automatically. The lesson is generated automatically the moment your connection returns — even if the app is in the background.",
    },
  },
  {
    Icon: Smartphone,
    title: { si: "12. App ස්ථාපනය", en: "12. Installing the app" },
    description: {
      si: "Chrome browser-ෙ menu (⋮) → 'Add to Home Screen' — app-ය ඔබේ දුරකථනයේ icon ලෙස home screen-ට add වෙයි. App store ඕනේ නෑ.",
      en: "Chrome menu (⋮) → 'Add to Home Screen' — the app appears as a home screen icon. No app store needed.",
    },
  },
];

const UI_TEXT = {
  back:        { si: "ආපසු",              en: "Back" },
  pageTitle:   { si: "භාවිත මඟ පෙන්වීම", en: "How to Use This App" },
  pageSubtitle: {
    si: "දහම් පාසල් සහායකයේ සියලු පහසුකම් — v2.0",
    en: "A complete tour of every feature — v2.0",
  },
};

export default function GuidePage() {
  const [lang, setLang] = useState<Lang>("si");

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/"
            className="inline-flex items-center gap-2 text-base font-semibold text-amber-700 hover:text-amber-900">
            <ArrowLeft className="h-5 w-5" /> {UI_TEXT.back[lang]}
          </Link>
          <div className="flex gap-2 rounded-full bg-amber-100 p-1">
            {(["si", "en"] as Lang[]).map((l) => (
              <button key={l} type="button" onClick={() => setLang(l)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  lang === l ? "bg-amber-600 text-white shadow" : "text-amber-700"
                }`}>
                {l === "si" ? "සිංහල" : "ඉංග්‍රීසි"}
              </button>
            ))}
          </div>
        </div>

        <header className="space-y-1">
          <h1 className="text-3xl font-bold text-amber-900">{UI_TEXT.pageTitle[lang]}</h1>
          <p className="text-base text-amber-700">{UI_TEXT.pageSubtitle[lang]}</p>
        </header>

        <ol className="space-y-4">
          {STEPS.map((step, i) => (
            <li key={i} className="flex gap-4 rounded-2xl border-2 border-amber-200 bg-white/80 p-5 shadow-md">
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
