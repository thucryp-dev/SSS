# Sunday School Assistant — Setup Notes

> **Firebase is optional.** The core feature — voice/text → Gemini →
> image → presentation — has no Firebase dependency at all. Leave the
> `NEXT_PUBLIC_FIREBASE_*` env vars blank and the app still works fully
> online; you just lose the offline request queue and lesson history
> (every `lib/firebase.ts` helper degrades gracefully instead of
> throwing). Add Firebase later, any time, with zero code changes.

## Quick start

```bash
npm install
cp .env.local.example .env.local   # then fill in real values
npm run dev
```

`package.json` already lists every dependency this project needs, so a
plain `npm install` is enough — no separate install commands required.

## 1. Fill in `.env.local`

Copied from `.env.local.example`:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
GEMINI_API_KEY=
HUGGINGFACE_API_KEY=
```

The `NEXT_PUBLIC_*` Firebase values are safe to expose in the browser
bundle by design. `GEMINI_API_KEY` and `HUGGINGFACE_API_KEY` are server-only
(no prefix) and are only ever read inside `app/api/generate-lesson/route.ts`.

## 2. Firestore + Auth

In the Firebase console, create the Firestore database in **Native mode**.
Then **enable Anonymous sign-in**: Authentication → Sign-in method →
Anonymous → Enable. This is required as of v1.9 — every Firestore write
now requires `request.auth != null`, and `lib/firebase.ts` signs each
device in anonymously on first use (no login screen, no user-visible
change). Skipping this step makes every save fail with a permission error.

Then deploy the included `firestore.rules`
(`firebase deploy --only firestore:rules`, or paste it into the console's
Rules tab). It scopes lesson history and the offline queue to each
device's anonymous uid, while deliberately keeping single-lesson reads
open so shareable `/lesson/[id]` links still work for anyone with the URL
— see the comment at the top of that file for why `get` and `list` are
split that way.

## 3. File manifest

| File | Purpose |
|---|---|
| `lib/firebase.ts` | Firebase init + offline-persistent Firestore + queue/history helpers |
| `app/api/generate-lesson/route.ts` | Gemini lesson generation + Hugging Face SDXL image |
| `app/page.tsx` | Main dashboard: voice/text input, offline queueing, Background Sync trigger |
| `components/LessonPresentation.tsx` | Swipeable story mode: TTS, share, print/PDF, quiz |
| `app/layout.tsx` | Root layout: Sinhala font, manifest link, mounts the SW registrar |
| `components/ServiceWorkerRegister.tsx` | Registers `public/sw.js` once |
| `public/sw.js` | App-shell caching + Background Sync wake-up (hand-rolled, no `next-pwa`) |
| `public/manifest.json` | PWA manifest (Sinhala name, amber/cream theme colors) |
| `components/ui/*.tsx` | shadcn-style Button/Card/Textarea/Alert primitives |
| `lib/utils.ts` | `cn()` class-merge helper used by the primitives above |
| `app/globals.css` | Tailwind directives + CSS variables tuned to the amber/cream theme |
| `tailwind.config.ts` | Maps those CSS variables into Tailwind's color theme (Tailwind v3) |
| `postcss.config.mjs` | Required for Tailwind v3's `@tailwind` directives to compile |
| `tsconfig.json` | Standard Next.js config — note the `"@/*": ["./*"]` path alias every file's imports rely on |
| `types/html2pdf.d.ts` | Hand-written types for html2pdf.js (it ships none, and there is no `@types/html2pdf.js` package — don't try to install one, it doesn't exist) |
| `firestore.rules` | Shape/size-validated, no-auth-yet security rules |
| `package.json` | All dependencies, pinned to versions current as of early 2026 |
| `LICENSE.md` | Proprietary, all-rights-reserved license |
| `CHANGELOG.md` | Developer-facing version history (Keep a Changelog format) |
| `app/changelog/page.tsx` | User-facing Sinhala "what's new" page, linked from the dashboard footer |
| `lib/rate-limit.ts` | Best-effort in-memory rate limiter for the API route |
| `app/history/page.tsx` | Lesson history list, linking to `/lesson/[id]` |
| `app/lesson/[id]/page.tsx` | Shareable single-lesson view (real URL, reuses LessonPresentation) |
| `app/guide/page.tsx` | Bilingual (Sinhala/English) in-app "how to use this app" tour |

## 4. Things you still need to do yourself

- **Icons**: `public/manifest.json` references `public/icons/icon-192.png`,
  `icon-512.png`, and `icon-512-maskable.png`. These need to be real PNG
  files — generate or design them and drop them in; nothing in this repo
  creates binary image assets.
- **Gemini model name**: `app/api/generate-lesson/route.ts` uses
  `"gemini-2.0-flash"`. Confirm the current model name your API key can
  access in Google AI Studio and swap it in if needed.
- **Hugging Face cold starts**: the first SDXL request after idle time can
  take 20–30s while the model loads. The route already sets
  `wait_for_model: true` and a 45s timeout; consider a periodic warm-up
  ping if that matters for your users.
- **Tailwind v4**: if you scaffold a fresh project and it comes with
  Tailwind v4 (CSS-first config, no `tailwind.config.ts` by default)
  instead of the v3 setup assumed here, drop `tailwind.config.ts` and
  `postcss.config.mjs`, install `tailwindcss` v4 + `@tailwindcss/postcss`
  instead, and move the color variables from `tailwind.config.ts` into an
  `@theme inline` block in `app/globals.css`.
- **Auth**: as of v1.9, every device is signed in anonymously (no login
  screen) and lesson history/offline queue are scoped per-device via
  `ownerId`. This means history doesn't follow a teacher across devices —
  if that matters for your use case, you'd need real email/password (or
  Google) sign-in instead, which is a bigger change (login UI, "claim my
  history" merge logic, etc.) than anonymous auth was.
- **Rate limiting**: `/api/generate-lesson` is protected by an in-memory
  per-IP limiter (10 requests / 10 min), which is best-effort only — it
  resets whenever Vercel cold-starts the function and isn't shared across
  regions. Fine for stopping casual abuse on a low-traffic teacher tool;
  if this app gets meaningful public traffic, replace it with Vercel's
  Firewall rate limiting or `@upstash/ratelimit` (see `lib/rate-limit.ts`).
