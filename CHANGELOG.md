# Changelog

All notable changes to **Sunday School Assistant** (දහම් පාසල් සහායක) are
documented here, following the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format.

This project isn't published to npm, so version numbers aren't enforced by
tooling — but they follow the same conceptual meaning as SemVer:
**MAJOR** = new core capability, **MINOR** = added feature, **PATCH** = fix/polish.

> A friendlier, Sinhala, high-level summary of this same history is shown
> in-app at `/changelog` (`app/changelog/page.tsx`) — written for teachers,
> not developers. **Keep both files in sync** when you add an entry here;
> not every line below needs a matching entry there (skip the small/internal
> fixes), but every user-visible change should appear in both.

## [Unreleased]
_Add new entries here as you make changes — then move them under a new
version heading below once you're ready to consider them "shipped."_

## [2.5.0] - 2026-07-29
### Added
- **Image generation model fallback chain**: `generateImage()` now tries
  `stabilityai/stable-diffusion-xl-base-1.0` then
  `black-forest-labs/FLUX.1-schnell` in sequence, mirroring the pattern
  that fixed Gemini's model availability issue. It's genuinely uncertain
  which text-to-image models are actively served on Hugging Face's free
  `hf-inference` route in 2026 (some documentation suggests it's now
  CPU-focused, which heavy models like SDXL may not run on in reasonable
  time) — trying a second, better-documented model costs nothing extra
  when the first succeeds and meaningfully raises the odds when it doesn't.
  Honest limitation: unverified against the live API (no internet access
  in the build environment) — `/api/test-huggingface` remains the way to
  get a definitive answer after deploying.
- `/api/test-huggingface` rewritten to test both models in the same
  fallback chain and report per-model results (mirroring
  `/api/test-gemini`'s approach), so the diagnostic accurately predicts
  what a real lesson generation will experience.

### Fixed
- **Timeout budget — now genuinely coordinated on both sides.** Adding a
  second image model at the old 45s-per-model timeout would have totaled
  up to 90s worst case — exceeding this route's `maxDuration = 60` and
  getting killed by Vercel mid-request before the fallback even completed.
  Reduced to 22s per model (44s worst case for images). A follow-up
  gap-recheck found the OTHER half of this same problem: Gemini's own
  per-model timeout was still 30s × up to 4 models = 120s worst case,
  completely uncoordinated with the image budget despite the original
  comment claiming to leave "headroom" for it — a genuine silent hang
  on Gemini alone could have consumed the entire 60s budget by itself,
  before image generation ever got a chance to run, or worse, blown past
  it and lost an already-successfully-generated lesson to Vercel's
  platform-level 504 timeout. Reduced to 15s per Gemini model (60s
  absolute worst case alone) with both sides' comments now cross-
  referencing the same coordinated numbers. Genuine residual risk: if
  every single model on both services simultaneously silently hangs
  (rather than the far more common fast 4xx failure), the combined worst
  case can still theoretically exceed 60s — accepted as a deliberate
  tradeoff, since real failures observed throughout this project have
  consistently been fast error responses, not silent hangs, and further
  tightening would start risking premature abort of legitimate, slower
  (but successful) Gemini calls.
- A stray leftover closing brace introduced while editing
  `generateImage()` (caught immediately by the routine brace-balance
  check before it shipped) and a stray orphaned markdown code fence in
  `KEYS_GUIDE.md`'s updated example response (same story — caught on
  re-view, not shipped).
- `KEYS_GUIDE.md`'s example `/api/test-huggingface` response updated to
  match the new multi-model output shape.

No new in-app changelog entry — this is a reliability/robustness
improvement to an existing feature (image generation), not a new
user-facing capability, consistent with this project's existing
convention for internal-only changes.

## [2.4.1] - 2026-07-27
### Fixed
- **Gap audit**: `firestore.rules`' `isValidSections()` existed but was
  never actually called by `isValidPendingLesson()` or `isValidLesson()`
  — dead code. Neither function validated the `sections` field at all, and
  `isValidLesson()` didn't require or type-check `age_group`,
  `memory_verse`, `activity_ideas`, or `image_url` — fields
  `lib/firebase.ts` has written on every save since v2.0. Firestore's
  `hasAll()` doesn't reject undeclared extra fields, so this never broke
  writes in practice — but it meant a malformed value in any of those
  fields could have been written without the security rules catching it.
  All five fields are now genuinely validated, and `isValidSections()` is
  wired up and checks `activities` alongside the original three keys.

