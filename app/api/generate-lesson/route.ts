/**
 * app/api/generate-lesson/route.ts
 *
 * POST /api/generate-lesson
 * Body: {
 *   input:    string,
 *   ageGroup: "5-7" | "8-10" | "11-12" | "adult",
 *   sections: { story: boolean, quiz: boolean, image: boolean }
 * }
 *
 * Uses the Gemini REST API directly (no SDK) for maximum compatibility
 * across Vercel environments and Node versions. Tries models in order
 * until one works.
 */

import { type NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgeGroup = "5-7" | "8-10" | "11-12" | "adult";
const VALID_AGE_GROUPS: readonly AgeGroup[] = ["5-7", "8-10", "11-12", "adult"];

interface LessonSections { story: boolean; quiz: boolean; image: boolean; }

interface RawLesson {
  title: string;
  bible_verse: string;
  story_slides?: string[];
  quiz_questions?: string[];
  image_prompt?: string;
}

interface LessonResponse {
  title: string;
  bible_verse: string;
  story_slides: string[];
  quiz_questions: string[];
  image_url: string | null;
  age_group: AgeGroup;
  sections: LessonSections;
}

// ---------------------------------------------------------------------------
// Gemini REST API — model fallback chain
// ---------------------------------------------------------------------------

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const GEMINI_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
  "gemini-2.0-flash",
];

// ---------------------------------------------------------------------------
// Age-group guidance
// ---------------------------------------------------------------------------

const AGE_GUIDANCE: Record<AgeGroup, string> = {
  "5-7": `TARGET AGE: 5-7 years (pre-readers).
- Only the simplest, most concrete Sinhala words a 5-year-old knows.
- Very short sentences (5-8 words), one idea per sentence.
- story_slides: exactly 4 paragraphs, 1-2 very short sentences each.
- quiz_questions: single-word-answer recall questions about concrete story details.`,

  "8-10": `TARGET AGE: 8-10 years (early elementary).
- Clear simple Sinhala, everyday words, short sentences.
- story_slides: exactly 5 paragraphs, 2-3 sentences each.
- quiz_questions: brief "what happened and why" questions in the child's own words.`,

  "11-12": `TARGET AGE: 11-12 years (preteens).
- Richer vocabulary, more descriptive language, characters' feelings and motivations.
- story_slides: exactly 6 paragraphs, 2-4 sentences each.
- quiz_questions: at least one open-ended question connecting the lesson to the student's own life.`,

  "adult": `TARGET AUDIENCE: Adult Sunday School / Bible study participants.
- Theological depth, historical and cultural context, honest life application.
- Respectful clear formal Sinhala — not colloquial or childlike. Never English/Singlish.
- story_slides: exactly 5 paragraphs, 3-5 sentences each. Explore characters' motivations,
  theological significance, and what the passage reveals about God's character.
- quiz_questions: 3 deep open-ended discussion questions for a group of adults.
  Connect the passage to real adult challenges today. Not simple recall.
- title: warm, thoughtful, concise (under 8 words). May be slightly more literary than a children's title.`,
};

function buildPrompt(ageGroup: AgeGroup, sections: LessonSections): string {
  const fields: string[] = [
    `"title": short Sinhala title (always required, under 8 words)`,
    `"bible_verse": Sinhala rendering of one real relevant verse + reference (always required)`,
  ];
  const shape: Record<string, unknown> = {
    title: "string in Sinhala",
    bible_verse: "string in Sinhala",
  };
  if (sections.story) {
    fields.push(`"story_slides": Sinhala paragraphs (see age guidance for count/length)`);
    shape.story_slides = ["string in Sinhala"];
  }
  if (sections.quiz) {
    fields.push(`"quiz_questions": exactly 3 Sinhala questions`);
    shape.quiz_questions = ["string in Sinhala", "string in Sinhala", "string in Sinhala"];
  }
  if (sections.image) {
    fields.push(`"image_prompt": vivid English prompt for an AI image generator`);
    shape.image_prompt = "string in English";
  }

  const audience = ageGroup === "adult" ? "adult Sunday School students" : "Sinhala-speaking children";

  return `You are an expert Christian Sunday School curriculum writer for ${audience} in Sri Lanka (Protestant congregations).

${AGE_GUIDANCE[ageGroup]}

STRICT RULES:
- Output ONLY a single valid JSON object. No markdown, no fences, no commentary.
- Include ONLY the fields listed below. No extra fields.
- All Sinhala fields: clean, grammatically correct Sinhala. Never mix in English or Singlish.
- Protestant 66-book canon only (no Apocrypha).
- "bible_verse": your own Sinhala rendering consistent with the ROV (Sri Lanka Bible Society 1995) tradition — NOT verbatim from that copyrighted text. Format: verse text — book name chapter:verse in Sinhala.
${sections.image ? `- "image_prompt": detailed English description — beautiful warm Pixar-style 3D animated art, no text or letters in the image.` : ""}

REQUIRED OUTPUT FIELDS:
${fields.map((f) => `- ${f}`).join("\n")}

Return JSON in exactly this shape:
${JSON.stringify(shape, null, 2)}`;
}

