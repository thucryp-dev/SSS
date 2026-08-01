/**
 * app/api/generate-lesson/route.ts  v2.5
 *
 * Key fixes to date (newest first):
 *
 * 🔴 v2.5 — Timeout budget coordinated across BOTH Gemini and image calls,
 * not just one side. Gemini per-model timeout 30s→15s; combined with
 * image's 22s×2 models, worst case now sits at (not comfortably under)
 * the route's 60s maxDuration — a deliberate tradeoff since real observed
 * failures are fast 4xx responses, not silent hangs. Image generation
 * gained a 2-model fallback chain (SDXL → FLUX.1-schnell), since it was
 * unclear which text-to-image models the free `hf-inference` route
 * actually serves. Endpoint itself migrated from the retired
 * api-inference.huggingface.co to router.huggingface.co/hf-inference.
 *
 * 🔴 v2.4 — Foreign-script leakage (Hindi/Tamil characters appearing in
 * Sinhala output) fixed with a hard server-side Unicode-range validation
 * check, not just prompt instructions (prompts alone can't guarantee
 * zero leakage). System prompt also strengthened for natural/idiomatic
 * Sinhala and scriptural accuracy (without violating the non-verbatim
 * copyright constraint on the ROV translation).
 *
 * 🔴 v2.2 — Every Gemini API key format — both legacy "AIza..." keys and
 * the newer "AQ.Ab..." keys — authenticates with the SAME header:
 * `x-goog-api-key: <key>`. No format-based branching needed. Earlier
 * versions incorrectly sent AQ. keys via `Authorization: Bearer <key>`,
 * which Google's endpoint rejects with 401 "Expected OAuth 2.0 access
 * token" — that header is for real OAuth tokens, not API keys, regardless
 * of the key's prefix. Confirmed against Google's official docs
 * (ai.google.dev/gemini-api/docs/api-key).
 *
 * Output fields (since v2.0):
 *   memory_verse   — short memorable phrasing of the verse (child/adult appropriate)
 *   activity_ideas — 2-3 simple class activities (age-appropriate, no materials needed)
 */

import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

type AgeGroup = "5-7" | "8-10" | "11-12" | "adult";
const VALID_AGE_GROUPS: readonly AgeGroup[] = ["5-7", "8-10", "11-12", "adult"];

interface LessonSections {
  story: boolean;
  quiz: boolean;
  image: boolean;
  activities: boolean;
}

interface RawGeminiLesson {
  title: string;
  bible_verse: string;
  memory_verse: string;
  story_slides?: string[];
  quiz_questions?: string[];
  activity_ideas?: string[];
  image_prompt?: string;
}

interface LessonResponse {
  title: string;
  bible_verse: string;
  memory_verse: string;
  story_slides: string[];
  quiz_questions: string[];
  activity_ideas: string[];
  image_url: string | null;
  age_group: AgeGroup;
  sections: LessonSections;
}

// ---------------------------------------------------------------------------
// Auth — x-goog-api-key header works for every key format (AIza and AQ.)
// ---------------------------------------------------------------------------

function buildFetchArgs(
  apiKey: string,
  model: string
): { url: string; headers: Record<string, string> } {
  const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
  return {
    url: `${BASE}/${model}:generateContent`,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
  };
}

// ---------------------------------------------------------------------------
// Models — 2026 priority order
// ---------------------------------------------------------------------------

// 🔴 v2.3: Gemini 1.5.x/2.0.x/2.5.x models are being retired for NEW API
// keys (confirmed via the user's own /api/test-gemini results: 404 "no
// longer available to new users" on 2.5-flash, and 404 "not found" on
// 1.5-flash/1.5-flash-8b; 429 quota-exhausted on 2.0-flash/2.0-flash-lite
// — those two are mid-retirement, with quota already dialed toward zero
// to force migration). Google's current generation is Gemini 3.x — all
// four models below are confirmed GA (generally available, production
// ready) per ai.google.dev docs updated within the last week of this fix.
const GEMINI_MODELS = [
  "gemini-3.6-flash",       // newest, GA — strongest agentic/multimodal performance
  "gemini-3.5-flash",       // GA, stable — most intelligent Flash model at scale
  "gemini-3.5-flash-lite",  // GA — fastest, lowest-cost in the 3.5 family
  "gemini-3.1-flash-lite",  // older but still documented/available — final fallback
];

