/**
 * app/api/test-gemini/route.ts
 *
 * DIAGNOSTIC ONLY — not used by the app itself.
 * Visit  https://YOUR-APP.vercel.app/api/test-gemini  in a browser.
 * It tests every model in the fallback chain and returns JSON showing
 * which ones work and the exact error text for the ones that don't.
 *
 * Uses the raw REST API (no SDK) so the result is 100% reliable.
 * Safe to leave deployed — it doesn't expose the key (it's server-side),
 * and it only runs a single-word "Hello" generation per model.
 * Remove this file once the main lesson generation is confirmed working.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      status: "ERROR",
      message: "GEMINI_API_KEY environment variable is missing on Vercel.",
    });
  }

  const results: Record<string, unknown> = {};

  for (const model of MODELS) {
    try {
      const res = await fetch(`${BASE}/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Reply with one word: Hello" }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
        signal: AbortSignal.timeout(12000),
      });

      const data = await res.json();

      if (!res.ok) {
        results[model] = {
          ok: false,
          httpStatus: res.status,
          error: data?.error?.message ?? JSON.stringify(data),
        };
      } else {
        results[model] = {
          ok: true,
          response: data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(empty)",
        };
      }
    } catch (e) {
      results[model] = { ok: false, error: String(e) };
    }
  }

  const working = Object.entries(results)
    .filter(([, v]) => (v as { ok: boolean }).ok)
    .map(([k]) => k);

  return NextResponse.json({
    keyPrefix: apiKey.slice(0, 6) + "...",
    firstWorkingModel: working[0] ?? null,
    results,
  });
}
