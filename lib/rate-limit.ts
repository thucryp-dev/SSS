/**
 * lib/rate-limit.ts
 *
 * Simple in-memory, per-IP sliding-window rate limiter for
 * /api/generate-lesson — every call there costs real money (Gemini +
 * Hugging Face), and the route has no auth, so it needs *some* gate
 * against a leaked link being hit by a bot or an impatient double-tap
 * loop, even before reaching for paid infrastructure.
 *
 * HONEST LIMITATION: this is best-effort, not bulletproof. Vercel
 * serverless functions are ephemeral — this Map only persists for as long
 * as a given function instance stays warm, resets on cold start, and
 * isn't shared across regions/instances. That's enough to stop casual
 * abuse and runaway client bugs; it is NOT enough to stop a determined
 * distributed attacker. If real traffic/abuse shows up, replace this with
 * Vercel's Firewall rate limiting or an Upstash Redis-backed limiter
 * (@upstash/ratelimit) — same call site, swap the implementation.
 */

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 10;

// Safety valve so a flood of distinct IPs can't grow this Map forever on a
// long-lived warm instance. Cleanup is opportunistic (only runs once the
// map is already large) rather than a background timer, since serverless
// runtimes don't reliably keep timers firing between invocations.
const MAX_TRACKED_KEYS = 5000;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();

  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [k, bucket] of buckets) {
      if (now > bucket.resetAt) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Best-effort client IP extraction behind Vercel's proxy. */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
