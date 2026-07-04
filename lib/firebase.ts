/**
 * lib/firebase.ts
 *
 * Firebase setup for "Sunday School Assistant" (දහම් පාසල් සහායක).
 *
 * FIREBASE IS OPTIONAL. The core feature (voice/text → Gemini → image →
 * presentation) has zero dependency on this file — it's only used for two
 * extras: the offline request queue, and lesson history. If you don't set
 * the NEXT_PUBLIC_FIREBASE_* env vars, every helper below degrades
 * gracefully (returns an empty list / no-ops) instead of throwing, EXCEPT
 * queuePendingLesson(), which throws a clearly-named error so the UI can
 * tell the teacher "no internet, and offline mode isn't set up" instead of
 * silently pretending the request was saved when it wasn't.
 *
 * When it IS configured, this file:
 * - Initializes a single Firebase App instance (safe across Next.js
 *   hot-reloads and repeated client-component re-renders).
 * - Silently signs in anonymously (Firebase Auth) on first use, giving
 *   each device/browser a stable uid with NO login screen — every pending
 *   request and saved lesson is tagged with this uid (`ownerId`), and
 *   firestore.rules uses it to keep one teacher's history private from
 *   another's, while still allowing shareable /lesson/[id] links to work
 *   for anyone (see that file's comments for the get-vs-list split that
 *   makes both of those true at once).
 *   REQUIRES: enable the "Anonymous" sign-in provider in Firebase Console
 *   → Authentication → Sign-in method. If you skip this, every Firestore
 *   write below will fail with a permission error.
 * - Configures Firestore with the persistent IndexedDB local cache, so
 *   reads/writes made while the device is offline are queued on-disk and
 *   automatically synced to the server the instant connectivity returns —
 *   no manual retry/sync code needed for the underlying data layer.
 * - Exposes small, typed helpers used by the rest of the app to:
 *     1. Queue a lesson request while offline ("pendingLessons" collection)
 *     2. Read back / clear pending requests once back online
 *     3. Persist completed lessons to a "lessons" history collection
 *
 * IMPORTANT: Firestore's offline cache relies on IndexedDB, which only
 * exists in the browser. Every exported helper below is safe to import
 * anywhere, but must only be CALLED from client components ("use client").
 *
 * Optional environment variables (add to .env.local to enable Firebase):
 *   NEXT_PUBLIC_FIREBASE_API_KEY=
 *   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
 *   NEXT_PUBLIC_FIREBASE_PROJECT_ID=
 *   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
 *   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
 *   NEXT_PUBLIC_FIREBASE_APP_ID=
 */

import { type FirebaseApp, getApp, getApps, initializeApp } from "firebase/app";
import { type Auth, type User, getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  type Firestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp,
  where,
} from "firebase/firestore";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Target age band for lesson complexity/vocabulary — tailors the Gemini prompt. */
export type AgeGroup = "5-7" | "8-10" | "11-12";

/** The structured shape returned by /api/generate-lesson and rendered by the UI. */
export interface LessonData {
  title: string;
  bible_verse: string;
  story_slides: string[];
  quiz_questions: string[];
  image_url: string | null;
  age_group: AgeGroup;
}

/** A lesson request waiting to be sent to the AI engine (saved while offline). */
export interface PendingLessonRequest {
  id: string;
  inputText: string;
  ageGroup: AgeGroup;
  createdAt: number; // epoch millis — usable for ordering even before the doc reaches the server
}