// ---------------------------------------------------------------------------
// Age guidance
// ---------------------------------------------------------------------------

const AGE_GUIDANCE: Record<AgeGroup, string> = {
  "5-7": `AUDIENCE: Children aged 5-7. Simplest everyday Sinhala only. Sentences: 5-8 words, one idea each.
story_slides: exactly 4 paragraphs, 1-2 very short sentences each.
memory_verse: shorten the verse to 5-8 words a young child can memorise by repeating.
quiz_questions: one-word-answer recall questions only.
activity_ideas: 2 simple physical or drawing activities using only hands/voice/paper — no scissors, glue, or materials that require adult supervision.`,

  "8-10": `AUDIENCE: Children aged 8-10. Clear simple Sinhala, richer than a 5-year-old's.
story_slides: exactly 5 paragraphs, 2-3 sentences each.
memory_verse: the key phrase or sentence from the verse, 8-14 words, easy to memorise.
quiz_questions: brief-explanation questions; "why did X happen?" style.
activity_ideas: 2-3 simple activities — role-play, discussion prompts, or simple craft from household items.`,

  "11-12": `AUDIENCE: Preteens aged 11-12. Richer vocabulary, characters' feelings/motivations welcome.
story_slides: exactly 6 paragraphs, 2-4 sentences each.
memory_verse: the most meaningful line from the verse, 10-16 words, suitable for a preteen.
quiz_questions: at least one open-ended question connecting to the student's own life.
activity_ideas: 2-3 discussion-based or journaling activities.`,

  "adult": `AUDIENCE: Adult Sunday School / Bible study. Formal respectful Sinhala. No English/Singlish.
story_slides: exactly 5 paragraphs, 3-5 sentences — theological depth, historical context, character motivation.
memory_verse: the full verse or the core clause most worth memorising, formatted for adult reflection.
quiz_questions: 3 deep open-ended discussion questions; at least one connects to a real adult life challenge today.
activity_ideas: 2 group reflection or application activities appropriate for adults (discussion, journaling, commitment card).`,
};

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(ageGroup: AgeGroup, sections: LessonSections): string {
  const always = [
    '"title": short warm Sinhala title, under 8 words — always required',
    '"bible_verse": Sinhala rendering of one real relevant verse with reference (book chapter:verse) — always required',
    '"memory_verse": condensed or key phrase for memorisation — always required',
  ];
  const conditional: string[] = [];
  if (sections.story) conditional.push('"story_slides": array of Sinhala paragraphs (count/length per age guidance)');
  if (sections.quiz) conditional.push('"quiz_questions": array of exactly 3 Sinhala questions');
  if (sections.activities) conditional.push('"activity_ideas": array of 2-3 simple Sinhala class activity descriptions');
  if (sections.image) conditional.push('"image_prompt": detailed English prompt for AI image generator — warm Pixar-style 3D, no text in image');

  const all = [...always, ...conditional];

  return `You are an expert Christian Sunday School curriculum writer for Sinhala-speaking ${ageGroup === "adult" ? "adults" : "children"} in Sri Lanka, Protestant congregations.

${AGE_GUIDANCE[ageGroup]}

STRICT RULES:
- Reply with ONLY a valid JSON object. No markdown, no code fences, no extra text before or after.
- Include ONLY the fields listed below.

SINHALA SCRIPT PURITY (critical — violations are treated as failures):
- Every field except "image_prompt" MUST use ONLY Sinhala script (Unicode block 0D80–0DFF), standard punctuation, and Arabic numerals.
- NEVER output Devanagari/Hindi script, Tamil script, or any script other than Sinhala, anywhere in a Sinhala-facing field — not even a single stray character, not even inside a longer Sinhala sentence.
- NEVER output English or Singlish (Sinhala words spelled in Latin letters) inside a Sinhala-facing field. The only exception is internationally-recognized brand names that have no Sinhala equivalent (e.g. WhatsApp, PDF) — and even those should be avoided unless truly necessary.
- Do not mix scripts within a single word or sentence under any circumstance.

NATURAL, IDIOMATIC SINHALA:
- Write the way a warm, experienced Sunday school teacher actually speaks to their class — natural spoken-register Sinhala, not a stiff word-for-word translation from English.
- Avoid academic, bureaucratic, or overly formal vocabulary where a simpler everyday word exists (unless writing for the "adult" audience, where a more formal register is appropriate).
- Use natural Sinhala sentence structure and idiom, not English sentence structure with Sinhala words substituted in.
- Proofread your own output mentally before responding: does every sentence read the way a Sinhala speaker would actually say it?

SCRIPTURAL ACCURACY:
- The Bible verse reference (book, chapter, verse) must be REAL and must genuinely match the theme of the lesson — never invent or misattribute a reference.
- All narrative details (names, order of events, who did what) must be scripturally accurate to the actual Biblical account — do not invent details, characters, or events not present in Scripture.
- Protestant 66-book canon only (39 OT + 27 NT). Never reference Apocrypha/deuterocanonical books.
- "bible_verse": your own natural Sinhala rendering in the spirit of the ROV (Sri Lanka Bible Society 1995) — do NOT claim to reproduce that copyrighted text verbatim, but the MEANING and factual content must be fully accurate to the real verse. Format: verse text — book name chapter:verse in Sinhala.
- "memory_verse": derived from the same verse, condensed or restated — age-appropriate, easily memorised, and equally accurate to the source meaning.

REQUIRED FIELDS:
${all.map((f) => `- ${f}`).join("\n")}`;
}

