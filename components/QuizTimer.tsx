"use client";

/**
 * components/QuizTimer.tsx
 *
 * A simple countdown timer for the quiz slide.
 * Teacher picks 60 / 90 / 120 seconds, hits Start, and the class answers
 * questions while the timer counts down. Pulses red in the last 10 seconds.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Pause, Play, RotateCcw } from "lucide-react";

const PRESETS = [60, 90, 120] as const;
type Preset = (typeof PRESETS)[number];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function QuizTimer() {
  const [preset, setPreset]       = useState<Preset>(60);
  const [remaining, setRemaining] = useState<number>(60);
  const [running, setRunning]     = useState(false);
  const intervalRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const reset = useCallback(
    (newPreset?: Preset) => {
      clear();
      setRunning(false);
      setRemaining(newPreset ?? preset);
    },
    [preset]
  );

  const toggle = useCallback(() => {
    if (remaining === 0) { reset(); return; }
    setRunning((r) => !r);
  }, [remaining, reset]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clear();
            setRunning(false);
            // Vibrate on finish
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              navigator.vibrate([200, 100, 200]);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clear();
    }
    return clear;
  }, [running]);

  // Clean up on unmount
  useEffect(() => () => clear(), []);

  const isDone    = remaining === 0;
  const isWarning = remaining <= 10 && remaining > 0;
  const progress  = remaining / preset;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Preset selector */}
      <div className="flex gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={running}
            onClick={() => { setPreset(p); reset(p); }}
            className={`rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition ${
              preset === p && !running
                ? "border-amber-600 bg-amber-600 text-white"
                : "border-amber-200 bg-white text-amber-700 disabled:opacity-40"
            }`}
          >
            {p}s
          </button>
        ))}
      </div>

      {/* Timer ring */}
      <div className="relative flex h-24 w-24 items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 96 96">
          <circle cx="48" cy="48" r="42" fill="none" stroke="#fde68a" strokeWidth="8" />
          <motion.circle
            cx="48" cy="48" r="42"
            fill="none"
            stroke={isDone ? "#dc2626" : isWarning ? "#f97316" : "#b45309"}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 42}
            animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - progress) }}
            transition={{ duration: 0.5, ease: "linear" }}
          />
        </svg>
        <motion.span
          className={`text-2xl font-black tabular-nums ${
            isDone ? "text-red-600" : isWarning ? "text-orange-600" : "text-amber-900"
          }`}
          animate={isWarning && running ? { scale: [1, 1.12, 1] } : {}}
          transition={{ repeat: Infinity, duration: 0.8 }}
        >
          {isDone ? "🔔" : formatTime(remaining)}
        </motion.span>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={toggle}
          className={`flex h-11 w-11 items-center justify-center rounded-full font-bold text-white shadow transition ${
            isDone ? "bg-amber-600 hover:bg-amber-700" : running ? "bg-orange-500 hover:bg-orange-600" : "bg-emerald-600 hover:bg-emerald-700"
          }`}
          aria-label={running ? "නවත්වන්න" : "ආරම්භ කරන්න"}
        >
          {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={() => reset()}
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-amber-300 bg-white text-amber-700 shadow transition hover:bg-amber-50"
          aria-label="නැවත සකසන්න"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {isDone && (
        <p className="text-sm font-bold text-red-600">කාලය ඉවර විය!</p>
      )}
    </div>
  );
}