/** A completed lesson as stored in the "lessons" history collection. */
export interface SavedLesson extends LessonData {
  id: string;
  inputText: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Firebase app + Firestore (persistent offline cache) initialization
// ---------------------------------------------------------------------------

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True only if the minimum fields Firebase actually needs are present. */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

// Reuse the existing app instance across Next.js hot-reloads instead of
// throwing "Firebase App named '[DEFAULT]' already exists". Stays `null`
// when unconfigured, rather than calling initializeApp() with empty
// strings (which logs confusing Firebase SDK errors of its own).
export const app: FirebaseApp | null = isFirebaseConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

let _db: Firestore | null = null;

/**
 * Lazily creates (once) and returns the Firestore instance configured with
 * persistentLocalCache — the modern replacement for the deprecated
 * enableIndexedDbPersistence(), and the piece that makes the whole app work
 * offline. persistentMultipleTabManager lets several open browser tabs share
 * one on-device cache instead of fighting over a lock.
 */
function getDb(): Firestore {
  if (typeof window === "undefined") {
    throw new Error(
      "Firestore was accessed during server-side rendering. " +
        "lib/firebase.ts helpers must only be called from client components."
    );
  }
  if (!app) {
    throw new Error("FIREBASE_NOT_CONFIGURED");
  }
  if (!_db) {
    _db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  }
  return _db;
}

/** Safe accessor if a component ever needs the raw Firestore instance directly. */
export function getFirestoreInstance(): Firestore {
  return getDb();
}

// ---------------------------------------------------------------------------
// Anonymous auth — one stable uid per device/browser, no login screen
// ---------------------------------------------------------------------------

let _auth: Auth | null = null;
let _uidPromise: Promise<string> | null = null;

function getAuthInstance(): Auth {
  if (typeof window === "undefined") {
    throw new Error(
      "Firebase Auth was accessed during server-side rendering. " +
        "lib/firebase.ts helpers must only be called from client components."
    );
  }
  if (!app) throw new Error("FIREBASE_NOT_CONFIGURED");
  if (!_auth) _auth = getAuth(app);
  return _auth;
}

/**
 * Resolves to a stable per-device uid, signing in anonymously the first
 * time it's needed. Cached as a single shared promise so concurrent calls
 * (e.g. the dashboard's mount-time history fetch firing alongside a
 * connectivity-change queue drain) don't race and trigger two sign-ins.
 */
function getCurrentUid(): Promise<string> {
  if (_uidPromise) return _uidPromise;

  const auth = getAuthInstance();
  _uidPromise = new Promise<string>((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user: User | null) => {
        unsubscribe();
        if (user) {
          resolve(user.uid);
          return;
        }
        signInAnonymously(auth)
          .then((credential) => resolve(credential.user.uid))
          .catch((err) => {
            // Reset the cache so a later call can retry, instead of every
            // future call replaying this same rejected promise forever.
            _uidPromise = null;
            reject(err);
          });
      },
      (err) => {
        _uidPromise = null;
        reject(err);
      }
    );
  });

  return _uidPromise;
}

/**
 * Fire-and-forget warm-up: triggers anonymous sign-in as early as
 * possible (call this once at app mount — see ServiceWorkerRegister.tsx),
 * instead of waiting for the first time a teacher actually submits a
 * lesson. Narrows, but doesn't eliminate, a real edge case: signInAnonymously()
 * is a network call (unlike Firestore's offline-queued writes), so if a
 * device's FIRST EVER open of this app happens while fully offline — with
 * no previously persisted session to fall back on — the offline queue
 * itself can't be established yet. Any prior online visit persists the
 * session locally for good, so this only matters for a brand-new install
 * opened for the first time with zero connectivity.
 */
export function warmUpAuth(): void {
  if (!isFirebaseConfigured) return;
  getCurrentUid().catch(() => {
    // Swallowed deliberately — this is just a head start. The real error
    // (if connectivity never arrives before the teacher submits something)
    // surfaces naturally from queuePendingLesson()'s own await later.
  });
}

// ---------------------------------------------------------------------------
// Offline queue ("pendingLessons" collection)
// ---------------------------------------------------------------------------

const PENDING_COLLECTION = "pendingLessons";
const HISTORY_COLLECTION = "lessons";

/**
 * Saves a lesson request locally. Thanks to persistentLocalCache, this
 * write resolves instantly from the on-device cache — even with zero
 * connectivity — and Firestore transparently syncs it to the server once
 * the device reconnects. No manual retry logic required.
 *
 * Throws FIREBASE_NOT_CONFIGURED if Firebase isn't set up — there's no
 * honest way to "queue" an offline request without somewhere to persist
 * it, so this intentionally does NOT silently pretend to succeed.
 */
export async function queuePendingLesson(
  inputText: string,
  ageGroup: AgeGroup
): Promise<PendingLessonRequest> {
  if (!isFirebaseConfigured) {
    throw new Error("FIREBASE_NOT_CONFIGURED");
  }

  const firestore = getDb();
  const ownerId = await getCurrentUid();
  const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = Date.now();

  await setDoc(doc(firestore, PENDING_COLLECTION, id), {
    inputText,
    ageGroup,
    createdAt,
    serverCreatedAt: serverTimestamp(),
    status: "pending",
    ownerId,
  });

  return { id, inputText, ageGroup, createdAt };
}

