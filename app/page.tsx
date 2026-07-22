/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

/**
 * app/page.tsx — v2.0 Maximum level dashboard
 *
 * New features vs v1.x:
 *   - Suggested topic chips (8 quick-start ideas, scrollable)
 *   - Recent topics (localStorage, last 5) shown below textarea
 *   - Auto-save draft (localStorage — survives page refresh)
 *   - Clear input button (×)
 *   - Font size toggle (Normal / Large / X-Large) — persisted
 *   - Celebration burst animation on successful lesson generation
 *   - Toast notifications
 *   - Sections: story / quiz / activities / image (4 toggles, 2×2 grid)
 *   - Adult age group
 *   - Per-section loading messages
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  ALargeSmall,
  BookHeart,
  Loader2,
  Mic,
  Sparkles,
  Square,
  WifiOff,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/Toast";

import {
  type AgeGroup,
  type LessonData,
  type LessonSections,
  getPendingLessons,
  isFirebaseConfigured,
  queuePendingLesson,
  removePendingLesson,
  saveLessonToHistory,
} from "@/lib/firebase";

import {
  clearDraft,
  loadDraft,
  loadFontSize,
  loadRecentTopics,
  saveDraft,
  saveFontSize,
  saveRecentTopic,
  type FontSize,
} from "@/lib/storage";

import LessonPresentation from "@/components/LessonPresentation";

// ---------------------------------------------------------------------------
// Web Speech API types
// ---------------------------------------------------------------------------

interface SpeechRecognitionInstance {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void;
  onstart: (() => void) | null; onend: (() => void) | null;
  onerror: ((e: any) => void) | null; onresult: ((e: any) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SILENCE_TIMEOUT_MS = 3000;

const SUGGESTED_TOPICS = [
  "යෝසප් සහ ඔහුගේ සහෝදරවරුන්",
  "දාවිත් සහ ගොලියත්",
  "යේසුස් වහන්සේ ජලය මත ඇවිදීම",
  "කොළ ළඳ කන්නය — ප්‍රීතිය",
  "ශු. ලූක් 15 — නැතිවූ පුතා",
  "ස්තේෆාන් — විශ්වාසයෙන් සිටීම",
  "ශ්‍රේෂ්ඨ ආඥාව — ආදරය",
  "නෝවා සහ මහා ජලගැලීම",
];

const FONT_CLASSES: Record<FontSize, string> = {
  normal: "text-base",
  large:  "text-lg",
  xlarge: "text-xl",
};

const FONT_LABELS: Record<FontSize, string> = {
  normal: "A",
  large:  "A+",
  xlarge: "A++",
};

// ---------------------------------------------------------------------------
// Confetti burst (celebration animation)
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = ["#b45309", "#d97706", "#f59e0b", "#34d399", "#60a5fa", "#f472b6"];

function ConfettiBurst({ trigger }: { trigger: boolean }) {
  if (!trigger) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {Array.from({ length: 30 }).map((_, i) => {
        const x = Math.random() * 100;
        const delay = Math.random() * 0.5;
        const duration = 1.2 + Math.random() * 1;
        const size = 6 + Math.random() * 10;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        return (
          <motion.div
            key={i}
            style={{
              left: `${x}%`,
              top: "-2%",
              width: size,
              height: size,
              backgroundColor: color,
              borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            }}
            initial={{ y: 0, opacity: 1, rotate: 0 }}
            animate={{ y: "110vh", opacity: [1, 1, 0], rotate: Math.random() * 720 - 360 }}
            transition={{ delay, duration, ease: "easeIn" }}
            className="absolute"
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Home() {
  // --- State ---
  const [inputText, setInputText]         = useState("");
  const [isRecording, setIsRecording]     = useState(false);
  const [voiceLang, setVoiceLang]         = useState<"si-LK" | "en-US">("si-LK");
  const [ageGroup, setAgeGroup]           = useState<AgeGroup>("8-10");
  const [sections, setSections]           = useState<LessonSections>({
    story: true, quiz: true, image: true, activities: true,
  });
  const [fontSize, setFontSize]           = useState<FontSize>("normal");
  const [isOnline, setIsOnline]           = useState(true);
  const [isLoading, setIsLoading]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [lesson, setLesson]               = useState<(LessonData & { id?: string }) | null>(null);
  const [showPresentation, setShowPresentation] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState(false);
  const [syncingNotice, setSyncingNotice] = useState(false);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [celebrate, setCelebrate]         = useState(false);
  const [recentTopics, setRecentTopics]   = useState<string[]>([]);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { showToast, ToastContainer } = useToast();

  // --- Load persisted state on mount ---
  useEffect(() => {
    setInputText(loadDraft());
    setFontSize(loadFontSize());
    setRecentTopics(loadRecentTopics());
  }, []);

  // --- Auto-save draft on input change ---
  useEffect(() => {
    saveDraft(inputText);
  }, [inputText]);

  const vibrate = useCallback((ms = 40) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  }, []);

  // --- Font size toggle ---
  const cycleFont = () => {
    const order: FontSize[] = ["normal", "large", "xlarge"];
    const next = order[(order.indexOf(fontSize) + 1) % order.length];
    setFontSize(next);
    saveFontSize(next);
    showToast(`අකුරු ප්‍රමාණය: ${FONT_LABELS[next]}`, "info");
  };

  // --- Loading messages ---
  const loadingMessages = useMemo(() => {
    const msgs = ["ඔබේ අදහස විශ්ලේෂණය කරමින්..."];
    if (sections.story)      msgs.push("කතාව ලියමින්...");
    if (sections.quiz)       msgs.push("ප්‍රශ්න සකස් කරමින්...");
    if (sections.activities) msgs.push("ක්‍රියාකාරකම් සකස් කරමින්...");
    if (sections.image)      msgs.push("චිත්‍රය සකස් කරමින්...");
    msgs.push("මඳක් රැඳී සිටින්න...");
    return msgs;
  }, [sections]);

  useEffect(() => {
    if (!isLoading) { setLoadingMsgIdx(0); return; }
    const id = setInterval(() => setLoadingMsgIdx((i) => (i + 1) % loadingMessages.length), 2500);
    return () => clearInterval(id);
  }, [isLoading, loadingMessages.length]);

  // --- Core API call ---
  const callGenerateLesson = useCallback(async (
    text: string, ag: AgeGroup, secs: LessonSections
  ): Promise<LessonData> => {
    const res = await fetch("/api/generate-lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: text, ageGroup: ag, sections: secs }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "පාඩම සකස් කිරීමේදී දෝෂයක් ඇති විය.");
    return data as LessonData;
  }, []);

  // --- Drain offline queue ---
  const processPendingLessons = useCallback(async () => {
    try {
      const pending = await getPendingLessons();
      if (pending.length === 0) return;
      setSyncingNotice(true);
      for (const req of pending) {
        try {
          const result = await callGenerateLesson(req.inputText, req.ageGroup, req.sections);
          await saveLessonToHistory(req.inputText, result);
          await removePendingLesson(req.id);
          setLesson(result);
          setOfflineNotice(false);
        } catch (e) {
          console.error("Failed to process queued lesson:", e);
        }
      }
    } catch (e) {
      console.error("Failed to read pending queue:", e);
    } finally {
      setSyncingNotice(false);
    }
  }, [callGenerateLesson]);

  // --- Connectivity ---
  useEffect(() => {
    setIsOnline(navigator.onLine);
    processPendingLessons();
    const goOnline = () => { setIsOnline(true); processPendingLessons(); };
    const goOffline = () => {
      setIsOnline(false);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          const r = reg as ServiceWorkerRegistration & { sync?: { register: (t: string) => Promise<void> } };
          r.sync?.register("sync-pending-lessons").catch(() => {});
        }).catch(() => {});
      }
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "SYNC_PENDING_LESSONS") processPendingLessons();
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [processPendingLessons]);

  // --- Voice ---
  const clearSilenceTimer = () => {
    if (silenceTimer.current) { clearTimeout(silenceTimer.current); silenceTimer.current = null; }
  };

  const startRecording = useCallback(() => {
    const Ctor = typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;
    if (!Ctor) { setError("ඔබගේ අතිරික්සුව හඬ හඳුනාගැනීමට සහාය නොදක්වයි. Chrome browser use කරන්න."); return; }
    vibrate(50);
    const rec = new Ctor();
    rec.lang = voiceLang; rec.continuous = true; rec.interimResults = true;
    rec.onstart = () => {
      setIsRecording(true); setError(null);
      clearSilenceTimer();
      silenceTimer.current = setTimeout(() => rec.stop(), SILENCE_TIMEOUT_MS);
    };
    rec.onresult = (e: any) => {
      clearSilenceTimer();
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setInputText(t);
      silenceTimer.current = setTimeout(() => rec.stop(), SILENCE_TIMEOUT_MS);
    };
    rec.onerror = () => { setIsRecording(false); clearSilenceTimer(); };
    rec.onend = () => { setIsRecording(false); clearSilenceTimer(); };
    recognitionRef.current = rec;
    rec.start();
  }, [voiceLang, vibrate]);

  const stopRecording = useCallback(() => {
    vibrate(30); recognitionRef.current?.stop(); clearSilenceTimer(); setIsRecording(false);
  }, [vibrate]);

  // --- Offline queue helper ---
  const queueOrWarn = useCallback(async (text: string, ag: AgeGroup, secs: LessonSections) => {
    try {
      await queuePendingLesson(text, ag, secs);
      setOfflineNotice(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "FIREBASE_NOT_CONFIGURED") {
        setError("දැනට අන්තර්ජාලය නොමැත. ඉල්ලීම් offline-ව සුරැකීමේ පහසුකම සක්‍රිය නෑ. අන්තර්ජාලය ලැබූ විට නැවත උත්සාහ කරන්න.");
      } else if (msg.includes("network")) {
        setError("ඉල්ලීම් offline-ව සුරැකීමේ සඳහා, app එක මුලින් online-ව විවෘත කළ යුතුයි.");
      } else {
        setError("ඉල්ලීම සුරැකීමේදී දෝෂයක් ඇති විය.");
      }
    }
  }, []);

  // --- Submit ---
  const handleGenerate = useCallback(async () => {
    const text = inputText.trim();
    if (!text) { setError("කරුණාකර අදහස ලියන්න හෝ කියන්න."); return; }
    if (!sections.story && !sections.quiz && !sections.image && !sections.activities) {
      setError("කරුණාකර අවම වශයෙන් එක් කොටසක් හෝ තෝරන්න.");
      return;
    }
    vibrate(60);
    setError(null); setOfflineNotice(false); setLesson(null); setCelebrate(false);
    saveRecentTopic(text);
    setRecentTopics(loadRecentTopics());

    if (!navigator.onLine) { await queueOrWarn(text, ageGroup, sections); return; }

    setIsLoading(true);
    try {
      const result = await callGenerateLesson(text, ageGroup, sections);
      setLesson(result);
      // Celebration burst
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 2500);
      // Clear draft after success
      clearDraft();
      setInputText("");
      try {
        const saved = await saveLessonToHistory(text, result);
        if (isFirebaseConfigured) setLesson((prev) => prev ? { ...prev, id: saved.id } : prev);
      } catch (he) { console.error("History save failed:", he); }
    } catch (e) {
      if (!navigator.onLine) {
        await queueOrWarn(text, ageGroup, sections);
      } else {
        setError(e instanceof Error ? e.message : "පාඩම සකස් කිරීමේදී දෝෂයක් ඇති විය.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [inputText, ageGroup, sections, callGenerateLesson, vibrate, queueOrWarn]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const fontClass = FONT_CLASSES[fontSize];

  return (
    <main className={`min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100 px-4 py-8 sm:py-12 ${fontClass}`}>
      <ConfettiBurst trigger={celebrate} />
      <ToastContainer />

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <header className="space-y-2 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-lg shadow-amber-300/50">
            <BookHeart className="h-9 w-9" />
          </div>
          <div className="flex items-center justify-center gap-3">
            <h1 className="text-3xl font-bold text-amber-900 sm:text-4xl">දහම් පාසල් සහායක</h1>
            {/* Font size toggle */}
            <button
              type="button"
              onClick={cycleFont}
              title="අකුරු ප්‍රමාණය"
              className="flex items-center gap-1 rounded-xl border-2 border-amber-300 bg-white px-2.5 py-1 text-sm font-bold text-amber-700 hover:bg-amber-50"
            >
              <ALargeSmall className="h-4 w-4" />
              {FONT_LABELS[fontSize]}
            </button>
          </div>
          <p className="text-lg text-amber-700">ඔබේ අදහස කියන්න, සහායකය පාඩම සකස් කර දෙයි</p>
        </header>

        {/* Offline / syncing banners */}
        {!isOnline && (
          <Alert className="border-2 border-amber-400 bg-amber-100 text-amber-900">
            <WifiOff className="h-6 w-6" />
            <AlertTitle className="text-lg font-bold">අන්තර්ජාලය නොමැත</AlertTitle>
            <AlertDescription>ඔබගේ උපාංගය දැනට අන්තර්ජාලයට සම්බන්ධ නැත.</AlertDescription>
          </Alert>
        )}
        {offlineNotice && (
          <Alert className="border-2 border-amber-400 bg-amber-100 text-amber-900">
            <WifiOff className="h-6 w-6" />
            <AlertTitle className="text-lg font-bold">ඉල්ලීම සුරැකිණි</AlertTitle>
            <AlertDescription>දැනට අන්තර්ජාලය නොමැත. ඔබගේ ඉල්ලීම සුරක්ෂිතයි, අන්තර්ජාලය ලැබුණු විගස පාඩම සකස් වේවි.</AlertDescription>
          </Alert>
        )}
        {syncingNotice && (
          <Alert className="border-2 border-emerald-400 bg-emerald-50 text-emerald-900">
            <Sparkles className="h-6 w-6" />
            <AlertTitle className="text-lg font-bold">පාඩම සකස් වෙමින්...</AlertTitle>
            <AlertDescription>සුරැකි ඉල්ලීම දැන් සකස් කරමින් පවතී.</AlertDescription>
          </Alert>
        )}

        {/* Suggested topics */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber-600">💡 ඉක්මන් අදහස් — ස්පර්ශ කරන්න:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_TOPICS.map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => { setInputText(topic); setError(null); }}
                className="rounded-full border-2 border-amber-200 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 transition hover:border-amber-500 hover:bg-amber-50 active:scale-95"
              >
                {topic}
              </button>
            ))}
          </div>
        </div>

        {/* Main input card */}
        <Card className="border-2 border-amber-200 bg-white/80 shadow-xl backdrop-blur">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-amber-900">පාඩම සඳහා අදහස කියන්න</CardTitle>
            <CardDescription className="text-base text-amber-700">
              උදා: &ldquo;යෝසප් සහ ඔහුගේ සහෝදරවරුන් ගැන පාඩමක්&rdquo;
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col items-center gap-5">
            {/* Age group selector */}
            <div className="w-full space-y-2">
              <p className="text-center text-sm font-semibold text-amber-700">කාණ්ඩය</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([ { value: "5-7", label: "අවු. 5-7" }, { value: "8-10", label: "අවු. 8-10" },
                   { value: "11-12", label: "අවු. 11-12" }, { value: "adult", label: "වැඩිහිටි" },
                ] as { value: AgeGroup; label: string }[]).map(({ value, label }) => (
                  <button key={value} type="button" onClick={() => setAgeGroup(value)}
                    className={`rounded-xl border-2 py-2.5 text-base font-bold transition ${
                      ageGroup === value ? "border-amber-600 bg-amber-600 text-white shadow-md" : "border-amber-200 bg-white text-amber-700 hover:border-amber-400"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Section selector */}
            <div className="w-full space-y-2">
              <p className="text-center text-sm font-semibold text-amber-700">සකස් කිරීමට ඕනේ කොටස්</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  { key: "story" as const,      label: "📖 කතාව" },
                  { key: "quiz" as const,       label: "❓ ප්‍රශ්න" },
                  { key: "activities" as const, label: "✨ ක්‍රියා" },
                  { key: "image" as const,      label: "🎨 රූපය" },
                ]).map(({ key, label }) => (
                  <button key={key} type="button"
                    onClick={() => setSections((p) => ({ ...p, [key]: !p[key] }))}
                    className={`rounded-xl border-2 py-2.5 text-sm font-bold transition ${
                      sections[key] ? "border-amber-600 bg-amber-600 text-white shadow-md" : "border-amber-200 bg-white text-amber-500 hover:border-amber-400"
                    }`}>
                    {sections[key] ? "✓ " : ""}{label}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice language toggle */}
            <div className="flex gap-2 rounded-full bg-amber-100 p-1">
              {(["si-LK", "en-US"] as const).map((lang) => (
                <button key={lang} type="button" onClick={() => setVoiceLang(lang)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    voiceLang === lang ? "bg-amber-600 text-white shadow" : "text-amber-700"
                  }`}>
                  {lang === "si-LK" ? "සිංහල" : "ඉංග්‍රීසි"}
                </button>
              ))}
            </div>

            {/* Mic button */}
            <button type="button"
              onClick={isRecording ? stopRecording : startRecording}
              aria-label={isRecording ? "පටිගත කිරීම නවත්වන්න" : "කථා කිරීම ආරම්භ කරන්න"}
              className="relative flex h-32 w-32 items-center justify-center rounded-full bg-amber-600 text-white shadow-2xl shadow-amber-400/60 transition active:scale-95 sm:h-36 sm:w-36">
              {isRecording && (
                <motion.span className="absolute inset-0 rounded-full bg-amber-400"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                  aria-hidden="true" />
              )}
              {isRecording ? <Square className="h-12 w-12" /> : <Mic className="h-14 w-14" />}
            </button>

            <p className="text-lg font-medium text-amber-800">
              {isRecording ? "ඔබේ කථාව අසමින්... (නවත්වන්න ඔබන්න)" : "මයික්‍රෆෝනය ඔබා කථා කරන්න"}
            </p>

            <div className="flex w-full items-center gap-3">
              <span className="h-px flex-1 bg-amber-200" />
              <span className="text-sm font-semibold text-amber-500">හෝ</span>
              <span className="h-px flex-1 bg-amber-200" />
            </div>

            {/* Textarea with clear button + character counter */}
            <div className="w-full space-y-1">
              <div className="relative">
                <Textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="මෙහි ලියන්න..."
                  maxLength={2000}
                  className="min-h-28 w-full border-2 border-amber-200 pr-10 text-lg focus-visible:ring-amber-500"
                />
                {inputText && (
                  <button type="button" onClick={() => { setInputText(""); clearDraft(); }}
                    aria-label="ඉවත් කරන්න"
                    className="absolute right-3 top-3 rounded-full bg-amber-100 p-1 text-amber-600 hover:bg-amber-200">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className={`text-right text-xs ${inputText.length > 1800 ? "text-red-500" : "text-amber-400"}`}>
                {inputText.length} / 2000
              </p>
            </div>

            {/* Recent topics */}
            {recentTopics.length > 0 && (
              <div className="w-full space-y-1.5">
                <p className="text-xs font-semibold text-amber-500">🕐 මෑත අදහස්:</p>
                <div className="flex flex-wrap gap-1.5">
                  {recentTopics.map((t) => (
                    <button key={t} type="button"
                      onClick={() => { setInputText(t); setError(null); }}
                      className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700 hover:bg-amber-100">
                      {t.length > 40 ? t.slice(0, 40) + "…" : t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="w-full rounded-lg bg-red-50 px-4 py-3 text-base font-medium text-red-700">
                {error}
              </p>
            )}

            <Button onClick={handleGenerate} disabled={isLoading || !inputText.trim()}
              className="h-14 w-full rounded-2xl bg-amber-700 text-xl font-bold text-white shadow-lg shadow-amber-300/60 hover:bg-amber-800 disabled:opacity-50">
              {isLoading ? (
                <><Loader2 className="mr-2 h-6 w-6 animate-spin" /> පාඩම සැකසෙමින්...</>
              ) : (
                <><Sparkles className="mr-2 h-6 w-6" /> පාඩම සකස් කරන්න</>
              )}
            </Button>

            {isLoading && (
              <p className="text-center text-sm text-amber-600" aria-live="polite">
                {loadingMessages[loadingMsgIdx]}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Result card */}
        <AnimatePresence>
          {lesson && !isLoading && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <Card className="border-2 border-emerald-300 bg-emerald-50/80 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-2xl text-emerald-900">{lesson.title}</CardTitle>
                  <CardDescription className="text-base text-emerald-800">{lesson.bible_verse}</CardDescription>
                  {lesson.memory_verse && (
                    <p className="mt-1 text-sm font-medium text-emerald-700">⭐ {lesson.memory_verse}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button onClick={() => { vibrate(50); setShowPresentation(true); }}
                    className="h-14 w-full rounded-2xl bg-emerald-700 text-xl font-bold text-white hover:bg-emerald-800">
                    ඉදිරිපත් කිරීම අරඹන්න
                  </Button>
                  <Button onClick={handleGenerate} variant="outline"
                    className="h-12 w-full rounded-2xl border-2 border-emerald-300 text-base font-semibold text-emerald-800 hover:bg-emerald-50">
                    නැවත සකස් කරන්න
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showPresentation && lesson && (
        <LessonPresentation lesson={lesson} onClose={() => setShowPresentation(false)} />
      )}

      <footer className="space-y-2 pt-8 text-center">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link href="/guide" className="text-sm font-medium text-amber-500 underline-offset-4 hover:text-amber-700 hover:underline">
            භාවිත මඟ පෙන්වීම
          </Link>
          <span className="text-amber-300" aria-hidden="true">•</span>
          <Link href="/history" className="text-sm font-medium text-amber-500 underline-offset-4 hover:text-amber-700 hover:underline">
            පැරණි පාඩම්
          </Link>
          <span className="text-amber-300" aria-hidden="true">•</span>
          <Link href="/changelog" className="text-sm font-medium text-amber-500 underline-offset-4 hover:text-amber-700 hover:underline">
            අලුත් දේවල් (v2.1)
          </Link>
        </div>
        <p className="text-xs text-amber-400">නිර්මාණය හා සංවර්ධනය — Prabhath Lokuge</p>
        <p className="text-xs text-amber-400">© 2026 සියලුම හිමිකම් ඇවිරිණි</p>
      </footer>
    </main>
  );
}
