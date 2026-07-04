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
 * Modular output — only generates the sections the teacher actually selected.
 * Bible verse + title are always generated (they're the core of every lesson).
 * Story slides, quiz questions, and image are conditional on `sections`.
 *
 * This saves Gemini tokens, cuts latency, and lets teachers who only need
 * e.g. a verse + image skip waiting for quiz questions they won't use.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { type NextRequest, NextResponse } from "next/server";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgeGroup = "5-7" | "8-10" | "11-12" | "adult";
const VALID_AGE_GROUPS: readonly AgeGroup[] = ["5-7", "8-10", "11-12", "adult"];

interface LessonSections {
  story: boolean;
  quiz: boolean;
  image: boolean;
}

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
// Age-group guidance injected into the system prompt
// ---------------------------------------------------------------------------

const AGE_GROUP_GUIDANCE: Record<AgeGroup, string> = {
  "5-7": `TARGET AGE: 5-7 years old (pre-readers / earliest readers).
- Use only the simplest, most concrete Sinhala words a 5-year-old already knows in daily speech. No abstract or formal vocabulary.
- Sentences must be very short (roughly 5-8 words), one simple idea per sentence. Repetition of key words/phrases is good and helps young listeners follow along.
- Favor concrete sensory details a child can picture: colors, animals, sounds, simple actions.
- "story_slides" (if requested): exactly 4 short paragraphs, each just 1-2 very short sentences.
- "quiz_questions" (if requested): extremely simple recall questions about concrete details from the story, answerable in one word.`,

  "8-10": `TARGET AGE: 8-10 years old (early elementary, confident readers).
- Use clear, simple Sinhala with a moderately richer vocabulary than you'd use for a 5-year-old, but still everyday words — nothing formal or literary.
- Sentences can have two simple clauses, but stay short and easy to follow.
- "story_slides" (if requested): exactly 5 paragraphs, 2-3 sentences each.
- "quiz_questions" (if requested): can ask the child to briefly explain what happened and why, in their own words.`,

  "11-12": `TARGET AGE: 11-12 years old (preteens).
- Use richer vocabulary and slightly more complex sentence structure — still completely clear and free of English/Singlish, but you may use more descriptive language and convey characters' feelings/motivations.
- "story_slides" (if requested): exactly 6 paragraphs, 2-4 sentences each.
- "quiz_questions" (if requested): include at least one open-ended question connecting the lesson to the student's own life or choices.`,

  "adult": `TARGET AUDIENCE: Adult Sunday School students or Bible study participants.
- Write with the depth appropriate for adult believers — theological insight, historical/cultural context, and honest life application are all welcome.
- Language should be respectful, clear formal Sinhala — not colloquial or childlike, but never archaic. No English or Singlish.
- "story_slides" (if requested): exactly 5 paragraphs of 3-5 sentences each. Go beyond surface narrative — explore characters' motivations, theological significance, and what this passage reveals about God's character or plan.
- "quiz_questions" (if requested): 3 deep, open-ended discussion questions for a group of adults. These should invite personal reflection and shared experience — not simple recall. At least one question should connect the passage directly to a real challenge adults face today.
- "title": a warm, thoughtful Sinhala title suitable for adult study (may be slightly more literary than a children's title, but still concise — under 8 words).`,
};

// ---------------------------------------------------------------------------
// Gemini system prompt — adapts to age group AND requested sections
// ---------------------------------------------------------------------------

function buildSystemPrompt(ageGroup: AgeGroup, sections: LessonSections): string {
  const requestedFields: string[] = [
    `"title": short Sinhala title (always required)`,
    `"bible_verse": Sinhala rendering of one real relevant verse with reference (always required)`,
  ];
  const jsonShape: Record<string, string> = {
    title: "string in Sinhala",
    bible_verse: "string in Sinhala",
  };

  if (sections.story) {
    requestedFields.push(`"story_slides": array of Sinhala paragraphs telling the story/lesson`);
    jsonShape.story_slides = '["string in Sinhala", ...]';
  }
  if (sections.quiz) {
    requestedFields.push(`"quiz_questions": array of 3 Sinhala discussion/recall questions`);
    jsonShape.quiz_questions = '["string in Sinhala", "string in Sinhala", "string in Sinhala"]';
  }
  if (sections.image) {
    requestedFields.push(`"image_prompt": vivid English prompt for an AI image generator`);
    jsonShape.image_prompt = "string in English";
  }

  const audienceWord = ageGroup === "adult" ? "adult students" : "children";

  return `You are an expert, warm-hearted Christian Sunday School curriculum writer serving Sinhala-speaking ${audienceWord} in Sri Lanka, in Protestant congregations.

You will receive a short idea, topic, or Bible passage from a teacher. It may be written in Sinhala, Singlish, or English. Produce ONE structured Sunday School lesson tailored to the given audience.

${AGE_GROUP_GUIDANCE[ageGroup]}

STRICT OUTPUT RULES:
- Respond with ONLY a single valid JSON object. No markdown, no code fences, no commentary.
- Only include the fields listed below — do not add extra fields.
- All Sinhala fields must be written in clean, grammatically correct Sinhala. Never mix in English or Singlish.
- Only reference books from the Protestant 66-book canon (39 OT + 27 NT). Never reference Apocrypha.
- "bible_verse": your own natural Sinhala rendering, consistent with the ROV (Sri Lanka Bible Society, 1995) tradition — NOT a verbatim quotation of that copyrighted text. Format: verse text — book name chapter:verse in Sinhala.
${sections.image ? `- "image_prompt": detailed English description for an AI image generator — beautiful, warm, Pixar-style 3D animated art, no text or letters anywhere in the image.` : ""}

REQUESTED FIELDS FOR THIS LESSON:
${requestedFields.map((f) => `- ${f}`).join("\n")}

Return JSON in EXACTLY this shape (include ONLY these keys):
${JSON.stringify(jsonShape, null, 2)}`;
}

// ---------------------------------------------------------------------------
// Gemini model — try each model in order until one works
// ---------------------------------------------------------------------------

const GEMINI_MODELS = [
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
];

function getGeminiModel(ageGroup: AgeGroup, sections: LessonSections) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("MISSING_GEMINI_KEY");
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: GEMINI_MODELS[0],
    systemInstruction: buildSystemPrompt(ageGroup, sections),
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.8,
      maxOutputTokens: 2048,
    },
  });
}

