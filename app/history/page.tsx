"use client";

/**
 * app/history/page.tsx
 *
 * Lists previously generated lessons (lib/firebase.ts's "lessons"
 * collection). Each item links to /lesson/[id], which fetches and
 * displays it in the same LessonPresentation component used for freshly
 * generated lessons — so every history entry also gets a real,
 * bookmarkable/shareable URL for free.
 *
 * Three states handled explicitly:
 *   1. Firebase not configured  -> honest explanation, no crash
 *   2. Configured but loading   -> spinner
 *   3. Configured, loaded       -> list, or an empty-state message
 *
 * No delete action here on purpose: firestore.rules makes the "lessons"
 * collection append-only from the client (`allow update, delete: if
 * false`). Add a delete button only if you also relax that rule.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { type SavedLesson, formatLessonDate, getLessonHistory, isFirebaseConfigured } from "@/lib/firebase";

export default function HistoryPage() {
  const [lessons, setLessons] = useState<SavedLesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsLoading(false);
      return;
    }
    getLessonHistory()
      .then(setLessons)
      .catch((err) => {
        console.error("Failed to load lesson history:", err);
        setLoadError(true);
      })
      .finally(() => setIsLoading(false));
  }, []);

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
          <h1 className="text-3xl font-bold text-amber-900">පැරණි පාඩම්</h1>
          <p className="text-base text-amber-700">කලින් සකස් කළ පාඩම් මෙහි නැවත බැලිය හැක</p>
        </header>

        {!isFirebaseConfigured ? (
          <Card className="border-2 border-amber-200 bg-white/80">
            <CardContent className="pt-6 text-center text-base text-stone-700">
              පැරණි පාඩම් සුරැකීමේ පහසුකම මෙම app එකේ දැනට සක්‍රිය කර නැත.
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
          </div>
        ) : loadError ? (
          <Card className="border-2 border-red-200 bg-red-50">
            <CardContent className="pt-6 text-center text-base text-red-700">
              පැරණි පාඩම් ලබාගැනීමේදී දෝෂයක් ඇති විය.
            </CardContent>
          </Card>
        ) : lessons.length === 0 ? (
          <Card className="border-2 border-amber-200 bg-white/80">
            <CardContent className="pt-6 text-center text-base text-stone-700">
              තවම පාඩම් සකස් කර නැත.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/lesson/${lesson.id}`}
                  className="block w-full rounded-2xl border-2 border-amber-200 bg-white/80 p-4 text-left shadow-sm transition hover:border-amber-400 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                      <BookOpen className="h-5 w-5" />
                    </span>
                    <div className="flex-1">
                      <p className="text-lg font-bold text-amber-900">{lesson.title}</p>
                      <p className="text-sm text-amber-600">
                        {formatLessonDate(lesson.createdAt)}
                        {lesson.age_group ? ` · අවු. ${lesson.age_group}` : ""}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
