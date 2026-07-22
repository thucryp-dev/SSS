import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Bug, Rocket, Sparkles } from "lucide-react";

/**
 * app/changelog/page.tsx
 *
 * Friendly, Sinhala, high-level "what's new" page for teachers — linked
 * from a small footer link on the main dashboard (app/page.tsx).
 *
 * This is the user-facing counterpart to CHANGELOG.md at the project
 * root, which is the detailed, English, developer-facing version of the
 * same history. Keep both updated together: every user-visible change
 * here should also have an entry there, but not every line in
 * CHANGELOG.md needs to appear here — skip internal/technical fixes that
 * a teacher wouldn't notice or care about.
 */

export const metadata: Metadata = {
  title: "අලුත් දේවල් — දහම් පාසල් සහායක",
};

type EntryKind = "major" | "feature" | "fix";

interface ChangelogEntry {
  version: string;
  date: string;
  kind: EntryKind;
  items: string[];
}

const entries: ChangelogEntry[] = [
  {
    version: "v2.1",
    date: "2026 ජූලි",
    kind: "feature",
    items: [
      "WhatsApp link preview-ය දැන් ඒ ඒ පාඩමේ ශීර්ෂකය සහ බයිබල් පදය පෙන්වයි",
      "📖 'පැරණි පාඩම්' හි 👁 button ඔබා ඕනෑ ම පාඩමක් ලැයිස්තුවෙන් සඟවාගත හැකිය",
      "ගුරුවරයා කළ ඉල්ලීම (💬) පැරණි පාඩම් ලැයිස්තුවේ දිස්වෙයි, සෙවීමේදීද භාවිතා වෙයි",
      "App update කළ විට, දුරකථනයේ install කළ app-ය ද ස්වයංක්‍රීයව update වෙයි",
    ],
  },
  {
    version: "v2.1",
    date: "2026 ජූලි",
    kind: "feature",
    items: [
      "සිංහල 404 සහ error pages එකතු කළා",
      "📖 'පැරණි පාඩම්' — 🙈 button ඔබා ඕනෑ ම පාඩමක් සඟවා ගත හැකිය (ආයෙත් 👁 ඔබා නැවත පෙන්විය හැකිය)",
      "📖 'පැරණි පාඩම්' — ඔබ ඇතුළත් කළ මුල් අදහස ද දැන් දිස් වේ, සෙවිය හැකිය",
      "WhatsApp link preview — දැන් shared lesson link-ය WhatsApp-ෙහි lesson ශීර්ෂකය සහ බයිබල් පදය සහිතව preview වේ",
    ],
  },
  {
    version: "v2.0",
    date: "2026 ජූලි",
    kind: "major",
    items: [
      "🔴 Gemini API key දෝෂය සම්පූර්ණයෙන් නිරාකරණය කළා — නව Google AI Studio keys (AQ.Ab...) දැන් නිවැරදිව ක්‍රියා කරයි",
      "⭐ 'කටපාඩම් පදය' — ළමුන් ප්‍රගුණ කිරීම සඳහා ඉදිරිපත් කිරීමේ විශේෂ ස්ලයිඩ් එකක් එකතු කළා",
      "✨ 'ක්‍රියාකාරකම්' — පන්තිය සඳහා සරල ක්‍රියාකාරකම් Gemini විසින් ම සකස් කෙරෙයි",
      "💡 ඉක්මන් අදහස් 8ක් — ස්පර්ශ කළ විගස ඇතුළත් වෙයි",
      "🕐 මෑත අදහස් ලැයිස්තුව — ඔබ කළ ඉල්ලීම් නැවත ඉක්මනින් use කළ හැකිය",
      "📝 ස්වයංක්‍රීය draft සුරැකීම — page refresh කළත් ලිව්ව දෙය නැති නොවෙයි",
      "🔤 අකුරු ප්‍රමාණය A / A+ / A++ — ගුරුවරයාගේ දර්ශනයට ගැළපෙන ලෙස සකස් කළ හැකිය",
      "📋 ඕනෑම ස්ලයිඩ් එකක් clipboard-ට copy කළ හැකිය",
      "⏱ Quiz timer — 60, 90, 120 තත්පර ගණිනකොට ring animation සහ vibration",
      "⌨ Keyboard navigation — ← → ඊතල (desktop සඳහා)",
      "⛶ Fullscreen ඉදිරිපත් කිරීම",
      "⭐ ප්‍රිය ලැයිස්තුව — 'පැරණි පාඩම්' හි ⭐ ඔබා ඕනෑම පාඩමක් bookmarks කළ හැකිය",
      "🔍 'පැරණි පාඩම්' හි පාඩම් සෙවිය හැකිය",
    ],
  },
  {
    version: "v1.12",
    date: "2026 ජූලි",
    kind: "feature",
    items: [
      "වැඩිහිටි ඉගෙනීමේ කණ්ඩායම ('වැඩිහිටි') සඳහා ගැඹුරු, දේව විද්‍යාත්මක පාඩම් සකස් කිරීමේ පහසුකම එකතු කළා",
      "සකස් කිරීමට ඕනේ කොටස් ('කතාව', 'ප්‍රශ්න', 'රූපය') ගුරුවරයාට ම තෝරාගත හැකි සේ සකස් කළා — ඕනේ කොටස් විතරක් සකස් කෙරෙයි",
      "Gemini සේවාව සම්බන්ධ දෝෂය නිරාකරණය කළා — දැන් ස්වයංක්‍රීයව හොඳම ආකෘතිය භාවිතා කෙරෙයි",
    ],
  },
  {
    version: "v1.11",
    date: "2026 ජූනි",
    kind: "feature",
    items: [
      "දරුවන්ගේ වයස් කාණ්ඩය (අවු. 5-7 / 8-10 / 11-12) තෝරා, ඒ වයසට ගැළපෙන පාඩමක් ලබාගත හැකි පහසුකම එකතු කළා",
    ],
  },
  {
    version: "v1.10",
    date: "2026 ජූනි",
    kind: "feature",
    items: ["යෙදුම භාවිතා කරන ආකාරය පියවරෙන් පියවර පෙන්වන මඟ පෙන්වීමක් එකතු කළා (සිංහල සහ ඉංග්‍රීසි)"],
  },
  {
    version: "v1.9",
    date: "2026 ජූනි",
    kind: "feature",
    items: [
      "දැන් එක් එක් ගුරුවරයාගේ පැරණි පාඩම් ලැයිස්තුව වෙනම තබා ගනී (පිවිසුමක් අවශ්‍ය නැත)",
      "පදයේ නිවැරදි වචන සඳහා ශුද්ධ බයිබලය පරීක්ෂා කරන ලෙස කුඩා මතක් කිරීමක් එකතු කළා",
    ],
  },
  {
    version: "v1.8",
    date: "2026 ජූනි",
    kind: "feature",
    items: [
      "ඔබගේ දුරකථනයේ සිංහල කථන හඬක් නැත්නම් දැන් දැනුම්දීමක් පෙන්වයි",
      "පාඩම අසතුටුදායක නම් 'නැවත සකස් කරන්න' බොත්තමෙන් එම අදහසින්ම ආයෙත් උත්සාහ කළ හැක",
      "පාඩම සකස් වෙමින් සිටින විට පෙන්වන පණිවිඩ වඩාත් රසවත් කළා",
      "පාඩම් සඳහා සෘජු සබැඳියක් බෙදාගත හැකි පහසුකම එකතු කළා",
    ],
  },
  {
    version: "v1.7",
    date: "2026 ජූනි",
    kind: "feature",
    items: [
      "'පැරණි පාඩම්' කොටස එකතු කළා — කලින් සකස් කළ පාඩම් නැවත බැලිය හැක",
      "යෙදුම අනිසි ලෙස භාවිතා වීම වළක්වා ගැනීම සඳහා ආරක්ෂණයක් එකතු කළා",
    ],
  },
  {
    version: "v1.6",
    date: "2026 ජූනි",
    kind: "fix",
    items: [
      "පැහැදිලි නොවූ පණිවිඩ දෙකක් එකවර පෙන්වූ දෝෂයක් නිවැරදි කළා",
      "පාඩම ඉතිහාසයට සුරැකීමේදී දෝෂයක් වුවහොත්, එය සාර්ථකව සකස් වූ පාඩම මත නොපෙන්වන සේ සකස් කළා",
      "PDF බාගත කිරීමේදී දෝෂයක් වුවහොත් දැනුම් දීමක් එකතු කළා",
    ],
  },
  {
    version: "v1.1",
    date: "2026 ජූනි",
    kind: "feature",
    items: [
      "මෙම යෙදුම දුරකථනයේ ආරම්භක තිරයට දාගත හැකි පහසුකම එකතු කළා",
      "අන්තර්ජාලය නැතුව සිටි ඉල්ලීම්, අන්තර්ජාලය ලැබුණු විගස ස්වයංක්‍රීයව සකස් වන පහසුකම එකතු කළා",
    ],
  },
  {
    version: "v1.0",
    date: "2026 ජූනි",
    kind: "major",
    items: [
      "🎉 මුල් සංස්කරණය — කථා කිරීමෙන් හෝ ලිවීමෙන් පාඩම් සකස් කිරීම",
      "රූප සහිත, ඇඟිල්ලෙන් ඇද දමා පෙරළිය හැකි ඉදිරිපත් කිරීමේ ආකාරය",
      "WhatsApp බෙදාගැනීම සහ මුද්‍රණය/PDF පහසුකම්",
    ],
  },
];

