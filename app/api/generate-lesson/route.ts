/**
 * app/api/generate-lesson/route.ts
 *
 * Uses direct REST fetch to the Gemini API — no @google/generative-ai SDK.
 * This removes all SDK version/compatibility issues and works with any
 * valid Google AI Studio API key regardless of format.
 *
 * POST body: { input: string, ageGroup: AgeGroup, sections: LessonSections }
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

interface RawGeminiLesson {
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
// Age-group guidance
// ---------------------------------------------------------------------------

const AGE_GUIDANCE: Record<AgeGroup, string> = {
  "5-7": `TARGET AGE: 5-7 years. Use the simplest Sinhala words a 5-year-old knows daily.
Sentences: 5-8 words, one idea each. Repetition is good.
story_slides: exactly 4 paragraphs, 1-2 very short sentences each.
quiz_questions: extremely simple one-word-answer recall questions.`,
  "8-10": `TARGET AGE: 8-10 years. Clear simple Sinhala, richer than a 5-year-old's but still everyday.
Sentences: two simple clauses max.
story_slides: exactly 5 paragraphs, 2-3 sentences each.
quiz_questions: ask children to briefly explain what happened and why.`,
  "11-12": `TARGET AGE: 11-12 years (preteens). Richer vocabulary, descriptive, characters' feelings/motivations.
story_slides: exactly 6 paragraphs, 2-4 sentences each.
quiz_questions: at least one open-ended question connecting the lesson to the student's own life.`,
  "adult": `TARGET AUDIENCE: Adult Sunday School / Bible study participants.
Language: respectful clear formal Sinhala — not colloquial, not archaic. Never English/Singlish.
story_slides: exactly 5 paragraphs, 3-5 sentences each. Include theological depth, historical/cultural context, what the passage reveals about God's character.
quiz_questions: 3 deep open-ended discussion questions for adults, inviting personal reflection. At least one question connects the passage to a real challenge adults face today.
title: thoughtful Sinhala title suitable for adult study, under 8 words.`,
};

// ---------------------------------------------------------------------------
// Gemini REST call — tries models in order
// ---------------------------------------------------------------------------

const GEMINI_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function buildSystemPrompt(ageGroup: AgeGroup, sections: LessonSections): string {
  const fields: string[] = [
    '"title": short warm Sinhala title (always required, under 8 words)',
    '"bible_verse": Sinhala rendering of one real relevant verse with reference (always required)',
  ];
  if (sections.story) fields.push('"story_slides": array of Sinhala paragraphs — see count/length in age guidance');
  if (sections.quiz)  fields.push('"quiz_questions": array of exactly 3 Sinhala questions');
  if (sections.image) fields.push('"image_prompt": detailed English prompt for AI image generator — Pixar-style 3D, warm, no text in image');

  return `You are an expert Christian Sunday School curriculum writer for Sinhala-speaking ${ageGroup === "adult" ? "adults" : "children"} in Sri Lanka, serving Protestant congregations.

${AGE_GUIDANCE[ageGroup]}

STRICT RULES:
- Reply with ONLY a valid JSON object. No markdown, no code fences, no extra text.
- Include ONLY these fields: ${fields.map(f => f.split(":")[0]).join(", ")}
- All Sinhala fields: clean grammatically correct Sinhala. Never mix English or Singlish.
- Protestant 66-book canon only. No Apocrypha.
- bible_verse: your own Sinhala rendering in the style of the ROV (Sri Lanka Bible Society 1995) — NOT a verbatim quote of that copyrighted text. Format: verse — book chapter:verse in Sinhala.

REQUESTED FIELDS:
${fields.map(f => `- ${f}`).join("\n")}`;
}

function buildRequestBody(prompt: string, input: string) {
  return {
    system_instruction: { parts: [{ text: prompt }] },
    contents: [{ role: "user", parts: [{ text: `Teacher's idea / topic / Bible passage:\n"""${input}"""` }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.8,
      maxOutputTokens: 2048,
    },
  };
}

function cleanJson(raw: string): string {
  return raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

function isValid(data: unknown, sections: LessonSections): data is RawGeminiLesson {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (typeof d.title !== "string" || !d.title.trim()) return false;
  if (typeof d.bible_verse !== "string" || !d.bible_verse.trim()) return false;
  if (sections.story && (!Array.isArray(d.story_slides) || d.story_slides.length === 0)) return false;
  if (sections.quiz  && (!Array.isArray(d.quiz_questions) || d.quiz_questions.length === 0)) return false;
  if (sections.image && (typeof d.image_prompt !== "string" || !d.image_prompt.trim())) return false;
  return true;
}

async function callGemini(
  apiKey: string,
  model: string,
  body: object,
  timeoutMs = 30000
): Promise<{ ok: boolean; status: number; text: string }> {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function generateLesson(
  input: string,
  ageGroup: AgeGroup,
  sections: LessonSections
): Promise<RawGeminiLesson> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("MISSING_KEY");

  const prompt = buildSystemPrompt(ageGroup, sections);
  const body   = buildRequestBody(prompt, input);

  let lastStatus = 0;
  let lastText   = "";

  for (const model of GEMINI_MODELS) {
    let res: { ok: boolean; status: number; text: string };
    try {
      res = await callGemini(apiKey, model, body);
    } catch (err) {
      console.warn(`Model ${model} fetch error:`, err);
      continue;
    }

    lastStatus = res.status;
    lastText   = res.text;

    if (!res.ok) {
      // 400 = bad request (likely bad key/format) → stop immediately
      // 404 = model not found for this key tier → try next
      // 429 = quota → propagate immediately
      if (res.status === 400 || res.status === 429) {
        console.error(`Model ${model} hard error ${res.status}:`, res.text.slice(0, 300));
        break;
      }
      console.warn(`Model ${model} returned ${res.status}, trying next`);
      continue;
    }

    // Parse the response
    let parsed: unknown;
    try {
      const json = JSON.parse(res.text);
      const raw  = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      parsed     = JSON.parse(cleanJson(raw));
    } catch {
      console.warn(`Model ${model} returned unparseable JSON, trying next`);
      continue;
    }

    if (!isValid(parsed, sections)) {
      console.warn(`Model ${model} returned invalid shape, trying next`);
      continue;
    }

    console.log(`✓ Gemini model used: ${model}`);
    return parsed;
  }

  // All models failed — surface the last raw error for debugging
  throw new Error(`GEMINI_FAILED|${lastStatus}|${lastText.slice(0, 400)}`);
}

// ---------------------------------------------------------------------------
// Hugging Face image
// ---------------------------------------------------------------------------

async function generateImage(prompt: string): Promise<string | null> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: prompt, options: { wait_for_model: true } }),
        signal: AbortSignal.timeout(45000),
      }
    );
    if (!res.ok) { console.error("HF image failed:", res.status); return null; }
    const buf    = await res.arrayBuffer();
    const mime   = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch (err) {
    console.error("HF image error:", err);
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

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch {
    return NextResponse.json({ error: "ඉල්ලීම කියවීමට නොහැකි විය." }, { status: 400 });
  }

  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input)           return NextResponse.json({ error: "කරුණාකර පාඩම සඳහා කෙටි විස්තරයක් ලියන්න." }, { status: 400 });
  if (input.length > 2000) return NextResponse.json({ error: "විස්තරය ඉතා දීර්ඝයි." }, { status: 400 });

  const ageGroup: AgeGroup = VALID_AGE_GROUPS.includes(body.ageGroup as AgeGroup)
    ? (body.ageGroup as AgeGroup) : "8-10";

  const rawS = (body.sections && typeof body.sections === "object")
    ? body.sections as Record<string, unknown> : {};
  const sections: LessonSections = {
    story: rawS.story !== false,
    quiz:  rawS.quiz  !== false,
    image: rawS.image !== false,
  };

  if (!sections.story && !sections.quiz && !sections.image) {
    return NextResponse.json({ error: "කරුණාකර අවම වශයෙන් එක් කොටසක් හෝ තෝරන්න." }, { status: 400 });
  }

  let lesson: RawGeminiLesson;
  try {
    lesson = await generateLesson(input, ageGroup, sections);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Lesson generation failed:", msg);
    const userMsg = msg.startsWith("MISSING_KEY")
      ? "Gemini API key සකසා නැත."
      : "පාඩම සකස් කිරීමේදී දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.";
    return NextResponse.json({ error: userMsg }, { status: 502 });
  }

  const image_url = (sections.image && lesson.image_prompt)
    ? await generateImage(lesson.image_prompt) : null;

  return NextResponse.json({
    title:          lesson.title,
    bible_verse:    lesson.bible_verse,
    story_slides:   lesson.story_slides   ?? [],
    quiz_questions: lesson.quiz_questions ?? [],
    image_url,
    age_group:      ageGroup,
    sections,
  } satisfies LessonResponse, { status: 200 });
}
