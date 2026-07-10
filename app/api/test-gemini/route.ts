/**
 * app/api/test-gemini/route.ts
 *
 * GET /api/test-gemini
 *
 * Diagnostic endpoint — visit this URL in the browser after deploying to
 * verify the Gemini API key works and see exactly which model responds.
 * Safe to call: costs one tiny API request (no image generation).
 */

import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

export async function GET(_req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      status: "error",
      message: "GEMINI_API_KEY is not set in environment variables.",
    }, { status: 500 });
  }

  const results: Record<string, string> = {};
  let firstWorking: string | null = null;

  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply with only the word: working" }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      if (res.ok) {
        results[model] = "✅ working";
        if (!firstWorking) firstWorking = model;
      } else {
        const parsed = JSON.parse(text).catch?.() ?? {};
        results[model] = `❌ ${res.status} — ${text.slice(0, 120)}`;
      }
    } catch (err) {
      results[model] = `❌ fetch error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return NextResponse.json({
    key_prefix: apiKey.slice(0, 8) + "...",
    first_working_model: firstWorking ?? "NONE — check key",
    models: results,
  });
}
