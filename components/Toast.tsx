"use client";

/**
 * components/Toast.tsx
 *
 * Lightweight, self-dismissing toast notification.
 * Usage:
 *   const { showToast, ToastContainer } = useToast();
 *   showToast("පිටපත් කළා!");
 *   <ToastContainer />
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const showToast = useCallback(
    (message: string, type: ToastItem["type"] = "success", durationMs = 2500) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
    },
    []
  );

  const typeStyles: Record<ToastItem["type"], string> = {
    success: "bg-emerald-700 text-white",
    error:   "bg-red-700 text-white",
    info:    "bg-amber-700 text-white",
  };

  function ToastContainer() {
    return (
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-24 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.92 }}
              className={`rounded-2xl px-5 py-3 text-base font-semibold shadow-xl ${typeStyles[t.type]}`}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  }

  return { showToast, ToastContainer };
}
