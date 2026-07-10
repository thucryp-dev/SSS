"use client";

/**
 * components/LessonPresentation.tsx
 *
 * Full-screen, swipeable "story mode" for presenting a generated lesson to
 * the class:
 *   - Cover slide (image, title, Bible verse)
 *   - One slide per story paragraph
 *   - One quiz slide
 *
 * Includes:
 *   - Framer Motion drag-to-swipe + button navigation
 *   - Per-slide "Read Aloud" via window.speechSynthesis (Sinhala voice if
 *     available — see the one-time notice below if it isn't)
 *   - Share via the Web Share API, falling back to a WhatsApp deep link.
 *     Includes a real /lesson/[id] link when `lesson.id` is present (i.e.
 *     Firebase is configured and the save succeeded) — degrades to a
 *     text-only summary otherwise.
 *   - Print (native @media print) and "Download" (html2pdf.js) of the full lesson
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  HelpCircle,
  Printer,
  Share2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LessonData } from "@/lib/firebase";

interface LessonPresentationProps {
  lesson: LessonData & { id?: string };
  onClose: () => void;
}

type Slide = { type: "cover" } | { type: "story"; text: string; index: number } | { type: "quiz" };

const SWIPE_CONFIDENCE_THRESHOLD = 8000;

export default function LessonPresentation({ lesson, onClose }: LessonPresentationProps) {
  // Only build slides for sections that were actually generated.
  // lesson.sections may be undefined for lessons saved before v1.12.
  const hasStory = (lesson.sections?.story !== false) && lesson.story_slides.length > 0;
  const hasQuiz  = (lesson.sections?.quiz  !== false) && lesson.quiz_questions.length > 0;

  const slides: Slide[] = useMemo(
    () => [
      { type: "cover" },
      ...(hasStory
        ? lesson.story_slides.map((text, index) => ({ type: "story" as const, text, index }))
        : []),
      ...(hasQuiz ? [{ type: "quiz" as const }] : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lesson.story_slides, lesson.quiz_questions, hasStory, hasQuiz]
  );

  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasSinhalaVoice, setHasSinhalaVoice] = useState<boolean | null>(null);
  const [voiceNoticeDismissed, setVoiceNoticeDismissed] = useState(false);
  const printableRef = useRef<HTMLDivElement>(null);

  // ---- Preload speech-synthesis voices (Chrome loads them asynchronously),
  // and check once whether a Sinhala voice actually exists on this device —
  // many Android phones don't ship one, so "Read Aloud" silently reads in
  // whatever language the default voice happens to be.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const checkVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        setHasSinhalaVoice(voices.some((v) => v.lang.toLowerCase().startsWith("si")));
      }
    };

    checkVoices();
    window.speechSynthesis.onvoiceschanged = checkVoices;
    return () => window.speechSynthesis.cancel();
  }, []);

  const paginate = (newDirection: number) => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setDirection(newDirection);
    setCurrent((prev) => Math.min(Math.max(prev + newDirection, 0), slides.length - 1));
  };

  const handleDragEnd = (_event: unknown, info: PanInfo) => {
    const power = info.offset.x * info.velocity.x;
    if ((info.offset.x < -80 || power < -SWIPE_CONFIDENCE_THRESHOLD) && current < slides.length - 1) {
      paginate(1);
    } else if ((info.offset.x > 80 || power > SWIPE_CONFIDENCE_THRESHOLD) && current > 0) {
      paginate(-1);
    }
  };

  // ---- Text to speech ----------------------------------------------------------
  const speak = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const sinhalaVoice = voices.find((v) => v.lang.toLowerCase().startsWith("si"));
    utterance.lang = sinhalaVoice?.lang ?? "si-LK";
    if (sinhalaVoice) utterance.voice = sinhalaVoice;
    utterance.rate = 0.92;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  // ---- Share ---------------------------------------------------------------------
  const handleShare = async () => {
    const summary = lesson.story_slides[0] ?? lesson.bible_verse;
    const link = lesson.id ? `\n\n${window.location.origin}/lesson/${lesson.id}` : "";
    const shareText = `📖 ${lesson.title}\n\n✨ ${lesson.bible_verse}\n\n${summary}${link}\n\n— දහම් පාසල් සහායක`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: lesson.title, text: shareText });
        return;
      } catch {
        // User dismissed the native share sheet — fall back to WhatsApp.
      }
    }
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // ---- PDF export ------------------------------------------------------------------
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
    } catch (err) {
      console.error("PDF export failed:", err);
      window.alert("PDF සකස් කිරීමේදී දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.");
    }
  };

  const handlePrint = () => window.print();

  const slide = slides[current];
  const isFirst = current === 0;
  const isLast = current === slides.length - 1;

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 320 : -320, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -320 : 320, opacity: 0 }),
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-amber-100 via-orange-50 to-amber-200">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="ඉදිරිපත් කිරීම වසන්න"
          className="h-12 w-12 rounded-full bg-white/70 text-amber-900 shadow hover:bg-white"
        >
          <X className="h-6 w-6" />
        </Button>

        <div className="flex items-center gap-1.5" aria-hidden="true">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-2.5 rounded-full transition-all ${
                i === current ? "w-6 bg-amber-700" : "w-2.5 bg-amber-300"
              }`}
            />
          ))}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleShare}
          aria-label="බෙදාගන්න"
          className="h-12 w-12 rounded-full bg-white/70 text-amber-900 shadow hover:bg-white"
        >
          <Share2 className="h-5 w-5" />
        </Button>
      </div>

      {/* One-time notice if this device has no Sinhala speech-synthesis voice */}
      {hasSinhalaVoice === false && !voiceNoticeDismissed && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-800">
          <span className="flex-1">
            ඔබගේ දුරකථනයේ සිංහල කථන හඬක් සක්‍රිය කර නැත. &ldquo;හඬින් කියවන්න&rdquo; බොත්තම
            වෙනත් භාෂාවක උච්චාරණයකින් කියවනු ඇත.
          </span>
          <button
            type="button"
            onClick={() => setVoiceNoticeDismissed(true)}
            aria-label="මෙම දැනුම්දීම වසන්න"
            className="shrink-0 text-amber-600 hover:text-amber-900"
          >
            ✕
          </button>
        </div>
      )}

      {/* Slide area */}
      <div className="relative flex-1 overflow-hidden px-4 pb-4">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={current}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.32, ease: "easeInOut" }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragEnd={handleDragEnd}
            className="mx-auto flex h-full max-w-xl flex-col overflow-y-auto rounded-3xl bg-white/90 p-5 shadow-2xl"
          >
            {slide.type === "cover" && <CoverSlide lesson={lesson} onSpeak={speak} isSpeaking={isSpeaking} />}
            {slide.type === "story" && (
              <StorySlide
                text={slide.text}
                index={slide.index}
                total={lesson.story_slides.length}
                imageUrl={lesson.image_url}
                onSpeak={speak}
                isSpeaking={isSpeaking}
              />
            )}
            {slide.type === "quiz" && (
              <QuizSlide questions={lesson.quiz_questions} onSpeak={speak} isSpeaking={isSpeaking} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <div className="flex items-center justify-between gap-3 px-5 pb-6">
        <Button
          onClick={() => paginate(-1)}
          disabled={isFirst}
          className="h-14 flex-1 rounded-2xl bg-amber-200 text-lg font-bold text-amber-900 hover:bg-amber-300 disabled:opacity-40"
        >
          <ChevronLeft className="mr-1 h-6 w-6" /> පෙරයට
        </Button>

        {isLast ? (
          <div className="flex flex-1 gap-2">
            <Button
              onClick={handlePrint}
              className="h-14 flex-1 rounded-2xl bg-amber-700 text-base font-bold text-white hover:bg-amber-800"
            >
              <Printer className="mr-1 h-5 w-5" /> මුද්‍රණය
            </Button>
            <Button
              onClick={handleDownloadPdf}
              className="h-14 flex-1 rounded-2xl bg-amber-900 text-base font-bold text-white hover:bg-black"
            >
              <Download className="mr-1 h-5 w-5" /> බාගත කරන්න
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => paginate(1)}
            className="h-14 flex-1 rounded-2xl bg-amber-700 text-lg font-bold text-white hover:bg-amber-800"
          >
            ඉදිරියට <ChevronRight className="ml-1 h-6 w-6" />
          </Button>
        )}
      </div>

      {/* Off-screen printable layout used by both window.print() and html2pdf.js.
          Positioned off-screen (not display:none) so html2canvas can still render it. */}
      <div ref={printableRef} aria-hidden="true" className="fixed left-[-9999px] top-0 w-[800px]">
        <PrintableLesson lesson={lesson} />
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-lesson-root,
          #printable-lesson-root * {
            visibility: visible;
          }
          #printable-lesson-root {
            position: absolute;
            inset: 0;
            left: 0;
            top: 0;
          }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SpeakButton({
  onSpeak,
  isSpeaking,
  text,
}: {
  onSpeak: (text: string) => void;
  isSpeaking: boolean;
  text: string;
}) {
  return (
    <Button
      variant="outline"
      onClick={() => onSpeak(text)}
      className="mt-auto h-12 w-full rounded-xl border-2 border-amber-400 text-base font-semibold text-amber-800 hover:bg-amber-50"
    >
      {isSpeaking ? <VolumeX className="mr-2 h-5 w-5" /> : <Volume2 className="mr-2 h-5 w-5" />}
      {isSpeaking ? "නවත්වන්න" : "හඬින් කියවන්න"}
    </Button>
  );
}