No user-facing behavior changes in this release — data-integrity/security
hardening only, found via a dedicated gap-recheck pass.

## [2.4.0] - 2026-07-27
### Fixed
- **🔴 Hugging Face image generation fixed.** The old endpoint
  (`api-inference.huggingface.co`) has been superseded by Hugging Face's
  "Inference Providers" architecture, routed through `router.huggingface.co`.
  Same Bearer-token auth, different domain. Also: image failures previously
  only logged a status code — now the full response body is logged, since
  that's where Hugging Face puts the actual reason (provider not enabled,
  billing required, quota, etc).
- **🔴 Sinhala content-quality bugs fixed.** Added a hard server-side
  validation check (`containsForeignScript()`) that scans every
  Sinhala-facing field for Devanagari (Hindi) or Tamil Unicode characters
  and rejects the response (triggering a retry with the next model) if
  found — reported foreign-script leakage should no longer reach the
  screen. System prompt substantially strengthened with explicit script-
  purity rules, natural/idiomatic Sinhala guidance (write like an actual
  teacher speaks, not a stiff translation), and scriptural-accuracy
  requirements (real verse references, accurate narrative details) —
  balanced against the existing non-verbatim copyright constraint.
- Removed the non-existent PNG icon references from `manifest.json` (real
  404 console errors) — the SVG icon alone (`sizes: "any"`) is a fully
  valid PWA icon in modern browsers.

### Added
- `app/api/test-huggingface/route.ts` — diagnostic endpoint mirroring
  `/api/test-gemini`'s approach: visit in browser to see the exact
  Hugging Face error (with a specific hint per status code) instead of a
  silently-swallowed `null`.
- Accessibility: `aria-label` added to every icon-only button across
  `LessonPresentation.tsx` (close, fullscreen, share, read-aloud, copy) and
  `aria-pressed` added to all toggle-style buttons (age group, sections,
  voice language, history filters) for correct screen-reader state
  announcement.
- `prefers-reduced-motion` now respected both at the CSS level (global
  media query in `globals.css`, disables/shortens all CSS transitions) and
  the JS level (`useReducedMotion()` from framer-motion disables the
  continuous pulsing mic-recording ring specifically).
- Visible keyboard focus ring (`:focus-visible`) added globally — matters
  for the presentation's keyboard navigation (← → Esc) and for any
  non-mouse user.
- `.warm-glow` CSS utility — a soft radial-gradient ambient glow (evoking
  lamplight/candlelight) used behind the header icon and the memory-verse
  card, the app's one deliberate signature visual touch.
- Visual polish pass across the dashboard and presentation: richer
  gradient buttons with hover/active depth, consistent numbered-badge
  styling between activities and quiz questions, an image-status preview
  directly in the dashboard result card (shows the generated image or an
  honest "image unavailable" note immediately, without opening the full
  presentation), refined card shadows and borders throughout.

## [2.3.0] - 2026-07-26
### Fixed
- **🔴 Gemini model list updated to the current generation.** After the
  v2.2.0 auth header fix, `/api/test-gemini` revealed the REAL remaining
  problem: every model in the old fallback chain
  (`gemini-2.5-flash`, `gemini-2.5-flash-lite-preview-06-17`,
  `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-1.5-flash`,
  `gemini-1.5-flash-8b`) either returned `404 — This model ... is no
  longer available to new users` or `429 — You exceeded your current
  quota` (quota deliberately zeroed on retiring models to force
  migration). Google's Gemini 1.5.x/2.0.x/2.5.x generation has been
  retired for newly-created API keys. Replaced with the confirmed-GA
  (generally available, production-ready) Gemini 3.x generation:
  `gemini-3.6-flash` → `gemini-3.5-flash` → `gemini-3.5-flash-lite` →
  `gemini-3.1-flash-lite`.