const kindStyles: Record<EntryKind, { Icon: typeof Rocket; label: string; color: string }> = {
  major: { Icon: Rocket, label: "මුල් සංස්කරණය", color: "bg-emerald-600" },
  feature: { Icon: Sparkles, label: "අලුත් පහසුකම", color: "bg-amber-600" },
  fix: { Icon: Bug, label: "දෝෂ නිරාකරණ", color: "bg-stone-500" },
};

export default function ChangelogPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-base font-semibold text-amber-700 hover:text-amber-900"
        >
          <ArrowLeft className="h-5 w-5" /> ආපසු
        </Link>

        <header className="space-y-1">
          <h1 className="text-3xl font-bold text-amber-900">අලුත් දේවල්</h1>
          <p className="text-base text-amber-700">දහම් පාසල් සහායක යාවත්කාලීන කිරීම් ලැයිස්තුව</p>
        </header>

        <div className="space-y-4">
          {entries.map((entry) => {
            const { Icon, label, color } = kindStyles[entry.kind];
            return (
              <div
                key={entry.version}
                className="rounded-2xl border-2 border-amber-200 bg-white/80 p-5 shadow-md"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${color}`}
                    aria-hidden="true"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-lg font-bold text-amber-900">
                      {entry.version}{" "}
                      <span className="text-sm font-medium text-amber-500">— {label}</span>
                    </p>
                    <p className="text-sm text-amber-600">{entry.date}</p>
                  </div>
                </div>
                <ul className="space-y-1.5 pl-1">
                  {entry.items.map((item, i) => (
                    <li key={i} className="flex gap-2 text-base text-stone-700">
                      <span className="text-amber-500" aria-hidden="true">
                        •
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
