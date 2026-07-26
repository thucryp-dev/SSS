/**
 * app/api/test-gemini/route.ts  v2.2
 * GET /api/test-gemini
 *
 * Diagnostic endpoint — visit in browser to verify the Gemini key works.
 *
 * 🔴 v2.2 fix: uses x-goog-api-key header for ALL key formats (AIza and
 * AQ.), matching Google's documented standard. Earlier versions incorrectly
 * used Authorization: Bearer for AQ. keys, which Google's endpoint rejects
 * with 401 "Expected OAuth 2.0 access token" — that's an error about the
 * WRONG HEADER, not an invalid key. See app/api/generate-lesson/route.ts
 * header comment for the full explanation and sources.
 */

import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite-preview-06-17",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
];

export async function GET(_req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ status: "error", message: "GEMINI_API_KEY not set." }, { status: 500 });
  }

  const keyType = apiKey.startsWith("AQ.") ? "Auth key (AQ.) — valid format" : "Standard key (AIza) — valid format";
  const results: Record<string, string> = {};
  let firstWorking: string | null = null;

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply with only the word: working" }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      if (res.ok) {
        results[model] = "✅ working";
        if (!firstWorking) firstWorking = model;
      } else {
        results[model] = `❌ ${res.status} — ${text.slice(0, 150)}`;
      }
    } catch (err) {
      results[model] = `❌ error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return NextResponse.json({
    key_prefix: apiKey.slice(0, 10) + "...",
    key_type: keyType,
    auth_method: "x-goog-api-key header (Google's current standard, works for both AIza and AQ. formats)",
    first_working_model: firstWorking ?? "NONE — see errors below. If every model shows 401, double-check the key was copied completely with no extra spaces/newlines.",
    models: results,
  });
}