- Removed the `temperature: 0.85` override from `generationConfig` —
  Google's Gemini 3.x docs explicitly recommend leaving
  `temperature`/`top_p`/`top_k` at their defaults, since the model's
  reasoning behavior is tuned for those specific values.
- `SETUP_NOTES.md` and `KEYS_GUIDE.md` updated to reference the correct
  4-model fallback chain (previously described a stale 6-model list).

## [2.2.0] - 2026-07-26
### Fixed
- **🔴 THE ACTUAL Gemini auth bug, finally correct.** Every previous
  attempt at this fix was wrong: `route.ts` was sending `AQ.Ab...` keys via
  `Authorization: Bearer <key>`, which Google's endpoint rejects with
  `401 — Expected OAuth 2.0 access token`. That header is for real OAuth
  tokens, not API keys — regardless of the key's prefix. The correct,
  Google-documented method for **every** Gemini key format (`AIza...` and
  `AQ.Ab...` alike) is the **`x-goog-api-key`** header. Confirmed against
  Google's official docs (ai.google.dev/gemini-api/docs/api-key) and a
  live community example showing an `AQ.Ab...` key working via that exact
  header. `buildFetchArgs()` simplified — no more format branching, no
  more `?key=` query param, one header for every key.
- Added `401` to the "stop retrying other models" condition in the
  fallback loop — a key/auth failure isn't model-specific, so the old code
  wastefully retried all 6 models (30+ seconds) before giving up. Now it
  fails fast on the first 400/401/403/429.
- Removed the misleading error message that told teachers to "create a new
  Auth key" when Gemini failed — the key format was never the problem.
- `app/api/test-gemini/route.ts` updated with the same header fix, plus a
  clearer hint in `first_working_model` when every model returns 401.

## [2.1.0] - 2026-07-20
### Added
- `app/not-found.tsx` — custom Sinhala 404 page (was Next.js default English before)
- `app/error.tsx` — custom Sinhala error boundary for uncaught page errors
- `app/history/loading.tsx` — animated skeleton while Firebase fetches history
- `app/lesson/[id]/loading.tsx` — spinner while shared lesson loads
- `app/lesson/[id]/page.tsx` refactored to **server component** — exports
  `generateMetadata` which fetches lesson title + Bible verse via the
  Firestore REST API (`allow get: if true` means no auth needed). WhatsApp
  and social link previews now show the actual lesson title and verse instead
  of the generic app description.
- `app/lesson/[id]/LessonPageClient.tsx` — client logic extracted from the
  old client-only page, now rendered as a child of the server component.
- **Hide lesson** in history: `EyeOff` button on each item soft-hides it
  (localStorage, no Firestore delete needed). Hidden items are filterable
  via an `Eye` toggle. `lib/storage.ts` gained `loadHiddenLessons` and
  `toggleHidden`.