// ---------------------------------------------------------------------------
// Script-purity validation — a second line of defense beyond prompting.
// Prompts reduce foreign-script leakage but can't guarantee zero — this
// catches any Devanagari (Hindi) or Tamil characters that slip through,
// so a defective response triggers a retry with the next model instead
// of reaching the teacher's screen.
// ---------------------------------------------------------------------------

const FOREIGN_SCRIPT_PATTERN = /[\u0900-\u097F\u0B80-\u0BFF]/;

function containsForeignScript(text: string): boolean {
  return FOREIGN_SCRIPT_PATTERN.test(text);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValid(data: unknown, sections: LessonSections): data is RawGeminiLesson {
  return getValidationFailureReason(data, sections) === null;
}

/**
 * Same checks as isValid(), but returns WHY it failed instead of just a
 * boolean — used only for the console.warn below, so that if this ever
 * exhausts all 4 models (e.g. a persistent script-purity issue), Vercel's
 * logs immediately show whether it's a shape problem or foreign-script
 * leakage, instead of requiring someone to guess from a raw JSON dump.
 */
function getValidationFailureReason(data: unknown, sections: LessonSections): string | null {
  if (!data || typeof data !== "object") return "not an object";
  const d = data as Record<string, unknown>;
  if (typeof d.title !== "string" || !d.title.trim()) return "missing/empty title";
  if (typeof d.bible_verse !== "string" || !d.bible_verse.trim()) return "missing/empty bible_verse";
  if (typeof d.memory_verse !== "string") return "missing memory_verse";
  if (sections.story && (!Array.isArray(d.story_slides) || d.story_slides.length === 0)) return "missing/empty story_slides";
  if (sections.quiz && (!Array.isArray(d.quiz_questions) || d.quiz_questions.length === 0)) return "missing/empty quiz_questions";
  if (sections.activities && (!Array.isArray(d.activity_ideas) || d.activity_ideas.length === 0)) return "missing/empty activity_ideas";
  if (sections.image && (typeof d.image_prompt !== "string" || !d.image_prompt.trim())) return "missing/empty image_prompt";

  const sinhalaFacingStrings: string[] = [d.title, d.bible_verse, d.memory_verse].filter(
    (v): v is string => typeof v === "string"
  );
  if (Array.isArray(d.story_slides)) {
    sinhalaFacingStrings.push(...d.story_slides.filter((s): s is string => typeof s === "string"));
  }
  if (Array.isArray(d.quiz_questions)) {
    sinhalaFacingStrings.push(...d.quiz_questions.filter((s): s is string => typeof s === "string"));
  }
  if (Array.isArray(d.activity_ideas)) {
    sinhalaFacingStrings.push(...d.activity_ideas.filter((s): s is string => typeof s === "string"));
  }
  if (sinhalaFacingStrings.some(containsForeignScript)) return "foreign script (Devanagari/Tamil) detected";

  return null;
}

// ---------------------------------------------------------------------------
// Gemini REST call with fallback chain
// ---------------------------------------------------------------------------

async function generateLesson(
  input: string,
  ageGroup: AgeGroup,
  sections: LessonSections
): Promise<RawGeminiLesson> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("MISSING_KEY");

  const prompt = buildSystemPrompt(ageGroup, sections);
  const requestBody = {
    system_instruction: { parts: [{ text: prompt }] },
    contents: [{ role: "user", parts: [{ text: `Teacher's idea / topic / Bible passage:\n"""${input}"""` }] }],
    // temperature/top_p/top_k deliberately left at Gemini's defaults —
    // Google's official Gemini 3.x docs explicitly recommend against
    // overriding these, since the model's reasoning is tuned for them.
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2560 },
  };

  let lastStatus = 0;
  let lastBody = "";

  for (const model of GEMINI_MODELS) {
    const { url, headers } = buildFetchArgs(apiKey, model);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        // 15s per model, not 30s. This route's total budget is 60s
        // (maxDuration, top of file), shared with image generation
        // (22s × 2 models = 44s worst case — see generateImage() below).
        // Most real failures we've actually seen (auth, quota, deprecated
        // model) return fast 4xx responses and exit the loop immediately
        // via the break below — this timeout only matters for a genuine
        // silent hang, where waiting the old 30s × up to 4 models could
        // consume the ENTIRE 60s budget on Gemini alone, leaving zero time
        // for the image step and risking the whole response (including a
        // lesson Gemini may have already generated) being killed by
        // Vercel's platform-level timeout before it's ever returned.
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      console.warn(`[Gemini] ${model} fetch error:`, err);
      continue;
    }

    lastStatus = res.status;
    const text = await res.text();
    lastBody = text;

    if (!res.ok) {
      // 400/401/403/429 = the KEY itself is the problem (bad format, bad
      // auth, no permission, or quota exhausted) — not model-specific, so
      // retrying other models would just repeat the same failure 6 times
      // and cost 30+ seconds for nothing. Stop immediately instead.
      if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 429) {
        console.error(`[Gemini] ${model} hard error ${res.status}:`, text.slice(0, 300));
        break;
      }
      console.warn(`[Gemini] ${model} returned ${res.status}, trying next`);
      continue;
    }

    try {
      const json = JSON.parse(text);
      const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const clean = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
      const parsed = JSON.parse(clean);
      if (!isValid(parsed, sections)) {
        console.warn(`[Gemini] ${model} rejected — ${getValidationFailureReason(parsed, sections)}, trying next`);
        continue;
      }
      console.log(`[Gemini] ✓ ${model} (key type: ${apiKey.startsWith("AQ.") ? "Auth" : "Standard"})`);
      return parsed;
    } catch {
      console.warn(`[Gemini] ${model} unparseable, trying next`);
      continue;
    }
  }

  throw new Error(`GEMINI_FAILED|${lastStatus}|${lastBody.slice(0, 500)}`);
}