function CoverSlide({
  lesson,
  onSpeak,
  isSpeaking,
}: {
  lesson: LessonData;
  onSpeak: (text: string) => void;
  isSpeaking: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center gap-4 text-center">
      {lesson.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={lesson.image_url}
          alt={lesson.title}
          className="h-56 w-full rounded-2xl object-cover shadow-lg sm:h-64"
        />
      ) : (
        <div className="flex h-56 w-full items-center justify-center rounded-2xl bg-amber-100 sm:h-64">
          <BookOpen className="h-16 w-16 text-amber-400" />
        </div>
      )}
      <h2 className="text-2xl font-bold text-amber-900 sm:text-3xl">{lesson.title}</h2>
      {lesson.age_group && (
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
          {lesson.age_group === "adult" ? "වැඩිහිටි" : `අවු. ${lesson.age_group}`}
        </span>
      )}
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-lg font-medium text-amber-800">
        {lesson.bible_verse}
      </p>
      <p className="text-xs text-amber-500">
        මෙම පදයේ නිවැරදි වචන සඳහා කරුණාකර ශුද්ධ බයිබලය පරීක්ෂා කරන්න.
      </p>
      <SpeakButton onSpeak={onSpeak} isSpeaking={isSpeaking} text={`${lesson.title}. ${lesson.bible_verse}`} />
    </div>
  );
}