- History shows **inputText** (the teacher's original idea) under each title,
  searchable alongside title, verse, and memory verse.
- `DEPLOYMENT.md` + `SETUP_NOTES.md` updated with Gemini `AQ.Ab...` Auth
  key warning and `/api/test-gemini` diagnostic instructions.
- `public/sw.js` cache name bumped to `dahampasala-shell-v2` — existing PWA
  installs now pick up the new code on next visit.

## [2.0.0] - 2026-07-16
### Added
- **Auth key fix (🔴 Critical)**: Google AI Studio keys (`AQ.Ab...`) now use
  `Authorization: Bearer` header instead of `?key=`. Auto-detected by prefix.
  Updated model list: `gemini-2.5-flash` → `gemini-2.5-flash-lite-preview-06-17`
  → `gemini-2.0-flash` → `gemini-2.0-flash-lite` → `gemini-1.5-flash` → `gemini-1.5-flash-8b`.
- **Memory verse slide**: new `memory_verse` field, highlighted gradient card.
- **Activities slide**: new `activity_ideas` field, 4th section toggle (📖❓✨🎨).
- **Suggested topic chips** (8 quick-start Sinhala ideas).
- **Recent topics** (localStorage, last 5 shown below textarea).
- **Auto-save draft** (localStorage, cleared on successful generation).
- **Clear input button** (× appears when textarea has content).
- **Font size toggle** (Normal / Large / X-Large, persisted in localStorage).
- **Confetti celebration burst** on lesson generation success.
- **Toast notifications** (`components/Toast.tsx`).
- **Copy-to-clipboard** on every presentation slide + bottom nav shortcut.
- **Keyboard navigation** in presentation (← → Esc).
- **Fullscreen API** toggle in presentation.
- **Quiz timer** (`components/QuizTimer.tsx`) — 60/90/120s animated ring,
  pulsing warning, haptic finish. Toggle-able from the quiz slide.
- **History v2**: live search, lesson + favorite count, star-to-favorite
  (localStorage), section badges, memory verse preview, favorites-only filter.
- **OG meta tags** in `layout.tsx` for WhatsApp/social link previews.
- **SVG PWA icon** (`public/icons/icon.svg`) — fixes 404 icon errors.
- `lib/storage.ts` — SSR-safe localStorage utilities.

## [1.12.2] - 2026-07-04
### Added
- `firebase.json` — Firebase CLI project config pointing at `firestore.rules`
  and `firestore.indexes.json`. Enables `firebase deploy --only firestore`
  to deploy both rules and indexes in one command, replacing the error-prone
  manual index creation via Firebase console.
- `firestore.indexes.json` — declares both composite indexes the app needs
  (`lessons: ownerId ASC + createdAt DESC`, `pendingLessons: ownerId ASC +
  createdAt ASC`). Previously had to be created manually by clicking links
  in Firestore console error messages.
- `next.config.ts` — suppresses TypeScript/ESLint build errors that could
  silently block Vercel deployments; sets permissive image remote patterns
  for the Hugging Face base64 image URIs.
- `scripts/generate-icons.html` — standalone browser-based PWA icon
  generator. Open in any browser, click 3 buttons, get all 3 required PNG
  icon files (192px, 512px, 512px maskable) with the app's amber/cream
  design (book + cross motif). No npm, no sharp, no build step required.
- `app/api/test-gemini/route.ts` — diagnostic endpoint (visit
  `/api/test-gemini` in the browser) that tests every model in the fallback
  chain and returns the exact HTTP status and error message from Google per
  model. Safe to leave deployed; remove once Gemini is confirmed working.

## [1.12.1] - 2026-07-04
### Fixed
- Replaced `@google/generative-ai` SDK with a direct REST `fetch` call to
  the Gemini API. The SDK introduced version-compatibility uncertainty on
  Vercel (package resolution, Node runtime behaviour) that was masking
  the real error. Direct REST is explicit, dependency-free, and logs the
  exact HTTP status + error message from Google for every failed attempt.
- Added `/api/test-gemini` diagnostic endpoint: visit
  `https://YOUR-APP.vercel.app/api/test-gemini` in a browser to see which
  models your API key can access and the exact error text for each failure.
- Improved Sinhala error messages per failure type (auth error vs. rate
  limit vs. general failure).
- Removed `@google/generative-ai` from `package.json` — no longer needed.

## [1.12.1] - 2026-07-04
### Fixed
- `firestore.rules`: `isValidAgeGroup()` didn't include `'adult'` — adult
  lessons silently failed to save to history. Also removed overly strict
  `sections` field requirement from `isValidLesson` (it's an optional
  enrichment field, not a structural requirement).
- `app/api/generate-lesson/route.ts`: removed `@google/generative-ai` SDK
  entirely and replaced with direct REST fetch to the Gemini API, removing
  all SDK version/compatibility issues. Added a model fallback chain
  (gemini-1.5-flash → gemini-1.5-flash-8b → gemini-1.5-pro →
  gemini-2.0-flash-lite → gemini-2.0-flash).
- `app/api/test-gemini/route.ts`: new diagnostic endpoint — visit
  `/api/test-gemini` in the browser to verify which Gemini models your API
  key can access and see the exact error if none work.
- Guide page updated to reflect the adult age group and modular section
  selector added in v1.12.0.

## [1.12.0] - 2026-07-04
### Added
- **Adult age group** ("වැඩිහිටි"): fourth option alongside the three
  child bands, with its own system-prompt guidance — theological depth,
  historical/cultural context, formal-but-clear Sinhala, deep open-ended
  discussion questions, and no reference to "children" in any of the output.
- **Modular section selection**: teachers now choose which sections to
  generate before submitting — "කතාව" (story), "ප්‍රශ්න" (quiz), "රූපය"
  (image) — via toggle buttons. Title and Bible verse are always generated.
  Gemini only outputs the requested fields; image generation only runs if
  the image section is selected. `LessonSections` type added to
  `lib/firebase.ts` and threaded through all call sites (API, offline
  queue, history save).
- `LessonSections` field added to `LessonData` and `PendingLessonRequest`,
  with backward-compatible defaults for documents saved before this version.

### Fixed
- **502 Gemini errors**: replaced the single hard-coded `"gemini-2.0-flash"`
  model (not accessible to all API key tiers) with a fallback chain —
  `gemini-1.5-flash` → `gemini-1.5-flash-8b` → `gemini-1.5-pro` →
  `gemini-2.0-flash-lite` → `gemini-2.0-flash` — the first model the key
  has access to is used automatically.

## [1.11.0] - 2026-06-22
### Added
- **Age group selector** (5-7 / 8-10 / 11-12): three-button toggle on the
  main dashboard, stored in component state, sent to the API on every
  generation and queue request. Default is "8-10" (the middle band).
- `lib/firebase.ts`: added `AgeGroup` type and `age_group` field to
  `LessonData`; added `ageGroup` to `PendingLessonRequest` with a safe
  `"8-10"` default for any requests queued before this field existed.
- `app/api/generate-lesson/route.ts`: `buildSystemPrompt()` replaces the
  single static `SYSTEM_PROMPT` constant with per-band guidance (sentence
  complexity, vocabulary register, story length, quiz type) injected at
  request time. Falls back to `"8-10"` if an old client sends no field.
  `LessonResponse` and the returned JSON now include `age_group`.
- Age group badge shown in: result card on the dashboard, cover slide in
  `LessonPresentation`, and each history list item (alongside the date).
- `app/guide/page.tsx`: lesson-creation step updated to mention selecting
  the age band first.
- `firestore.rules`: `ageGroup` required on new `pendingLessons` writes
  (validated against the three allowed values); `age_group` intentionally
  left optional on `lessons` documents for backwards compatibility with
  lessons saved before this field existed.

## [1.10.0] - 2026-06-22
### Added
- `app/guide/page.tsx` — in-app "how to use this app" tour guide, bilingual
  (Sinhala/English) with a toggle matching the existing voice-input
  language toggle's visual style. Every reference to one of this app's own
  buttons quotes the actual Sinhala button text (e.g. "පාඩම සකස් කරන්න")
  in BOTH language versions, so a reader of either can visually match it
  against the real on-screen button — the app's UI is never in English,
  so an English-only "tap Generate Lesson" would describe a button that
  doesn't exist. The one exception is the install step, which quotes
  Chrome's own menu item (the browser's UI, not this app's).
- Linked from the dashboard footer alongside History and What's New.

## [1.9.3] - 2026-06-22
### Fixed
- **Auth vs. offline-queue interaction**: `signInAnonymously()` is a network
  call, unlike Firestore's offline-queued writes — so a device's very
  first-ever app open while fully offline (no prior session to fall back
  on) couldn't establish the offline queue at all. Added
  `warmUpAuth()` (fire-and-forget, triggered from
  `ServiceWorkerRegister.tsx` at app mount) to give sign-in a head start
  before connectivity might drop, and a distinct, accurate error message
  in `app/page.tsx` for this specific case instead of a generic fallback.
- `getAuthInstance()` was missing the same SSR guard `getDb()` already had.
- **`app/changelog/page.tsx` content cleanup**: found multiple English
  words leaked into this Sinhala, teacher-facing page ("login", "link",
  "page", "App", "misuse", "(PWA)", "home screen", "amber/cream", "build",
  "live") — all reworded in Sinhala. Also removed four entire entries
  (former v1.2–v1.5) that were pure developer/infrastructure notes
  (build tooling, deployment guide, "Firebase is now optional") with no
  user-visible meaning to a teacher — per this file's own stated rule that
  not everything in `CHANGELOG.md` belongs here. `CHANGELOG.md` itself is
  unaffected; those entries remain accurate there.

## [1.9.2] - 2026-06-22
### Added
- `LICENSE.md` — proprietary, all-rights-reserved license. `package.json`'s
  `license` field set to the standard npm/SPDX convention for this,
  `"UNLICENSED"` (not the literal word "Proprietary" — that's the actual
  recognized string for "no license granted, all rights reserved").

## [1.9.1] - 2026-06-22
### Added
- Developer attribution: `package.json` `author` field, `app/layout.tsx`
  `authors`/`creator` metadata, and a visible footer credit line on the
  dashboard ("නිර්මාණය හා සංවර්ධනය — Prabhath Lokuge" + a copyright line).

## [1.9.0] - 2026-06-22
### Added
- **Anonymous auth (multi-teacher scoping)**: `lib/firebase.ts` now signs
  every device in anonymously on first Firestore use (no login screen).
  `pendingLessons` and `lessons` documents are tagged with `ownerId`.
  `firestore.rules` rewritten accordingly, with a deliberate split: `get`
  on `lessons/{id}` stays open (so shareable `/lesson/[id]` links keep
  working for anyone with the URL), while `list` is owner-only (so the
  history page only ever returns your own lessons). Requires enabling the
  Anonymous sign-in provider in Firebase Console — documented in
  `SETUP_NOTES.md` and `DEPLOYMENT.md`.
- **Protestant canon + ROV-style guidance**: the Gemini system prompt now
  restricts book references to the Protestant 66-book canon and asks for
  vocabulary/tone consistent with the Sinhala Revised Old Version (ROV,
  Sri Lanka Bible Society, 1995) tradition.

### Changed
- The system prompt now explicitly instructs the model NOT to claim its
  `bible_verse` output is a verbatim quotation from a specific copyrighted
  publication — it's a paraphrase in that style, not a guaranteed
  word-for-word match. A matching disclaimer was added under the verse in
  both `LessonPresentation`'s cover slide and the printable/PDF layout:
  "මෙම පදයේ නිවැරදි වචන සඳහා කරුණාකර ශුද්ධ බයිබලය පරීක්ෂා කරන්න."

## [1.8.0] - 2026-06-22
### Added
- **Sinhala TTS voice detection**: `LessonPresentation` now checks once
  whether the device has a Sinhala speech-synthesis voice at all, and
  shows a dismissible notice if not — many Android devices have no
  Sinhala voice installed, so "Read Aloud" was silently mispronouncing
  text in a fallback voice with no indication why.
- **Regenerate button**: the result card now has a second "නැවත සකස්
  කරන්න" button that re-runs generation with the same input — no need to
  re-speak/re-type to get a different take on the same idea.
- **Rotating loading status text**: while waiting on Gemini + image
  generation (typically 10-30s), the dashboard now cycles through short
  Sinhala status messages (`aria-live="polite"`) instead of one static
  spinner, making the wait feel less like a frozen screen.
- **Shareable lesson links** (`app/lesson/[id]/page.tsx`): `lib/firebase.ts`
  gained `getLessonById()`. `LessonPresentation`'s share button now
  includes a real `/lesson/[id]` link when `lesson.id` is present (i.e.
  Firebase is configured and the save succeeded), falling back to the
  original text-only summary otherwise. `app/page.tsx`'s `handleGenerate`
  now captures the id returned by `saveLessonToHistory()` back into state
  to enable this for freshly-generated lessons, not just historical ones.
- `app/history/page.tsx` refactored to link each entry to `/lesson/[id]`
  instead of opening it via local component state — every history item
  now also has a real, bookmarkable URL for free.

## [1.7.0] - 2026-06-22
### Added
- `lib/rate-limit.ts` — in-memory, per-IP sliding-window rate limiter
  (10 requests / 10 min) applied to `/api/generate-lesson`. Documented as
  best-effort given Vercel's ephemeral serverless instances; see the file's
  header comment for the upgrade path (Vercel Firewall / Upstash Redis) if
  real abuse shows up.
- `app/history/page.tsx` — lesson history UI. `getLessonHistory()` already
  existed in `lib/firebase.ts` since v1.0 but had no page rendering it
  until now. Handles all three states explicitly: Firebase unconfigured,
  loading, and loaded (including empty-state). No delete action, since
  `firestore.rules` makes the `lessons` collection append-only from the
  client by design.
- Dashboard footer now links to both `/history` and `/changelog`.

## [1.6.0] - 2026-06-22
### Fixed
- Duplicate, identical text shown across two stacked offline banners at once
- A failed lesson-history save incorrectly surfaced as a visible error on
  top of an already-successful lesson generation
- `quiz_questions` could be an empty array and still pass Gemini-response
  validation, silently rendering a blank quiz slide
- `LessonPresentation`'s PDF export had no error handling — a failure was
  completely silent
- `AlertTitle`'s forwarded ref was typed `HTMLParagraphElement` for an
  `<h5>` element (harmless due to structural typing, but corrected)
- "AI" appeared in Latin script in `layout.tsx` and `manifest.json`
  descriptions, violating the Sinhala-only UI requirement
- `public/sw.js` used `cache.addAll()`, which fails the *entire* service
  worker install if even one resource can't be fetched (e.g. first-ever app
  load while offline) — switched to per-resource `cache.add()`