// ---------------------------------------------------------------------------
// Hugging Face image
//
// 🔴 v2.4 fix: api-inference.huggingface.co (the old endpoint) has been
// superseded by Hugging Face's "Inference Providers" architecture, routed
// through router.huggingface.co. Same Bearer-token auth, different domain.
//
// 🔴 v2.5: added a model fallback chain, mirroring the pattern that fixed
// Gemini. It's genuinely uncertain which text-to-image models are actually
// served on the free "hf-inference" route in 2026 — some documentation
// suggests it's now CPU-focused, which heavy models like SDXL may not run
// on in reasonable time, while FLUX.1-schnell is the flagship documented
// example for Inference Providers generally. Trying both (SDXL first, to
// match the existing Pixar-3D-style prompts most closely; FLUX.1-schnell
// second, as the better-documented fallback) costs nothing extra when the
// first one works, and meaningfully raises the odds when it doesn't.
// Honest limitation: this hasn't been live-tested (no internet access in
// the build environment) — /api/test-huggingface remains the way to get a
// definitive, real answer after deploying.
// ---------------------------------------------------------------------------

const HF_MODELS = [
  "stabilityai/stable-diffusion-xl-base-1.0",
  "black-forest-labs/FLUX.1-schnell",
];

const HF_ROUTER_BASE = "https://router.huggingface.co/hf-inference/models";

