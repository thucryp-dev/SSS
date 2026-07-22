/**
 * public/sw.js
 *
 * Minimal hand-rolled service worker for "Sunday School Assistant".
 * (A manual worker is used instead of a next-pwa-style plugin to avoid
 * App Router / bundler compatibility churn — this is plain, dependency-free
 * JS that Next.js serves as a static file from /public.)
 *
 * Responsibilities:
 *   1. Cache the app shell so the dashboard itself can open while offline.
 *      (The *data* layer's offline queue is handled separately by
 *      Firestore's persistentLocalCache, configured in lib/firebase.ts.)
 *   2. Listen for a real Background Sync event and notify any open tab so
 *      it can drain Firestore's pending-lesson queue — even if the tab was
 *      backgrounded when connectivity returned.
 *
 * Registered from components/ServiceWorkerRegister.tsx.
 */

const CACHE_NAME = "dahampasala-shell-v2";
const APP_SHELL = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache.add() per-URL (not addAll) so one failed resource — e.g. the
      // very first app load happening while offline — can't take down the
      // whole install and leave the service worker never activating.
      Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// Network-first for page navigations, so teachers get the latest deployed
// build whenever they're online — falling back to the cached shell offline.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});

// Background Sync: wake up and tell every open tab to drain the offline queue.
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-pending-lessons") {
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        clients.forEach((client) => client.postMessage({ type: "SYNC_PENDING_LESSONS" }));
      })
    );
  }
});