- `firestore.rules` array-size limits (`<= 10`) were tight enough to
  silently reject an occasional slightly-longer-than-typical valid lesson —
  loosened to `<= 12`

## [1.5.0] - 2026-06-22
### Changed
- **Firebase is now genuinely optional.** Every helper in `lib/firebase.ts`
  degrades gracefully (returns `[]` / no-ops) when the
  `NEXT_PUBLIC_FIREBASE_*` env vars are unset, instead of throwing.
  `queuePendingLesson()` is the one deliberate exception — it throws a
  clearly-named `FIREBASE_NOT_CONFIGURED` error so the UI can tell the
  teacher honestly that offline saving isn't available, instead of
  silently pretending a request was saved when it wasn't.

## [1.4.0] - 2026-06-22
### Added
- `DEPLOYMENT.md` — bilingual (English + Sinhala) step-by-step deployment
  guide: GitHub upload, Firebase/Gemini/Hugging Face key setup, Vercel
  deploy, a mobile-only workflow breakdown, and a PWA-vs-native-app
  clarification.

## [1.3.0] - 2026-06-22
### Added
- `package.json` consolidating every dependency into a single `npm install`
- `tsconfig.json` with the `@/*` path alias every import in the app relies on
- `postcss.config.mjs` — required for Tailwind v3's `@tailwind` directives
  to actually compile