function StorySlide({
  text,
  index,
  total,
  imageUrl,
  onSpeak,
  isSpeaking,
}: {
  text: string;
  index: number;
  total: number;
  imageUrl: string | null;
  onSpeak: (text: string) => void;
  isSpeaking: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-40 w-full rounded-2xl object-cover shadow" />
      )}
      <span className="text-sm font-semibold text-amber-500">
        කොටස {index + 1} / {total}
      </span>
      <p className="flex-1 text-xl leading-relaxed text-stone-800 sm:text-2xl">{text}</p>
      <SpeakButton onSpeak={onSpeak} isSpeaking={isSpeaking} text={text} />
    </div>
  );
}

function QuizSlide({
  questions,
  onSpeak,
  isSpeaking,
}: {
  questions: string[];
  onSpeak: (text: string) => void;
  isSpeaking: boolean;
}) {
  const allText = questions.map((q, i) => `${i + 1}. ${q}`).join(". ");
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2 text-amber-700">
        <HelpCircle className="h-6 w-6" />
        <h3 className="text-xl font-bold sm:text-2xl">අවබෝධතා ප්‍රශ්න</h3>
      </div>
      <ol className="flex-1 space-y-4">
        {questions.map((q, i) => (
          <li key={i} className="rounded-2xl bg-amber-50 px-4 py-3 text-lg font-medium text-stone-800 sm:text-xl">
            <span className="mr-2 font-bold text-amber-700">{i + 1}.</span>
            {q}
          </li>
        ))}
      </ol>
      <SpeakButton onSpeak={onSpeak} isSpeaking={isSpeaking} text={allText} />
    </div>
  );
}

function PrintableLesson({ lesson }: { lesson: LessonData }) {
  const hasStory = lesson.story_slides.length > 0;
  const hasQuiz  = lesson.quiz_questions.length > 0;

  return (
    <div id="printable-lesson-root" className="mx-auto max-w-2xl space-y-4 bg-white p-8 text-stone-900">
      {lesson.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={lesson.image_url} alt="" className="h-64 w-full rounded-xl object-cover" />
      )}
      <h1 className="text-3xl font-bold">{lesson.title}</h1>
      {lesson.age_group && (
        <p className="text-sm font-bold text-amber-700">
          {lesson.age_group === "adult" ? "වැඩිහිටි" : `අවු. ${lesson.age_group}`}
        </p>
      )}
      <p className="text-lg font-medium italic">{lesson.bible_verse}</p>
      <p className="text-xs text-stone-500">
        මෙම පදයේ නිවැරදි වචන සඳහා කරුණාකර ශුද්ධ බයිබලය පරීක්ෂා කරන්න.
      </p>

      {hasStory && (
        <>
          <hr className="border-stone-300" />
          <div className="space-y-3">
            {lesson.story_slides.map((paragraph, i) => (
              <p key={i} className="text-base leading-relaxed">{paragraph}</p>
            ))}
          </div>
        </>
      )}

      {hasQuiz && (
        <>
          <hr className="border-stone-300" />
          <div>
            <h2 className="mb-2 text-xl font-bold">අවබෝධතා ප්‍රශ්න</h2>
            <ol className="list-inside list-decimal space-y-1 text-base">
              {lesson.quiz_questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
