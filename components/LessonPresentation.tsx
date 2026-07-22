"use client";

/**
 * components/LessonPresentation.tsx  v2.0
 *
 * New in this version:
 *   - Copy-to-clipboard button on every slide
 *   - Keyboard navigation (← / → arrow keys + Escape to close)
 *   - Fullscreen API toggle button
 *   - QuizTimer embedded inside the quiz slide
 *   - Emoji-icon progress dots with tap-to-jump
 *   - Read Aloud always in bottom nav (not buried inside each slide)
 *   - Adult age label fixed ("වැඩිහිටි" not "අවු. adult")
 *   - PrintableLesson conditionally renders each section
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  Expand,
  HelpCircle,
  Lightbulb,
  Printer,
  Share2,
  Shrink,
  Star,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import QuizTimer from "@/components/QuizTimer";
import type { LessonData } from "@/lib/firebase";

interface LessonPresentationProps {
  lesson: LessonData & { id?: string };
  onClose: () => void;
}

type Slide =
  | { type: "cover" }
  | { type: "memory" }
  | { type: "story"; text: string; index: number }
  | { type: "activities" }
  | { type: "quiz" };

const SWIPE_POWER = 8000;

const SLIDE_ICONS: Record<string, string> = {
  cover: "📖", memory: "⭐", story: "📝", activities: "✨", quiz: "❓",
};

export default function LessonPresentation({ lesson, onClose }: LessonPresentationProps) {
  const hasStory      = (lesson.sections?.story      !== false) && lesson.story_slides.length > 0;
  const hasQuiz       = (lesson.sections?.quiz       !== false) && lesson.quiz_questions.length > 0;
  const hasActivities = (lesson.sections?.activities !== false) && (lesson.activity_ideas?.length ?? 0) > 0;
  const hasMemory     = Boolean(lesson.memory_verse?.trim());

  const slides: Slide[] = useMemo(() => {
    const s: Slide[] = [{ type: "cover" }];
    if (hasMemory)     s.push({ type: "memory" });
    if (hasStory)      lesson.story_slides.forEach((text, index) => s.push({ type: "story", text, index }));
    if (hasActivities) s.push({ type: "activities" });
    if (hasQuiz)       s.push({ type: "quiz" });
    return s;
  }, [lesson, hasMemory, hasStory, hasActivities, hasQuiz]);

  const [current, setCurrent]           = useState(0);
  const [direction, setDirection]       = useState(0);
  const [isSpeaking, setIsSpeaking]     = useState(false);
  const [hasSinhalaVoice, setHasSinhalaVoice] = useState<boolean | null>(null);
  const [voiceNoticeDismissed, setVoiceNoticeDismissed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const printableRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ---- Sinhala voice detection ----
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const check = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) setHasSinhalaVoice(voices.some((v) => v.lang.toLowerCase().startsWith("si")));
    };
    check();
    window.speechSynthesis.onvoiceschanged = check;
    return () => { window.speechSynthesis.cancel(); };
  }, []);

  // ---- Keyboard navigation ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && current < slides.length - 1) paginate(1);
      if (e.key === "ArrowLeft"  && current > 0)                  paginate(-1);
      if (e.key === "Escape")                                       onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, slides.length]);

  // ---- Fullscreen change listener ----
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const paginate = useCallback((dir: number) => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setDirection(dir);
    setCurrent((p) => Math.min(Math.max(p + dir, 0), slides.length - 1));
  }, [slides.length]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const power = info.offset.x * info.velocity.x;
    if ((info.offset.x < -80 || power < -SWIPE_POWER) && current < slides.length - 1) paginate(1);
    else if ((info.offset.x > 80 || power > SWIPE_POWER) && current > 0) paginate(-1);
  };

  // ---- TTS ----
  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const si = voices.find((v) => v.lang.toLowerCase().startsWith("si"));
    u.lang = si?.lang ?? "si-LK";
    if (si) u.voice = si;
    u.rate = 0.92;
    u.onend = () => setIsSpeaking(false);
    u.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setIsSpeaking(true);
  }, [isSpeaking]);

  // ---- Copy to clipboard ----
  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("පිටපත් කළා! ✓");
      setTimeout(() => setCopyFeedback(null), 1800);
    } catch {
      setCopyFeedback("පිටපත් කිරීම අසාර්ථකයි");
      setTimeout(() => setCopyFeedback(null), 1800);
    }
  }, []);

  // ---- Share ----
  const handleShare = async () => {
    const summary = lesson.story_slides[0] ?? lesson.bible_verse;
    const link = lesson.id ? `\n\n${window.location.origin}/lesson/${lesson.id}` : "";
    const text = `📖 ${lesson.title}\n\n✨ ${lesson.bible_verse}\n\n${summary}${link}\n\n— දහම් පාසල් සහායක`;
    if (navigator.share) {
      try { await navigator.share({ title: lesson.title, text }); return; } catch {}
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  // ---- Print / PDF ----
  const handleDownloadPdf = async () => {
    if (!printableRef.current) return;
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: 10,
          filename: `${lesson.title.replace(/\s+/g, "_")}.pdf`,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(printableRef.current)
        .save();
    } catch {
      window.alert("PDF සකස් කිරීමේදී දෝෂයක් ඇති විය.");
    }
  };

  // ---- Slide text for TTS / copy ----
  const slide = slides[current];
  const getSlideText = (): string => {
    if (slide.type === "cover")      return `${lesson.title}. ${lesson.bible_verse}`;
    if (slide.type === "memory")     return lesson.memory_verse ?? "";
    if (slide.type === "story")      return slide.text;
    if (slide.type === "activities") return (lesson.activity_ideas ?? []).map((a, i) => `${i + 1}. ${a}`).join(". ");
    if (slide.type === "quiz")       return lesson.quiz_questions.map((q, i) => `${i + 1}. ${q}`).join(". ");
    return "";
  };

  const ageLabel = lesson.age_group === "adult" ? "වැඩිහිටි"
    : lesson.age_group ? `අවු. ${lesson.age_group}` : "";

  const variants = {
    enter:  (d: number) => ({ x: d > 0 ? 320 : -320, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit:   (d: number) => ({ x: d > 0 ? -320 : 320, opacity: 0 }),
  };

  return (
    <div ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-amber-100 via-orange-50 to-amber-200">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <Button variant="ghost" size="icon" onClick={onClose}
          className="h-12 w-12 rounded-full bg-white/70 text-amber-900 shadow hover:bg-white">
          <X className="h-6 w-6" />
        </Button>

        {/* Progress dots with emoji icons */}
        <div className="flex items-center gap-1.5" aria-label="ස්ලයිඩ් ගමන">
          {slides.map((s, i) => (
            <button key={i} type="button"
              onClick={() => { setDirection(i > current ? 1 : -1); setCurrent(i); }}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs transition ${
                i === current ? "bg-amber-700 text-white shadow" : "bg-amber-200 text-amber-600 hover:bg-amber-300"
              }`}>
              {SLIDE_ICONS[s.type] ?? "•"}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {/* Fullscreen toggle */}
          <Button variant="ghost" size="icon" onClick={toggleFullscreen}
            className="h-10 w-10 rounded-full bg-white/70 text-amber-900 shadow hover:bg-white">
            {isFullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
          </Button>
          {/* Share */}
          <Button variant="ghost" size="icon" onClick={handleShare}
            className="h-10 w-10 rounded-full bg-white/70 text-amber-900 shadow hover:bg-white">
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Copy feedback toast */}
      <AnimatePresence>
        {copyFeedback && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute left-1/2 top-20 z-10 -translate-x-1/2 rounded-2xl bg-stone-800 px-4 py-2 text-sm font-semibold text-white shadow-xl">
            {copyFeedback}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sinhala voice notice */}
      {hasSinhalaVoice === false && !voiceNoticeDismissed && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-800">
          <span className="flex-1">ඔබගේ දුරකථනයේ සිංහල කථන හඬක් නැත. "හඬින් කියවන්න" වෙනත් භාෂාවකින් කියවනු ඇත.</span>
          <button type="button" onClick={() => setVoiceNoticeDismissed(true)} className="text-amber-600">✕</button>
        </div>
      )}

      {/* Slide area */}
      <div className="relative flex-1 overflow-hidden px-4 pb-4">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div key={current} custom={direction} variants={variants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }}
            drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.7}
            onDragEnd={handleDragEnd}
            className="mx-auto flex h-full max-w-xl flex-col overflow-y-auto rounded-3xl bg-white/90 p-5 shadow-2xl">

            {slide.type === "cover"      && <CoverSlide lesson={lesson} ageLabel={ageLabel} onCopy={copyText} />}
            {slide.type === "memory"     && <MemorySlide verse={lesson.memory_verse ?? ""} onCopy={copyText} />}
            {slide.type === "story"      && (
              <StorySlide text={slide.text} index={slide.index} total={lesson.story_slides.length}
                imageUrl={lesson.image_url} onCopy={copyText} />
            )}
            {slide.type === "activities" && <ActivitiesSlide ideas={lesson.activity_ideas ?? []} onCopy={copyText} />}
            {slide.type === "quiz"       && <QuizSlide questions={lesson.quiz_questions} onCopy={copyText} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <div className="flex items-center gap-2 px-4 pb-6">
        <Button onClick={() => paginate(-1)} disabled={current === 0}
          className="h-14 flex-1 rounded-2xl bg-amber-200 text-lg font-bold text-amber-900 hover:bg-amber-300 disabled:opacity-40">
          <ChevronLeft className="mr-1 h-6 w-6" /> පෙරයට
        </Button>

        {/* Read Aloud */}
        <Button onClick={() => speak(getSlideText())} variant="outline"
          className="h-14 w-14 shrink-0 rounded-2xl border-2 border-amber-400 text-amber-800 hover:bg-amber-50">
          {isSpeaking ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
        </Button>

        {/* Copy current slide */}
        <Button onClick={() => copyText(getSlideText())} variant="outline"
          className="h-14 w-14 shrink-0 rounded-2xl border-2 border-amber-400 text-amber-800 hover:bg-amber-50">
          <Clipboard className="h-5 w-5" />
        </Button>

        {current === slides.length - 1 ? (
          <div className="flex flex-1 gap-2">
            <Button onClick={() => window.print()}
              className="h-14 flex-1 rounded-2xl bg-amber-700 text-base font-bold text-white hover:bg-amber-800">
              <Printer className="mr-1 h-5 w-5" /> මුද්‍රණය
            </Button>
            <Button onClick={handleDownloadPdf}
              className="h-14 flex-1 rounded-2xl bg-amber-900 text-base font-bold text-white hover:bg-black">
              <Download className="mr-1 h-5 w-5" /> PDF
            </Button>
          </div>
        ) : (
          <Button onClick={() => paginate(1)}
            className="h-14 flex-1 rounded-2xl bg-amber-700 text-lg font-bold text-white hover:bg-amber-800">
            ඉදිරියට <ChevronRight className="ml-1 h-6 w-6" />
          </Button>
        )}
      </div>

      {/* Keyboard hint */}
      <p className="pb-2 text-center text-xs text-amber-400">← → ඊතල යතුරු | Esc — වසන්න</p>

      {/* Off-screen printable layout */}
      <div ref={printableRef} aria-hidden="true" className="fixed left-[-9999px] top-0 w-[800px]">
        <PrintableLesson lesson={lesson} ageLabel={ageLabel} />
      </div>

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #printable-root, #printable-root * { visibility: visible; }
          #printable-root { position: absolute; inset: 0; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CopyBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="mt-auto flex items-center gap-1.5 self-end rounded-lg border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-500 hover:bg-amber-50">
      <Clipboard className="h-3.5 w-3.5" /> පිටපත් කරන්න
    </button>
  );
}

function CoverSlide({ lesson, ageLabel, onCopy }: {
  lesson: LessonData; ageLabel: string; onCopy: (t: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center gap-4 text-center">
      {lesson.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={lesson.image_url} alt={lesson.title} className="h-52 w-full rounded-2xl object-cover shadow-lg" />
      ) : (
        <div className="flex h-52 w-full items-center justify-center rounded-2xl bg-amber-100">
          <BookOpen className="h-16 w-16 text-amber-400" />
        </div>
      )}
      <h2 className="text-2xl font-bold text-amber-900 sm:text-3xl">{lesson.title}</h2>
      {ageLabel && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">{ageLabel}</span>}
      <blockquote className="rounded-xl bg-amber-50 px-4 py-3 text-base font-medium italic text-amber-800">
        {lesson.bible_verse}
      </blockquote>
      <p className="text-xs text-amber-400">මෙම පදයේ නිවැරදි වචන සඳහා ශුද්ධ බයිබලය පරීක්ෂා කරන්න.</p>
      <CopyBtn onClick={() => onCopy(`${lesson.title}\n${lesson.bible_verse}`)} />
    </div>
  );
}

function MemorySlide({ verse, onCopy }: { verse: string; onCopy: (t: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <div className="flex items-center gap-2 text-amber-700">
        <Star className="h-6 w-6 fill-amber-400 stroke-amber-500" />
        <h3 className="text-xl font-bold">කටපාඩම් පදය</h3>
        <Star className="h-6 w-6 fill-amber-400 stroke-amber-500" />
      </div>
      <div className="w-full rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 p-1 shadow-xl">
        <div className="rounded-3xl bg-white px-6 py-8">
          <p className="text-2xl font-bold leading-relaxed text-amber-900 sm:text-3xl">{verse}</p>
        </div>
      </div>
      <p className="text-sm text-amber-600">ළමුන් සමඟ කිහිප වරක් කියවා ප්‍රගුණ කරන්න</p>
      <CopyBtn onClick={() => onCopy(verse)} />
    </div>
  );
}

function StorySlide({ text, index, total, imageUrl, onCopy }: {
  text: string; index: number; total: number; imageUrl: string | null; onCopy: (t: string) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      {imageUrl && index === 0 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-36 w-full rounded-2xl object-cover shadow" />
      )}
      <span className="text-xs font-bold text-amber-400">කොටස {index + 1} / {total}</span>
      <p className="flex-1 text-xl leading-relaxed text-stone-800 sm:text-2xl">{text}</p>
      <CopyBtn onClick={() => onCopy(text)} />
    </div>
  );
}

function ActivitiesSlide({ ideas, onCopy }: { ideas: string[]; onCopy: (t: string) => void }) {
  const allText = ideas.map((a, i) => `${i + 1}. ${a}`).join("\n");
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2 text-amber-700">
        <Lightbulb className="h-6 w-6" />
        <h3 className="text-xl font-bold sm:text-2xl">ක්‍රියාකාරකම්</h3>
      </div>
      <ol className="flex-1 space-y-3">
        {ideas.map((idea, i) => (
          <li key={i} className="flex gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-base font-medium text-stone-800 sm:text-lg">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">{i + 1}</span>
            {idea}
          </li>
        ))}
      </ol>
      <CopyBtn onClick={() => onCopy(allText)} />
    </div>
  );
}

function QuizSlide({ questions, onCopy }: { questions: string[]; onCopy: (t: string) => void }) {
  const allText = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  const [showTimer, setShowTimer] = useState(false);
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-amber-700">
          <HelpCircle className="h-6 w-6" />
          <h3 className="text-xl font-bold sm:text-2xl">අවබෝධතා ප්‍රශ්න</h3>
        </div>
        <button type="button" onClick={() => setShowTimer((s) => !s)}
          className={`rounded-xl border-2 px-3 py-1.5 text-xs font-bold transition ${
            showTimer ? "border-orange-500 bg-orange-500 text-white" : "border-amber-300 bg-white text-amber-700"}`}>
          ⏱ {showTimer ? "Timer වසන්න" : "Timer"}
        </button>
      </div>

      {showTimer && (
        <div className="rounded-2xl bg-amber-50 py-3">
          <QuizTimer />
        </div>
      )}

      <ol className="flex-1 space-y-3 overflow-y-auto">
        {questions.map((q, i) => (
          <li key={i} className="rounded-2xl bg-amber-50 px-4 py-3 text-base font-medium text-stone-800 sm:text-lg">
            <span className="mr-2 font-bold text-amber-700">{i + 1}.</span>{q}
          </li>
        ))}
      </ol>
      <CopyBtn onClick={() => onCopy(allText)} />
    </div>
  );
}

function PrintableLesson({ lesson, ageLabel }: { lesson: LessonData; ageLabel: string }) {
  const hasStory      = lesson.story_slides.length > 0;
  const hasQuiz       = lesson.quiz_questions.length > 0;
  const hasActivities = (lesson.activity_ideas?.length ?? 0) > 0;
  const hasMemory     = Boolean(lesson.memory_verse?.trim());
  return (
    <div id="printable-root" className="mx-auto max-w-2xl space-y-5 bg-white p-8 text-stone-900">
      {lesson.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={lesson.image_url} alt="" className="h-64 w-full rounded-xl object-cover" />
      )}
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">{lesson.title}</h1>
        {ageLabel && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700">{ageLabel}</span>}
      </div>
      <blockquote className="rounded-xl bg-amber-50 px-4 py-3 text-lg font-medium italic">{lesson.bible_verse}</blockquote>
      <p className="text-xs text-stone-400">මෙම පදයේ නිවැරදි වචන සඳහා ශුද්ධ බයිබලය පරීක්ෂා කරන්න.</p>
      {hasMemory && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-5 py-4 text-center">
          <p className="mb-1 text-xs font-bold text-amber-600">⭐ කටපාඩම් පදය</p>
          <p className="text-xl font-bold text-amber-900">{lesson.memory_verse}</p>
        </div>
      )}
      {hasStory && (
        <>
          <hr className="border-stone-200" />
          <div className="space-y-3">{lesson.story_slides.map((p, i) => <p key={i} className="text-base leading-relaxed">{p}</p>)}</div>
        </>
      )}
      {hasActivities && (
        <>
          <hr className="border-stone-200" />
          <h2 className="text-xl font-bold">ක්‍රියාකාරකම්</h2>
          <ol className="list-inside list-decimal space-y-2 text-base">{(lesson.activity_ideas ?? []).map((a, i) => <li key={i}>{a}</li>)}</ol>
        </>
      )}
      {hasQuiz && (
        <>
          <hr className="border-stone-200" />
          <h2 className="text-xl font-bold">අවබෝධතා ප්‍රශ්න</h2>
          <ol className="list-inside list-decimal space-y-2 text-base">{lesson.quiz_questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
        </>
      )}
      <hr className="border-stone-200" />
      <p className="text-center text-xs text-stone-400">නිර්මාණය හා සංවර්ධනය — Prabhath Lokuge · දහම් පාසල් සහායක © 2026</p>
    </div>
  );
}
