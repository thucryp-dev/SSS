/**
 * app/api/test-huggingface/route.ts  v2.5
 *
 * GET /api/test-huggingface
 *
 * Diagnostic endpoint — visit in browser to verify Hugging Face image
 * generation actually works, and see the EXACT error if it doesn't.
 * Mirrors /api/test-gemini's approach (which correctly diagnosed the real
 * Gemini auth bug): don't guess, test directly, read back the real error.
 *
 * v2.5: tests BOTH models in the real route's fallback chain (SDXL, then
 * FLUX.1-schnell) and reports per-model results — mirrors the real
 * app/api/generate-lesson/route.ts exactly, so this diagnostic's result
 * accurately predicts what a real lesson generation will experience.
 *
 * Costs up to two small image generation requests if the key works.
 */

import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const HF_MODELS = [
  "stabilityai/stable-diffusion-xl-base-1.0",
  "black-forest-labs/FLUX.1-schnell",
];

const HF_ROUTER_BASE = "https://router.huggingface.co/hf-inference/models";

function hintFor(status: number): string {
  if (status === 401) return "Key is invalid or expired — check HUGGINGFACE_API_KEY in Vercel matches a current huggingface.co → Settings → Access Tokens value.";
  if (status === 403) return "This usually means the account needs 'Inference Providers' / billing enabled in huggingface.co account settings, even for free-tier usage — check Settings → Billing / Inference Providers.";
  if (status === 404) return "This specific model may no longer be routed through hf-inference. Check the model's page on huggingface.co for which providers currently serve it.";
  if (status === 503) return "Model is loading (cold start) — this should resolve with wait_for_model, but if it persists the model may be unavailable on this provider.";
  return "See error_body above for Hugging Face's exact message.";
}

export async function GET(_req: NextRequest) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { status: "error", message: "HUGGINGFACE_API_KEY is not set in Vercel environment variables." },
      { status: 500 }
    );
  }

  const results: Record<string, unknown> = {};
  let firstWorking: string | null = null;

  for (const model of HF_MODELS) {
    const url = `${HF_ROUTER_BASE}/${model}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: "a small red apple on a white background, simple test image",
          options: { wait_for_model: true },
        }),
        signal: AbortSignal.timeout(25000),
      });

      const contentType = res.headers.get("content-type") ?? "";

      if (!res.ok) {
        const errorBody = await res.text();
        results[model] = {
          status: res.status,
          success: false,
          error_body: errorBody.slice(0, 400),
          hint: hintFor(res.status),
        };
        continue;
      }

      const buf = await res.arrayBuffer();
      const isRealImage = buf.byteLength > 1000 && contentType.startsWith("image/");
      results[model] = {
        status: res.status,
        success: isRealImage,
        content_type: contentType,
        response_size_bytes: buf.byteLength,
        message: isRealImage
          ? "✅ works — real image returned"
          : "⚠️ 200 response but doesn't look like a real image",
      };
      if (isRealImage && !firstWorking) firstWorking = model;
    } catch (err) {
      results[model] = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        hint: "Network/timeout error — could be a cold-start timeout or connectivity issue.",
      };
    }
  }

  return NextResponse.json({
    key_prefix: apiKey.slice(0, 6) + "...",
    endpoint_base: HF_ROUTER_BASE,
    first_working_model: firstWorking ?? "NONE — see per-model results below",
    models: results,
  });
}