function cleanJson(raw: string): string {
  return raw.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function isValid(data: unknown, sections: LessonSections): data is RawLesson {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (typeof d.title !== "string" || !d.title.trim()) return false;
  if (typeof d.bible_verse !== "string" || !d.bible_verse.trim()) return false;
  if (sections.story) {
    if (!Array.isArray(d.story_slides) || d.story_slides.length === 0) return false;
    if (!(d.story_slides as unknown[]).every((s) => typeof s === "string")) return false;
  }
  if (sections.quiz) {
    if (!Array.isArray(d.quiz_questions) || d.quiz_questions.length === 0) return false;
    if (!(d.quiz_questions as unknown[]).every((s) => typeof s === "string")) return false;
  }
  return true;
}

async function callGemini(
  input: string,
  ageGroup: AgeGroup,
  sections: LessonSections
): Promise<RawLesson> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("MISSING_GEMINI_KEY");

  const systemText = buildPrompt(ageGroup, sections);
  const userText = `Teacher's idea / topic / Bible passage:\n"""${input}"""`;

  let lastError: unknown;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemText }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.8,
            maxOutputTokens: 2048,
          },
        }),
        signal: AbortSignal.timeout(50000),
      });

      const body = await res.json();

      if (!res.ok) {
        const errMsg = body?.error?.message ?? `HTTP ${res.status}`;
        console.error(`[generate-lesson] ${model} failed: ${errMsg}`);

        // Auth/key errors — no point trying other models.
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          throw new Error(`GEMINI_AUTH_ERROR: ${errMsg}`);
        }
        // 404 = model not found for this key tier — try next.
        if (res.status === 404) { lastError = new Error(errMsg); continue; }
        // 429 = rate limit — surface immediately.
        if (res.status === 429) throw new Error(`GEMINI_RATE_LIMIT: ${errMsg}`);

        lastError = new Error(errMsg);
        continue;
      }

      // Extract the generated text from the response.
      const rawText: string =
        body?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

      if (!rawText) {
        console.error(`[generate-lesson] ${model} returned empty text`);
        lastError = new Error("EMPTY_RESPONSE");
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleanJson(rawText));
      } catch {
        console.error(`[generate-lesson] ${model} returned invalid JSON: ${rawText.slice(0, 200)}`);
        lastError = new Error("INVALID_JSON");
        continue;
      }

      if (!isValid(parsed, sections)) {
        console.error(`[generate-lesson] ${model} returned wrong shape:`, parsed);
        lastError = new Error("INVALID_SHAPE");
        continue;
      }

      console.log(`[generate-lesson] ✓ model: ${model}`);
      return parsed;

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("GEMINI_AUTH_ERROR") || msg.startsWith("GEMINI_RATE_LIMIT") || msg === "MISSING_GEMINI_KEY") {
        throw e;
      }
      console.error(`[generate-lesson] ${model} exception: ${msg}`);
      lastError = e;
    }
  }

  throw lastError ?? new Error("All Gemini models failed");
}

// ---------------------------------------------------------------------------
// Hugging Face image generation
// ---------------------------------------------------------------------------

const HF_URL =
  "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0";

async function generateImage(prompt: string): Promise<string | null> {
  const key = process.env.HUGGINGFACE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(HF_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: prompt, options: { wait_for_model: true } }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) { console.error("HF image failed:", res.status); return null; }
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    const buf = await res.arrayBuffer();
    return `data:${ct};base64,${Buffer.from(buf).toString("base64")}`;
  } catch (e) {
    console.error("HF image error:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "ඉල්ලීම් ගණන සීමාව ඉක්මවා ඇත. කරුණාකර මඳ වෙලාවක් රැඳී නැවත උත්සාහ කරන්න." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let body: { input?: unknown; ageGroup?: unknown; sections?: unknown };
  try { body = await req.json(); }
  catch {
    return NextResponse.json(
      { error: "ඉල්ලීම කියවීමට නොහැකි විය. කරුණාකර නැවත උත්සාහ කරන්න." },
      { status: 400 }
    );
  }

  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) return NextResponse.json({ error: "කරුණාකර විස්තරයක් ලියන්න හෝ කථා කරන්න." }, { status: 400 });
  if (input.length > 2000) return NextResponse.json({ error: "විස්තරය ඉතා දීර්ඝයි." }, { status: 400 });

  const ageGroup: AgeGroup = VALID_AGE_GROUPS.includes(body.ageGroup as AgeGroup)
    ? (body.ageGroup as AgeGroup) : "8-10";

  const raw = body.sections && typeof body.sections === "object"
    ? (body.sections as Record<string, unknown>) : {};
  const sections: LessonSections = {
    story: raw.story !== false,
    quiz:  raw.quiz  !== false,
    image: raw.image !== false,
  };

  if (!sections.story && !sections.quiz && !sections.image) {
    return NextResponse.json({ error: "කරුණාකර අවම වශයෙන් එක් කොටසක් හෝ තෝරන්න." }, { status: 400 });
  }

  let lesson: RawLesson;
  try {
    lesson = await callGemini(input, ageGroup, sections);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    console.error("[generate-lesson] Final error:", msg);

    let sinhala = "පාඩම සකස් කිරීමේදී දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.";
    if (msg === "MISSING_GEMINI_KEY") sinhala = "සේවාදායක සැකසුම් දෝෂයකි.";
    if (msg.startsWith("GEMINI_AUTH_ERROR")) sinhala = "Gemini API key එක වලංගු නෙවෙයි. Vercel environment variables බලන්න.";
    if (msg.startsWith("GEMINI_RATE_LIMIT")) sinhala = "Gemini ඉල්ලීම් සීමාව ඉක්මවා ඇත. මඳ වෙලාවකින් නැවත උත්සාහ කරන්න.";

    return NextResponse.json({ error: sinhala }, { status: 502 });
  }

  const image_url = sections.image && lesson.image_prompt
    ? await generateImage(lesson.image_prompt)
    : null;

  const response: LessonResponse = {
    title: lesson.title,
    bible_verse: lesson.bible_verse,
    story_slides: lesson.story_slides ?? [],
    quiz_questions: lesson.quiz_questions ?? [],
    image_url,
    age_group: ageGroup,
    sections,
  };

  return NextResponse.json(response, { status: 200 });
}