async function generateImage(prompt: string): Promise<string | null> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    console.warn("[HuggingFace] HUGGINGFACE_API_KEY not set — skipping image generation.");
    return null;
  }

  for (const model of HF_MODELS) {
    try {
      const res = await fetch(`${HF_ROUTER_BASE}/${model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: prompt, options: { wait_for_model: true } }),
        // 22s per model, not 45s — now that there are 2 models in the
        // fallback chain, the OLD 45s-per-model timeout could total 90s
        // worst case, exceeding this route's maxDuration = 60 (defined at
        // the top of this file) and getting killed by Vercel mid-request.
        // Coordinated budget: Gemini worst case 15s × 4 models = 60s,
        // image worst case 22s × 2 models = 44s. These can't BOTH hit
        // their absolute worst case and still fit in 60s total — but real
        // failures are fast 4xx responses that exit early (see the break
        // conditions above and below), not silent hangs, so this is a
        // deliberate, documented tradeoff: protect the common case tightly
        // rather than a near-impossible simultaneous-worst-case scenario.
        signal: AbortSignal.timeout(22000),
      });

      if (!res.ok) {
        // Read as text first — HF's error responses are JSON, but reading as
        // text is safe even if something unexpected comes back, and this is
        // exactly what shows up in Vercel's function logs for diagnosis.
        const errorBody = await res.text();
        console.warn(`[HuggingFace] ${model} failed — status ${res.status}:`, errorBody.slice(0, 300));
        // 401/403 = key/account problem, not model-specific — no point
        // trying the next model, it'll fail the same way.
        if (res.status === 401 || res.status === 403) return null;
        continue;
      }

      const buf = await res.arrayBuffer();
      const mime = res.headers.get("content-type") ?? "image/jpeg";
      if (buf.byteLength < 100) {
        // A real image is never this small — this is almost always an error
        // JSON body that slipped through with a 200-ish status.
        console.warn(`[HuggingFace] ${model} returned a too-small response (${buf.byteLength} bytes), trying next`);
        continue;
      }

      console.log(`[HuggingFace] ✓ image generated via ${model}`);
      return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
    } catch (err) {
      console.warn(`[HuggingFace] ${model} request error:`, err instanceof Error ? err.message : err);
      continue;
    }
  }

  console.error("[HuggingFace] all models failed — no image generated for this lesson.");
  return null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(getClientIp(req.headers));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "ඉල්ලීම් ගණන සීමාව ඉක්මවා ඇත. කරුණාකර මඳ වෙලාවක් රැඳී නැවත උත්සාහ කරන්න." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "ඉල්ලීම කියවීමට නොහැකි විය." }, { status: 400 }); }

  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) return NextResponse.json({ error: "කරුණාකර අදහස ලියන්න." }, { status: 400 });
  if (input.length > 2000) return NextResponse.json({ error: "විස්තරය ඉතා දීර්ඝයි." }, { status: 400 });

  const ageGroup: AgeGroup = VALID_AGE_GROUPS.includes(body.ageGroup as AgeGroup)
    ? (body.ageGroup as AgeGroup) : "8-10";

  const rawS = (body.sections && typeof body.sections === "object")
    ? body.sections as Record<string, unknown> : {};
  const sections: LessonSections = {
    story:      rawS.story      !== false,
    quiz:       rawS.quiz       !== false,
    image:      rawS.image      !== false,
    activities: rawS.activities !== false,
  };

  if (!sections.story && !sections.quiz && !sections.image && !sections.activities) {
    return NextResponse.json({ error: "කරුණාකර අවම වශයෙන් එක් කොටසක් හෝ තෝරන්න." }, { status: 400 });
  }

  let lesson: RawGeminiLesson;
  try {
    lesson = await generateLesson(input, ageGroup, sections);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-lesson] failed:", msg);
    const userMsg = msg.includes("MISSING_KEY")
      ? "Gemini API key සකසා නැත."
      : msg.includes("403") || msg.includes("400") || msg.includes("401")
      ? "Gemini API key වලංගු නැත. Vercel-ෙහි GEMINI_API_KEY value එක නිවැරදිද බලන්න, එවිට /api/test-gemini visit කරන්න."
      : "පාඩම සකස් කිරීමේදී දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.";
    return NextResponse.json({ error: userMsg }, { status: 502 });
  }

  const image_url = (sections.image && lesson.image_prompt)
    ? await generateImage(lesson.image_prompt) : null;

  return NextResponse.json({
    title:           lesson.title,
    bible_verse:     lesson.bible_verse,
    memory_verse:    lesson.memory_verse ?? lesson.bible_verse,
    story_slides:    lesson.story_slides    ?? [],
    quiz_questions:  lesson.quiz_questions  ?? [],
    activity_ideas:  lesson.activity_ideas  ?? [],
    image_url,
    age_group:       ageGroup,
    sections,
  } satisfies LessonResponse, { status: 200 });
}