function cleanJsonText(raw: string): string {
  return raw.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function isValidLesson(data: unknown, sections: LessonSections): data is RawGeminiLesson {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (typeof d.title !== "string" || !d.title.trim()) return false;
  if (typeof d.bible_verse !== "string" || !d.bible_verse.trim()) return false;
  if (sections.story) {
    if (!Array.isArray(d.story_slides) || d.story_slides.length === 0) return false;
    if (!d.story_slides.every((s) => typeof s === "string")) return false;
  }
  if (sections.quiz) {
    if (!Array.isArray(d.quiz_questions) || d.quiz_questions.length === 0) return false;
    if (!d.quiz_questions.every((s) => typeof s === "string")) return false;
  }
  if (sections.image) {
    if (typeof d.image_prompt !== "string" || !d.image_prompt.trim()) return false;
  }
  return true;
}

async function generateLessonFromGemini(
  input: string,
  ageGroup: AgeGroup,
  sections: LessonSections
): Promise<RawGeminiLesson> {
  // Try each model in order — whichever the API key has access to will work.
  let lastError: unknown;
  for (const modelName of GEMINI_MODELS) {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("MISSING_GEMINI_KEY");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: buildSystemPrompt(ageGroup, sections),
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.8,
          maxOutputTokens: 2048,
        },
      });
      const result = await model.generateContent(
        `Teacher's idea / topic / Bible passage:\n"""${input}"""`
      );
      const text = cleanJsonText(result.response.text());
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("INVALID_JSON_FROM_MODEL");
      }
      if (!isValidLesson(parsed, sections)) throw new Error("INVALID_LESSON_SHAPE");
      console.log(`✓ Gemini model used: ${modelName}`);
      return parsed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Only fall through to the next model on model-not-found/permission errors.
      // Hard failures (bad key, rate limit, JSON errors) propagate immediately.
      if (
        msg === "MISSING_GEMINI_KEY" ||
        msg === "INVALID_JSON_FROM_MODEL" ||
        msg === "INVALID_LESSON_SHAPE" ||
        msg.includes("API_KEY") ||
        msg.includes("quota") ||
        msg.includes("rate")
      ) {
        throw err;
      }
      console.warn(`Model ${modelName} failed, trying next:`, msg);
      lastError = err;
    }
  }
  throw lastError ?? new Error("All Gemini models failed");
}

// ---------------------------------------------------------------------------
// Hugging Face: SDXL illustration
// ---------------------------------------------------------------------------

const HF_MODEL_URL =
  "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0";

async function generateLessonImage(imagePrompt: string): Promise<string | null> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(HF_MODEL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: imagePrompt, options: { wait_for_model: true } }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      console.error("HuggingFace image gen failed:", res.status, await res.text());
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error("HuggingFace image gen error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req.headers);
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "ඉල්ලීම් ගණන සීමාව ඉක්මවා ඇත. කරුණාකර මඳ වෙලාවක් රැඳී නැවත උත්සාහ කරන්න." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  let body: { input?: unknown; ageGroup?: unknown; sections?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "ඉල්ලීම කියවීමට නොහැකි විය. කරුණාකර නැවත උත්සාහ කරන්න." },
      { status: 400 }
    );
  }

  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) {
    return NextResponse.json(
      { error: "කරුණාකර පාඩම සඳහා කෙටි විස්තරයක් කථා කරන්න හෝ ලියන්න." },
      { status: 400 }
    );
  }
  if (input.length > 2000) {
    return NextResponse.json(
      { error: "විස්තරය ඉතා දීර්ඝයි. කරුණාකර කෙටි කරන්න." },
      { status: 400 }
    );
  }

  const ageGroup: AgeGroup = VALID_AGE_GROUPS.includes(body.ageGroup as AgeGroup)
    ? (body.ageGroup as AgeGroup)
    : "8-10";

  // Parse sections — default all to true so old clients still get full lessons.
  const rawSections = body.sections && typeof body.sections === "object"
    ? (body.sections as Record<string, unknown>)
    : {};
  const sections: LessonSections = {
    story: rawSections.story !== false,
    quiz: rawSections.quiz !== false,
    image: rawSections.image !== false,
  };

  // At least one section must be requested besides the always-included title+verse.
  if (!sections.story && !sections.quiz && !sections.image) {
    return NextResponse.json(
      { error: "කරුණාකර අවම වශයෙන් එක් කොටසක් හෝ තෝරන්න." },
      { status: 400 }
    );
  }

  let lesson: RawGeminiLesson;
  try {
    lesson = await generateLessonFromGemini(input, ageGroup, sections);
  } catch (err) {
    console.error("Gemini generation error:", err);
    const msg = err instanceof Error ? err.message : "";
    const errorText = msg === "MISSING_GEMINI_KEY"
      ? "සේවාදායක සැකසුම් දෝෂයකි. කරුණාකර පසුව උත්සාහ කරන්න."
      : "පාඩම සකස් කිරීමේදී දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.";
    return NextResponse.json({ error: errorText }, { status: 502 });
  }

  const image_url = sections.image && lesson.image_prompt
    ? await generateLessonImage(lesson.image_prompt)
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