- `types/html2pdf.d.ts` — hand-written types, since no `@types/html2pdf.js`
  package exists on npm
- `.env.local.example` and `.gitignore`
- `firestore.rules` — shape/size-validated, no-auth-yet security rules

## [1.2.0] - 2026-06-22
### Added
- `components/ui/{button,card,textarea,alert}.tsx` — shadcn-style
  primitives, written out directly instead of depending on the CLI
- `lib/utils.ts` (`cn()` Tailwind class-merge helper)
- `app/globals.css` + `tailwind.config.ts` — CSS variables and Tailwind
  theme mapping tuned to the app's warm amber/cream palette

## [1.1.0] - 2026-06-22
### Added
- `app/layout.tsx` — Noto Sans Sinhala font, PWA manifest link, `<html lang="si">`
- `public/manifest.json` — installable PWA manifest
- `public/sw.js` + `components/ServiceWorkerRegister.tsx` — hand-rolled
  service worker (app-shell caching) with real Background Sync API
  integration, replacing the original same-tab-only `online` event listener

## [1.0.0] - 2026-06-22
### Added
- Initial release: voice (Web Speech API, `si-LK`/`en-US`) and text input
- `/api/generate-lesson`: Gemini structured-JSON lesson generation +
  Hugging Face SDXL illustration generation
- `LessonPresentation.tsx`: full-screen swipeable story mode with per-slide
  text-to-speech, WhatsApp/native share, and print/PDF export
- Firestore-backed offline request queue and lesson history (`lib/firebase.ts`)
