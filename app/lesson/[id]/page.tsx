"use client";

/**
 * app/lesson/[id]/page.tsx
 *
 * Shareable lesson view. Anyone with the link (e.g. shared via WhatsApp
 * from LessonPresentation's share button) lands here, and — if Firebase
 * is configured and the document still exists — sees the exact same
 * full-screen presentation the original teacher used.
 *
 * Also the target for history items in app/history/page.tsx, so every
 * past lesson gets a real, bookmarkable URL instead of only being
 * viewable via in-memory component state.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { type SavedLesson, getLessonById, isFirebaseConfigured } from "@/lib/firebase";
import LessonPresentation from "@/components/LessonPresentation";

type Status = "loading" | "unavailable" | "not-found" | "ready";

export default function SharedLessonPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [lesson, setLesson] = useState<SavedLesson | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setStatus("unavailable");
      return;
    }

    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    if (!id) {
      setStatus("not-found");
      return;
    }

    getLessonById(id)
      .then((result) => {
        if (!result) {
          setStatus("not-found");
        } else {
          setLesson(result);
          setStatus("ready");
        }
      })
      .catch((err) => {
        console.error("Failed to load shared lesson:", err);
        setStatus("not-found");
      });
  }, [params.id]);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100">
        <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
      </main>
    );
  }

  if (status !== "ready" || !lesson) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100 px-4 text-center">
        <p className="text-xl font-bold text-amber-900">
          {status === "unavailable"
            ? "මෙම පහසුකම දැනට සක්‍රිය කර නැත."
            : "මෙම පාඩම හමු නොවුණි."}
        </p>
        <Link href="/" className="text-base font-semibold text-amber-700 underline">
          මුල් පිටුවට යන්න
        </Link>
      </main>
    );
  }

  return <LessonPresentation lesson={lesson} onClose={() => router.push("/")} />;
}
