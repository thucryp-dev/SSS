"use client";

/**
 * components/ServiceWorkerRegister.tsx
 *
 * Registers public/sw.js once, on mount, and warms up Firebase anonymous
 * auth (see lib/firebase.ts's warmUpAuth()) at the same time, giving
 * sign-in a head start before connectivity might drop. Rendered from
 * app/layout.tsx so it's active on every page. Silently no-ops in
 * browsers without service worker support, or when Firebase isn't
 * configured — the rest of the app keeps working regardless.
 */

import { useEffect } from "react";

import { warmUpAuth } from "@/lib/firebase";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    warmUpAuth();

    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  }, []);

  return null;
}
