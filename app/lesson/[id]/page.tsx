/**
 * app/lesson/[id]/page.tsx — SERVER COMPONENT
 * generateMetadata fetches lesson title/verse via Firestore REST API
 * so WhatsApp/social previews show the actual lesson, not generic app text.
 * allow get: if true means no auth needed for this public read.
 */

import type { Metadata } from "next";
import LessonPageClient from "./LessonPageClient";

interface FirestoreField { stringValue?: string; }

async function fetchLessonMeta(id: string): Promise<{ title: string; bible_verse: string } | null> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/lessons/${id}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const fields = data.fields as Record<string, FirestoreField> | undefined;
    if (!fields) return null;
    return {
      title:       fields.title?.stringValue       ?? "දහම් පාසල් සහායක",
      bible_verse: fields.bible_verse?.stringValue ?? "",
    };
  } catch { return null; }
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const meta = await fetchLessonMeta(id);
  if (!meta) return { title: "පාඩම — දහම් පාසල් සහායක" };

  const description = meta.bible_verse ? `✨ ${meta.bible_verse}` : "සිංහල බයිබල් පාඩම.";
  return {
    title: `${meta.title} — දහම් පාසල් සහායක`,
    description,
    openGraph: { type: "article", title: `${meta.title} — දහම් පාසල් සහායක`, description, siteName: "දහම් පාසල් සහායක", locale: "si_LK" },
    twitter:   { card: "summary", title: `${meta.title} — දහම් පාසල් සහායක`, description },
  };
}

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LessonPageClient id={id} />;
}
