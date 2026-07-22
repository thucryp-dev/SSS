"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { type SavedLesson, getLessonById, isFirebaseConfigured } from "@/lib/firebase";
import LessonPresentation from "@/components/LessonPresentation";

type Status = "loading" | "unavailable" | "not-found" | "ready";

export default function LessonPageClient({ id }: { id: string }) {
  const router = useRouter();
  const [lesson, setLesson] = useState<SavedLesson | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!isFirebaseConfigured) { setStatus("unavailable"); return; }
    if (!id) { setStatus("not-found"); return; }
    getLessonById(id)
      .then((result) => { if (!result) { setStatus("not-found"); return; } setLesson(result); setStatus("ready"); })
      .catch(() => setStatus("not-found"));
  }, [id]);

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
          {status === "unavailable" ? "මෙම පහසුකම දැනට සක්‍රිය කර නැත." : "මෙම පාඩම හමු නොවිණ."}
        </p>
        <Link href="/" className="text-base font-semibold text-amber-700 underline">මුල් පිටුවට යන්න</Link>
      </main>
    );
  }

  return <LessonPresentation lesson={lesson} onClose={() => router.push("/")} />;
}
