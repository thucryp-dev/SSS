/**
 * app/api/test-huggingface/route.ts
 *
 * GET /api/test-huggingface
 *
 * Diagnostic endpoint — visit in browser to verify Hugging Face image
 * generation actually works, and see the EXACT error if it doesn't.
 * Mirrors /api/test-gemini's approach, which correctly diagnosed the real
 * Gemini auth bug earlier — same idea here: don't guess, test directly
 * and read back Hugging Face's own error message.
 *
 * Costs one real (tiny) image generation request if the key works.
 */

import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const HF_ROUTER_URL =
  "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0";

export async function GET(_req: NextRequest) {
  const apiKey = process.env.HUGGINGFACE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        status: "error",
        message: "HUGGINGFACE_API_KEY is not set in Vercel environment variables.",
      },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(HF_ROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: "a small red apple on a white background, simple test image",
        options: { wait_for_model: true },
      }),
      signal: AbortSignal.timeout(45000),
    });

    const contentType = res.headers.get("content-type") ?? "";

    if (!res.ok) {
      const errorBody = await res.text();
      return NextResponse.json({
        key_prefix: apiKey.slice(0, 6) + "...",
        endpoint: HF_ROUTER_URL,
        status: res.status,
        success: false,
        error_body: errorBody.slice(0, 800),
        hint:
          res.status === 401
            ? "Key is invalid or expired — check HUGGINGFACE_API_KEY in Vercel matches a current huggingface.co → Settings → Access Tokens value."
            : res.status === 403
            ? "This usually means the account needs 'Inference Providers' / billing enabled in huggingface.co account settings, even for free-tier usage — check Settings → Billing / Inference Providers."
            : res.status === 404
            ? "This specific model may no longer be routed through hf-inference. Check the model's page on huggingface.co for which providers currently serve it."
            : res.status === 503
            ? "Model is loading (cold start) — this should resolve with wait_for_model, but if it persists the model may be unavailable on this provider."
            : "See error_body above for Hugging Face's exact message.",
      });
    }

    // Success — read the actual image bytes to confirm it's real, not an
    // error JSON that slipped through with a 200 status.
    const buf = await res.arrayBuffer();
    const isRealImage = buf.byteLength > 1000 && contentType.startsWith("image/");

    return NextResponse.json({
      key_prefix: apiKey.slice(0, 6) + "...",
      endpoint: HF_ROUTER_URL,
      status: res.status,
      success: isRealImage,
      content_type: contentType,
      response_size_bytes: buf.byteLength,
      message: isRealImage
        ? "✅ Image generation works! A real image was returned."
        : "⚠️ Got a 200 response but it doesn't look like a real image (too small or wrong content-type) — the response may actually be an error message.",
    });
  } catch (err) {
    return NextResponse.json({
      key_prefix: apiKey.slice(0, 6) + "...",
      endpoint: HF_ROUTER_URL,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      hint: "Network/timeout error calling Hugging Face — could be a cold-start timeout (rare) or a connectivity issue.",
    });
  }
}
