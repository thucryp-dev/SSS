/**
 * app/api/test-gemini/route.ts
 * GET /api/test-gemini
 * Diagnostic: tests every Gemini model with correct auth (AQ. or AIza).
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

  const isAuthKey = apiKey.startsWith("AQ.");
  const keyType = isAuthKey ? "Auth key (AQ.)" : "Standard key (AIza)";
  const results: Record<string, string> = {};
  let firstWorking: string | null = null;

  for (const model of MODELS) {
    const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
    const url = isAuthKey ? `${BASE}/${model}:generateContent` : `${BASE}/${model}:generateContent?key=${apiKey}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (isAuthKey) headers.Authorization = `Bearer ${apiKey}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
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
    first_working_model: firstWorking ?? "NONE — see errors below",
    models: results,
  });
}