/** Fetches all currently pending (not-yet-processed) lesson requests for THIS device, oldest first. */
export async function getPendingLessons(): Promise<PendingLessonRequest[]> {
  if (!isFirebaseConfigured) return [];

  const firestore = getDb();
  const ownerId = await getCurrentUid();
  const q = query(
    collection(firestore, PENDING_COLLECTION),
    where("ownerId", "==", ownerId),
    orderBy("createdAt", "asc")
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    // ageGroup defaults to "8-10" for any request queued before this field
    // existed (pre-v1.11), so an old in-flight request from an app update
    // doesn't crash instead of just using a sensible default.
    const data = d.data() as { inputText: string; ageGroup?: AgeGroup; createdAt: number };
    return {
      id: d.id,
      inputText: data.inputText,
      ageGroup: data.ageGroup ?? "8-10",
      createdAt: data.createdAt,
    };
  });
}

/** Removes a request from the pending queue once it has been successfully processed. */
export async function removePendingLesson(id: string): Promise<void> {
  if (!isFirebaseConfigured) return;

  const firestore = getDb();
  await deleteDoc(doc(firestore, PENDING_COLLECTION, id));
}

// ---------------------------------------------------------------------------
// Lesson history ("lessons" collection)
// ---------------------------------------------------------------------------

/**
 * Persists a completed lesson so the teacher can revisit it later (also
 * works offline). Silently skips (rather than throwing) when Firebase
 * isn't configured — losing history is a much smaller deal than losing
 * the lesson the teacher is looking at right now, so this never blocks
 * the main flow in app/page.tsx.
 */
export async function saveLessonToHistory(
  inputText: string,
  lesson: LessonData
): Promise<SavedLesson> {
  const id = `lesson_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = Date.now();

  if (!isFirebaseConfigured) {
    // Return the same shape the caller expects, just never persisted.
    return { id, inputText, createdAt, ...lesson };
  }

  const firestore = getDb();
  const ownerId = await getCurrentUid();
  await setDoc(doc(firestore, HISTORY_COLLECTION, id), {
    ...lesson,
    inputText,
    createdAt,
    serverCreatedAt: serverTimestamp(),
    ownerId,
  });

  return { id, inputText, createdAt, ...lesson };
}

/** Retrieves THIS device's saved lessons, most recent first. */
export async function getLessonHistory(limitCount = 20): Promise<SavedLesson[]> {
  if (!isFirebaseConfigured) return [];

  const firestore = getDb();
  const ownerId = await getCurrentUid();
  const q = query(
    collection(firestore, HISTORY_COLLECTION),
    where("ownerId", "==", ownerId),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.slice(0, limitCount).map((d) => {
    const data = d.data() as LessonData & { inputText: string; createdAt: number };
    return { id: d.id, ...data };
  });
}

/**
 * Fetches a single lesson by ID — powers the shareable /lesson/[id] route.
 * Deliberately NOT owner-scoped: anyone with the link should be able to
 * view that one specific lesson, regardless of who created it.
 * firestore.rules enforces this exact distinction (open `get`, owner-only
 * `list`) — see that file's comments. Returns null both when Firebase
 * isn't configured and when the document genuinely doesn't exist, so the
 * page can show one honest "not available" state either way without
 * distinguishing the two to the visitor.
 */
export async function getLessonById(id: string): Promise<SavedLesson | null> {
  if (!isFirebaseConfigured) return null;

  const firestore = getDb();
  const snapshot = await getDoc(doc(firestore, HISTORY_COLLECTION, id));
  if (!snapshot.exists()) return null;

  const data = snapshot.data() as LessonData & { inputText: string; createdAt: number };
  return { id: snapshot.id, ...data };
}

/** Converts a Firestore Timestamp (or epoch millis) into a Sinhala-locale date string. */
export function formatLessonDate(value: Timestamp | number): string {
  const millis = typeof value === "number" ? value : value.toMillis();
  return new Date(millis).toLocaleDateString("si-LK", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
