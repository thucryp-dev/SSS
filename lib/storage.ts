/**
 * lib/storage.ts
 *
 * SSR-safe localStorage utilities. Every function checks for window before
 * accessing localStorage so Next.js server-side renders without throwing.
 */

// ---------------------------------------------------------------------------
// Draft input — survives page reload
// ---------------------------------------------------------------------------

const KEY_DRAFT = "dahampasala_draft";

export function saveDraft(text: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY_DRAFT, text); } catch {}
}

export function loadDraft(): string {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(KEY_DRAFT) ?? ""; } catch { return ""; }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(KEY_DRAFT); } catch {}
}

// ---------------------------------------------------------------------------
// Recent topics — last 5 submitted inputs
// ---------------------------------------------------------------------------

const KEY_RECENT = "dahampasala_recent";
const MAX_RECENT = 5;

export function saveRecentTopic(text: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = text.trim().slice(0, 100);
    if (!trimmed) return;
    const existing = loadRecentTopics().filter((t) => t !== trimmed);
    const updated = [trimmed, ...existing].slice(0, MAX_RECENT);
    localStorage.setItem(KEY_RECENT, JSON.stringify(updated));
  } catch {}
}

export function loadRecentTopics(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_RECENT);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Font size preference
// ---------------------------------------------------------------------------

const KEY_FONT = "dahampasala_font";
export type FontSize = "normal" | "large" | "xlarge";

export function saveFontSize(size: FontSize): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY_FONT, size); } catch {}
}

export function loadFontSize(): FontSize {
  if (typeof window === "undefined") return "normal";
  try {
    const v = localStorage.getItem(KEY_FONT);
    if (v === "large" || v === "xlarge") return v;
    return "normal";
  } catch { return "normal"; }
}

// ---------------------------------------------------------------------------
// Favorite lesson IDs (local — no Firebase needed)
// ---------------------------------------------------------------------------

const KEY_FAVS = "dahampasala_favorites";

export function loadFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY_FAVS);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

export function toggleFavorite(id: string): boolean {
  const favs = loadFavorites();
  if (favs.has(id)) { favs.delete(id); } else { favs.add(id); }
  try { localStorage.setItem(KEY_FAVS, JSON.stringify([...favs])); } catch {}
  return favs.has(id);
}

// ---------------------------------------------------------------------------
// Hidden lessons — soft-delete from history UI without touching Firestore
// ---------------------------------------------------------------------------

const KEY_HIDDEN = "dahampasala_hidden";

export function loadHiddenLessons(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY_HIDDEN);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

export function toggleHidden(id: string): boolean {
  const hidden = loadHiddenLessons();
  if (hidden.has(id)) { hidden.delete(id); } else { hidden.add(id); }
  try { localStorage.setItem(KEY_HIDDEN, JSON.stringify([...hidden])); } catch {}
  return hidden.has(id);
}
