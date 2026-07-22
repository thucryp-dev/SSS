"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Eye, EyeOff, Loader2, Search, Star, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { type SavedLesson, formatLessonDate, getLessonHistory, isFirebaseConfigured } from "@/lib/firebase";
import { loadFavorites, loadHiddenLessons, toggleFavorite, toggleHidden } from "@/lib/storage";

export default function HistoryPage() {
  const [lessons, setLessons]           = useState<SavedLesson[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [loadError, setLoadError]       = useState(false);
  const [search, setSearch]             = useState("");
  const [favorites, setFavorites]       = useState<Set<string>>(new Set());
  const [hidden, setHidden]             = useState<Set<string>>(new Set());
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [showHidden, setShowHidden]     = useState(false);

  useEffect(() => {
    setFavorites(loadFavorites());
    setHidden(loadHiddenLessons());
    if (!isFirebaseConfigured) { setIsLoading(false); return; }
    getLessonHistory(50)
      .then(setLessons)
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false));
  }, []);

  const handleFav = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    const now = toggleFavorite(id);
    setFavorites((p) => { const s = new Set(p); now ? s.add(id) : s.delete(id); return s; });
  };

  const handleHide = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    const now = toggleHidden(id);
    setHidden((p) => { const s = new Set(p); now ? s.add(id) : s.delete(id); return s; });
  };

  const filtered = lessons.filter((l) => {
    const isHid = hidden.has(l.id);
    if (showHidden) return isHid;
    if (isHid) return false;
    if (showFavsOnly && !favorites.has(l.id)) return false;
    if (search) {
      const q = search.toLowerCase();
      return l.title.toLowerCase().includes(q)
        || (l.bible_verse ?? "").toLowerCase().includes(q)
        || (l.memory_verse ?? "").toLowerCase().includes(q)
        || (l.inputText ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  const favCount    = lessons.filter((l) => favorites.has(l.id) && !hidden.has(l.id)).length;
  const hiddenCount = lessons.filter((l) => hidden.has(l.id)).length;
  const visibleCount = lessons.filter((l) => !hidden.has(l.id)).length;

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-amber-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-5">

        <Link href="/" className="inline-flex items-center gap-2 text-base font-semibold text-amber-700 hover:text-amber-900">
          <ArrowLeft className="h-5 w-5" /> ආපසු
        </Link>

        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold text-amber-900">පැරණි පාඩම්</h1>
            {lessons.length > 0 && (
              <p className="text-sm text-amber-600">
                {visibleCount}ක් · ⭐ {favCount}ක்
                {hiddenCount > 0 ? ` · 🙈 ${hiddenCount}ක්` : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button"
              onClick={() => { setShowFavsOnly((p) => !p); setShowHidden(false); }}
              className={`flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-bold transition ${
                showFavsOnly ? "border-amber-500 bg-amber-500 text-white" : "border-amber-300 bg-white text-amber-700"}`}>
              <Star className={`h-4 w-4 ${showFavsOnly ? "fill-white" : ""}`} /> ප්‍රිය
            </button>
            {hiddenCount > 0 && (
              <button type="button"
                onClick={() => { setShowHidden((p) => !p); setShowFavsOnly(false); }}
                className={`flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-bold transition ${
                  showHidden ? "border-stone-500 bg-stone-500 text-white" : "border-stone-300 bg-white text-stone-600"}`}>
                {showHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {showHidden ? "නිවාරිත" : `${hiddenCount}`}
              </button>
            )}
          </div>
        </div>

        {lessons.length > 0 && !showHidden && (
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-400" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="ශීර්ෂකය, පදය, හෝ අදහස සොයන්න..."
              className="w-full rounded-2xl border-2 border-amber-200 bg-white py-3 pl-10 pr-10 text-base text-stone-800 outline-none focus:border-amber-500" />
            {search && (
              <button type="button" onClick={() => setSearch("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-amber-400 hover:text-amber-700">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {!isFirebaseConfigured ? (
          <Card className="border-2 border-amber-200 bg-white/80">
            <CardContent className="pt-6 text-center text-base text-stone-700">
              පැරණි පාඩම් සුරැකීමේ පහසුකම දැනට සක්‍රිය කර නැත.
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-amber-600" /></div>
        ) : loadError ? (
          <Card className="border-2 border-red-200 bg-red-50">
            <CardContent className="pt-6 text-center text-base text-red-700">
              පැරණි පාඩම් ලබාගැනීමේදී දෝෂයක් ඇති විය.
            </CardContent>
          </Card>
        ) : lessons.length === 0 ? (
          <Card className="border-2 border-amber-200 bg-white/80">
            <CardContent className="pt-6 text-center text-base text-stone-700">තවම පාඩම් සකස් කර නැත.</CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="border-2 border-amber-200 bg-white/80">
            <CardContent className="pt-6 text-center text-base text-stone-700">
              {showHidden ? "සඟවා ඇති පාඩම් නෑ." : search ? `"${search}" සඳහා ගැළපෙන පාඩමක් නෑ.` : "ප්‍රිය පාඩම් නෑ."}
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {filtered.map((lesson) => {
              const isFav = favorites.has(lesson.id);
              const isHid = hidden.has(lesson.id);
              return (
                <li key={lesson.id} className="relative">
                  <Link href={`/lesson/${lesson.id}`}
                    className={`block w-full rounded-2xl border-2 bg-white/80 p-4 shadow-sm transition hover:shadow-md ${
                      isHid ? "border-stone-200 opacity-60" : "border-amber-200 hover:border-amber-400"}`}>
                    <div className="flex items-start gap-3">
                      <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                        <BookOpen className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1 pr-16">
                        <p className="text-lg font-bold leading-snug text-amber-900">{lesson.title}</p>
                        {lesson.inputText && (
                          <p className="mt-0.5 truncate text-xs italic text-stone-400">💬 {lesson.inputText}</p>
                        )}
                        {lesson.memory_verse && (
                          <p className="mt-0.5 truncate text-sm italic text-amber-700">⭐ {lesson.memory_verse}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                            {lesson.age_group === "adult" ? "වැඩිහිටි" : lesson.age_group ? `අවු. ${lesson.age_group}` : ""}
                          </span>
                          {lesson.sections?.story      && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">📖</span>}
                          {lesson.sections?.quiz       && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">❓</span>}
                          {lesson.sections?.activities && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">✨</span>}
                          {lesson.sections?.image      && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">🎨</span>}
                        </div>
                        <p className="mt-1 text-xs text-amber-500">{formatLessonDate(lesson.createdAt)}</p>
                      </div>
                    </div>
                  </Link>
                  <div className="absolute right-3 top-3 flex flex-col gap-1">
                    <button type="button" onClick={(e) => handleFav(lesson.id, e)}
                      className="rounded-full p-1.5 text-amber-400 hover:text-amber-700">
                      <Star className={`h-5 w-5 ${isFav ? "fill-amber-500 text-amber-500" : ""}`} />
                    </button>
                    <button type="button" onClick={(e) => handleHide(lesson.id, e)}
                      className="rounded-full p-1.5 text-stone-300 hover:text-stone-500">
                      {isHid ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {hiddenCount > 0 && !showHidden && (
          <p className="text-center text-xs text-stone-400">
            සඟවා ඇති පාඩම් {hiddenCount}ක් ඇත. ඉහළ 👁 button ඔබා බලන්න.
          </p>
        )}
      </div>
    </main>
  );
}
