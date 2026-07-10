/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

/**
 * app/page.tsx
 *
 * Main dashboard for "Sunday School Assistant" (දහම් පාසල් සහායක).
 *
 * Flow:
 *   1. Teacher speaks (Web Speech API, si-LK / en-US) or types their idea.
 *   2. On submit: if online, calls /api/generate-lesson directly.
 *      If offline, queues the request in Firestore (instant, works with
 *      zero connectivity) and shows an elegant offline notice.
 *   3. A window "online" listener automatically drains the offline queue
 *      and produces the lesson the moment connectivity returns.
 *   4. Once a lesson exists, the teacher can open the full-screen
 *      LessonPresentation to present it to the class.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { BookHeart, Loader2, Mic, Sparkles, Square, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

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
import LessonPresentation from "@/components/LessonPresentation";

// ---------------------------------------------------------------------------
// Minimal Web Speech API typing (not included in default TS DOM lib types)
// ---------------------------------------------------------------------------

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: any) => void) | null;
  onresult: ((event: any) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

const SILENCE_TIMEOUT_MS = 3000;

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [voiceLang, setVoiceLang] = useState<"si-LK" | "en-US">("si-LK");
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("8-10");
  const [sections, setSections] = useState<LessonSections>({ story: true, quiz: true, image: true });
  const [isOnline, setIsOnline] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lesson, setLesson] = useState<(LessonData & { id?: string }) | null>(null);
  const [showPresentation, setShowPresentation] = useState(false);
  const [offlineNotice, setOfflineNotice] = useState(false);
  const [syncingNotice, setSyncingNotice] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vibrate = useCallback((duration = 40) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(duration);
    }
  }, []);

  // ---- Rotating status text while waiting on Gemini + the image model ----
  // Messages are filtered to only mention sections the teacher actually selected.
  const loadingMessages = useMemo(() => {
    const msgs = ["ඔබේ අදහස විශ්ලේෂණය කරමින්..."];
    if (sections.story) msgs.push("කතාව ලියමින්...");
    if (sections.quiz)  msgs.push("ප්‍රශ්න සකස් කරමින්...");
    if (sections.image) msgs.push("චිත්‍රය සකස් කරමින්...");
    msgs.push("මඳක් රැඳී සිටින්න...");
    return msgs;
  }, [sections]);

  useEffect(() => {
    if (!isLoading) {
      setLoadingMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingMessageIndex((i) => (i + 1) % loadingMessages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isLoading, loadingMessages.length]);

  // ---- Core generation call ----------------------------------------------
  const callGenerateLesson = useCallback(async (
    text: string,
    selectedAgeGroup: AgeGroup,
    selectedSections: LessonSections
  ): Promise<LessonData> => {
    const res = await fetch("/api/generate-lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: text, ageGroup: selectedAgeGroup, sections: selectedSections }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || "පාඩම සකස් කිරීමේදී දෝෂයක් ඇති විය.");
    }
    return data as LessonData;
  }, []);

  // ---- Drain anything queued while offline -------------------------------
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
      console.error("Failed to read the pending-lesson queue:", e);
    } finally {
      setSyncingNotice(false);
    }
  }, [callGenerateLesson]);

  // ---- Connectivity tracking ----------------------------------------------
  useEffect(() => {
    setIsOnline(navigator.onLine);
    processPendingLessons();

    const goOnline = () => {
      setIsOnline(true);
      processPendingLessons();
    };

    const goOffline = () => {
      setIsOnline(false);
      // Ask the service worker (public/sw.js) to wake this app up via the
      // real Background Sync API the moment the OS reports connectivity is
      // back — even if this tab is in the background. Not all browsers
      // support SyncManager (notably iOS Safari), so this degrades
      // gracefully to the plain "online" listener above.
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then((registration) => {
            const reg = registration as ServiceWorkerRegistration & {
              sync?: { register: (tag: string) => Promise<void> };
            };
            reg.sync?.register("sync-pending-lessons").catch(() => {
              // Background Sync unsupported/denied — the "online" listener still covers us.
            });
          })
          .catch(() => {});
      }
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Wake-up message from the service worker's "sync" event ------------
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "SYNC_PENDING_LESSONS") {
        processPendingLessons();
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [processPendingLessons]);

  // ---- Voice input ---------------------------------------------------------
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const startRecording = useCallback(() => {
    const SpeechRecognitionCtor =
      typeof window !== "undefined"
        ? window.SpeechRecognition || window.webkitSpeechRecognition
        : undefined;

    if (!SpeechRecognitionCtor) {
      setError("ඔබගේ අතිරික්සුව හඬ හඳුනාගැනීමට සහාය නොදක්වයි. කරුණාකර පහත කොටුවේ ලියන්න.");
      return;
    }

    vibrate(50);
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = voiceLang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsRecording(true);
      setError(null);
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(() => recognition.stop(), SILENCE_TIMEOUT_MS);
    };

    recognition.onresult = (event: any) => {
      clearSilenceTimer();
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInputText(transcript);
      silenceTimerRef.current = setTimeout(() => recognition.stop(), SILENCE_TIMEOUT_MS);
    };

    recognition.onerror = () => {
      setIsRecording(false);
      clearSilenceTimer();
    };

    recognition.onend = () => {
      setIsRecording(false);
      clearSilenceTimer();
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [voiceLang, vibrate]);

  const stopRecording = useCallback(() => {
    vibrate(30);
    recognitionRef.current?.stop();
    clearSilenceTimer();
    setIsRecording(false);
  }, [vibrate]);

  // ---- Queue offline, or explain honestly why that's not possible -----------
  const queueOrWarn = useCallback(async (
    text: string,
    selectedAgeGroup: AgeGroup,
    selectedSections: LessonSections
  ) => {
    try {
      await queuePendingLesson(text, selectedAgeGroup, selectedSections);
      setOfflineNotice(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (message === "FIREBASE_NOT_CONFIGURED") {
        setError(
          "දැනට අන්තර්ජාලය නොමැත. අන්තර්ජාලය නැති විට ඉල්ලීම් සුරැකීමේ පහසුකම මෙහි සක්‍රිය කර නැත. අන්තර්ජාලය ලැබුණු පසු කරුණාකර නැවත උත්සාහ කරන්න."
        );
      } else if (message.includes("network")) {
        setError(
          "මෙම උපාංගයේ පාඩම් සුරැකීමේ පහසුකම තවම සක්‍රිය වී නැත. කරුණාකර එක් වරක් අන්තර්ජාලය ඇති විට app එක විවෘත කර, පසුව නැවත උත්සාහ කරන්න."
        );
      } else {
        setError("ඉල්ලීම සුරැකීමේදී දෝෂයක් ඇති විය.");
      }
    }
  }, []);

  // ---- Submit ----------------------------------------------------------------
  const handleGenerate = useCallback(async () => {
    const text = inputText.trim();
    if (!text) {
      setError("කරුණාකර පාඩම සඳහා කෙටි විස්තරයක් කථා කරන්න හෝ ලියන්න.");
      return;
    }
    if (!sections.story && !sections.quiz && !sections.image) {
      setError("කරුණාකර අවම වශයෙන් එක් කොටසක් හෝ තෝරන්න.");
      return;
    }

    vibrate(60);
    setError(null);
    setOfflineNotice(false);
    setLesson(null);

    if (!navigator.onLine) {
      await queueOrWarn(text, ageGroup, sections);
      return;
    }

    setIsLoading(true);
    try {
      const result = await callGenerateLesson(text, ageGroup, sections);
      setLesson(result);
      try {
        const saved = await saveLessonToHistory(text, result);
        if (isFirebaseConfigured) {
          setLesson((prev) => (prev ? { ...prev, id: saved.id } : prev));
        }
      } catch (historyError) {
        console.error("Failed to save lesson to history:", historyError);
      }
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

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <header className="space-y-2 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-600 text-white shadow-lg shadow-amber-300/50">
            <BookHeart className="h-9 w-9" />
          </div>
          <h1 className="text-3xl font-bold text-amber-900 sm:text-4xl">දහම් පාසල් සහායක</h1>
          <p className="text-lg text-amber-700">ඔබේ අදහස කියන්න, සහායකය පාඩම සකස් කර දෙයි</p>
        </header>

        {/* Offline banner (general connectivity status, always visible while offline) */}
        {!isOnline && (
          <Alert className="border-2 border-amber-400 bg-amber-100 text-amber-900">
            <WifiOff className="h-6 w-6" />
            <AlertTitle className="text-lg font-bold">අන්තර්ජාලය නොමැත</AlertTitle>
            <AlertDescription className="text-base">
              ඔබගේ උපාංගය දැනට අන්තර්ජාලයට සම්බන්ධ නැත.
            </AlertDescription>
          </Alert>
        )}

        {/* Confirmation that a specific request was just queued */}
        {offlineNotice && (
          <Alert className="border-2 border-amber-400 bg-amber-100 text-amber-900">
            <WifiOff className="h-6 w-6" />
            <AlertTitle className="text-lg font-bold">ඉල්ලීම සුරැකිණි</AlertTitle>
            <AlertDescription className="text-base">
              දැනට අන්තර්ජාලය නොමැත. ඔබගේ ඉල්ලීම සුරක්ෂිතයි, අන්තර්ජාලය ලැබුණු විගස පාඩම සකස් වේවි.
            </AlertDescription>
          </Alert>
        )}

        {syncingNotice && (
          <Alert className="border-2 border-emerald-400 bg-emerald-50 text-emerald-900">
            <Sparkles className="h-6 w-6" />
            <AlertTitle className="text-lg font-bold">පාඩම සකස් වෙමින්...</AlertTitle>
            <AlertDescription className="text-base">
              අන්තර්ජාලය ලැබුණි. ඔබගේ සුරැකි ඉල්ලීම දැන් සකස් කරමින් පවතී.
            </AlertDescription>
          </Alert>
        )}

        {/* Main input card */}
        <Card className="border-2 border-amber-200 bg-white/80 shadow-xl backdrop-blur">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-amber-900">පාඩම සඳහා අදහස කියන්න</CardTitle>
            <CardDescription className="text-base text-amber-700">
              උදා: &ldquo;යෝසප් සහ ඔහුගේ සහෝදරවරුන් ගැන පාඩමක්&rdquo;
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col items-center gap-6">
            {/* Age group selector */}
            <div className="w-full space-y-2">
              <p className="text-center text-sm font-semibold text-amber-700">
                කාණ්ඩය
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    { value: "5-7",   label: "අවු. 5-7" },
                    { value: "8-10",  label: "අවු. 8-10" },
                    { value: "11-12", label: "අවු. 11-12" },
                    { value: "adult", label: "වැඩිහිටි" },
                  ] as { value: AgeGroup; label: string }[]
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAgeGroup(value)}
                    className={`rounded-xl border-2 py-2.5 text-base font-bold transition ${
                      ageGroup === value
                        ? "border-amber-600 bg-amber-600 text-white shadow-md"
                        : "border-amber-200 bg-white text-amber-700 hover:border-amber-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Section selector */}
            <div className="w-full space-y-2">
              <p className="text-center text-sm font-semibold text-amber-700">
                සකස් කිරීමට ඕනේ කොටස්
              </p>
              <div className="flex gap-2">
                {(
                  [
                    { key: "story" as const, label: "කතාව" },
                    { key: "quiz"  as const, label: "ප්‍රශ්න" },
                    { key: "image" as const, label: "රූපය" },
                  ]
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSections((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className={`flex-1 rounded-xl border-2 py-2.5 text-base font-bold transition ${
                      sections[key]
                        ? "border-amber-600 bg-amber-600 text-white shadow-md"
                        : "border-amber-200 bg-white text-amber-500 hover:border-amber-400"
                    }`}
                  >
                    {sections[key] ? "✓ " : ""}{label}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice language toggle */}
            <div className="flex gap-2 rounded-full bg-amber-100 p-1">
              <button
                type="button"
                onClick={() => setVoiceLang("si-LK")}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  voiceLang === "si-LK" ? "bg-amber-600 text-white shadow" : "text-amber-700"
                }`}
              >
                සිංහල
              </button>
              <button
                type="button"
                onClick={() => setVoiceLang("en-US")}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  voiceLang === "en-US" ? "bg-amber-600 text-white shadow" : "text-amber-700"
                }`}
              >
                ඉංග්‍රීසි
              </button>
            </div>

            {/* Big pulsing microphone button */}
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              aria-label={isRecording ? "පටිගත කිරීම නවත්වන්න" : "කථා කිරීම ආරම්භ කරන්න"}
              className="relative flex h-32 w-32 items-center justify-center rounded-full bg-amber-600 text-white shadow-2xl shadow-amber-400/60 transition active:scale-95 sm:h-36 sm:w-36"
            >
              {isRecording && (
                <motion.span
                  className="absolute inset-0 rounded-full bg-amber-400"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                  aria-hidden="true"
                />
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

            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="මෙහි ලියන්න..."
              className="min-h-28 w-full border-2 border-amber-200 text-lg focus-visible:ring-amber-500"
            />

            {error && (
              <p
                role="alert"
                className="w-full rounded-lg bg-red-50 px-4 py-3 text-base font-medium text-red-700"
              >
                {error}
              </p>
            )}

            <Button
              onClick={handleGenerate}
              disabled={isLoading || !inputText.trim()}
              className="h-14 w-full rounded-2xl bg-amber-700 text-xl font-bold text-white shadow-lg shadow-amber-300/60 hover:bg-amber-800 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-6 w-6 animate-spin" /> පාඩම සැකසෙමින්...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-6 w-6" /> පාඩම සකස් කරන්න
                </>
              )}
            </Button>

            {isLoading && (
              <p className="text-center text-sm text-amber-600" aria-live="polite">
                {loadingMessages[loadingMessageIndex]}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Ready-to-present result card */}
        <AnimatePresence>
          {lesson && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="border-2 border-emerald-300 bg-emerald-50/80 shadow-xl">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-2xl text-emerald-900">{lesson.title}</CardTitle>
                    <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                      {lesson.age_group ? `අවු. ${lesson.age_group}` : ""}
                    </span>
                  </div>
                  <CardDescription className="text-base text-emerald-800">
                    {lesson.bible_verse}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    onClick={() => {
                      vibrate(50);
                      setShowPresentation(true);
                    }}
                    className="h-14 w-full rounded-2xl bg-emerald-700 text-xl font-bold text-white hover:bg-emerald-800"
                  >
                    ඉදිරිපත් කිරීම අරඹන්න
                  </Button>
                  <Button
                    onClick={handleGenerate}
                    variant="outline"
                    className="h-12 w-full rounded-2xl border-2 border-emerald-300 text-base font-semibold text-emerald-800 hover:bg-emerald-50"
                  >
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

      <footer className="space-y-2 pt-6 text-center">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/guide"
            className="text-sm font-medium text-amber-500 underline-offset-4 hover:text-amber-700 hover:underline"
          >
            භාවිත මඟ පෙන්වීම
          </Link>
          <span className="text-amber-300" aria-hidden="true">
            •
          </span>
          <Link
            href="/history"
            className="text-sm font-medium text-amber-500 underline-offset-4 hover:text-amber-700 hover:underline"
          >
            පැරණි පාඩම්
          </Link>
          <span className="text-amber-300" aria-hidden="true">
            •
          </span>
          <Link
            href="/changelog"
            className="text-sm font-medium text-amber-500 underline-offset-4 hover:text-amber-700 hover:underline"
          >
            අලුත් දේවල් (v1.12)          </Link>
        </div>
        <p className="text-xs text-amber-400">නිර්මාණය හා සංවර්ධනය — Prabhath Lokuge</p>
        <p className="text-xs text-amber-400">© 2026 සියලුම හිමිකම් ඇවිරිණි</p>
      </footer>
    </main>
  );
}
