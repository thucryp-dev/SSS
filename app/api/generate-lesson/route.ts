/**
 * app/api/generate-lesson/route.ts
 *
 * POST /api/generate-lesson
 * Body: { input: string, ageGroup: "5-7" | "8-10" | "11-12" }
 *
 * 1. Sends the teacher's spoken/typed idea — plus the selected child age
 *    band — to Gemini, instructed to return one strict JSON lesson object
 *    tailored to that age's vocabulary/complexity (Sinhala content
 *    fields, English image prompt field).
 * 2. Sends that image_prompt to a Hugging Face SDXL endpoint to generate an
 *    illustration, returned to the client as a base64 data URI (no storage
 *    bucket required).
 * 3. Returns a single LessonData object the frontend can render directly.
 *
 * Required environment variables (.env.local):
 *   GEMINI_API_KEY=
 *   HUGGINGFACE_API_KEY=
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { type NextRequest, NextResponse } from "next/server";

import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Buffer + a generous timeout are needed for image generation -> Node runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgeGroup = "5-7" | "8-10" | "11-12";
const VALID_AGE_GROUPS: readonly AgeGroup[] = ["5-7", "8-10", "11-12"];

interface RawGeminiLesson {
  title: string;
  bible_verse: string;
  story_slides: string[];
  quiz_questions: string[];
  image_prompt: string;
}

interface LessonResponse {
  title: string;
  bible_verse: string;
  story_slides: string[];
  quiz_questions: string[];
  image_url: string | null;
  age_group: AgeGroup;
}

// ---------------------------------------------------------------------------
// Gemini: structured lesson generation
// ---------------------------------------------------------------------------

/**
 * Per-age guidance injected into the system prompt: vocabulary level,
 * sentence complexity, story length, and the kind of quiz question that's
 * developmentally appropriate. Keeping this as a single source of truth
 * (rather than three near-duplicate full prompts) makes it easy to tune
 * one band without risking a copy-paste drift in the others.
 */
const AGE_GROUP_GUIDANCE: Record<AgeGroup, string> = {
  "5-7": `TARGET AGE: 5-7 years old (pre-readers / earliest readers).
- Use only the simplest, most concrete Sinhala words a 5-year-old already knows in daily speech. No abstract or formal vocabulary.
- Sentences must be very short (roughly 5-8 words), one simple idea per sentence. Repetition of key words/phrases is good and helps young listeners follow along.
- Favor concrete sensory details a child can picture: colors, animals, sounds, simple actions.
- "story_slides" should be exactly 4 short paragraphs, each just 1-2 very short sentences.
- "quiz_questions" should be extremely simple recall questions about concrete details from the story (e.g. asking what color/animal/number appeared), answerable in one word.`,
  "8-10": `TARGET AGE: 8-10 years old (early elementary, confident readers).
- Use clear, simple Sinhala with a moderately richer vocabulary than you'd use for a 5-year-old, but still everyday words — nothing formal or literary.
- Sentences can have two simple clauses, but stay short and easy to follow.
- "story_slides" should be exactly 5 paragraphs, 2-3 sentences each.
- "quiz_questions" can ask the child to briefly explain what happened and why (not just recall a single fact), in their own words.`,
  "11-12": `TARGET AGE: 11-12 years old (preteens).
- Use richer vocabulary and slightly more complex sentence structure appropriate for a preteen — still completely clear, simple, and free of English/Singlish, but you may use more descriptive language and convey characters' feelings/motivations.
- "story_slides" should be exactly 6 paragraphs, 2-4 sentences each.
- "quiz_questions" should include at least one open-ended question that connects the story's lesson to the child's own life or choices, not just recall.`,
};

function buildSystemPrompt(ageGroup: AgeGroup): string {
  return `You are an expert, warm-hearted Christian Sunday School curriculum writer who writes exclusively for Sinhala-speaking children in Sri Lanka, serving Protestant congregations.

You will receive a short idea, topic, or Bible passage from a teacher, plus the target age band of the children in the class. It may be written in Sinhala, Singlish, or English. Analyze it and produce ONE complete, structured children's Sunday School lesson tailored specifically to the given age band.

${AGE_GROUP_GUIDANCE[ageGroup]}

STRICT OUTPUT RULES:
- Respond with ONLY a single valid JSON object. No markdown, no code fences, no commentary before or after the JSON.
- Every field that will be shown to the teacher or child ("title", "bible_verse", "story_slides", "quiz_questions") MUST be written in clean, simple, grammatically correct, child-friendly SINHALA appropriate for the target age band above. Never mix in English words or Singlish.
- The "image_prompt" field is the only exception: it MUST be written in detailed, vivid ENGLISH for an AI image generator. Describe the scene in a beautiful, warm, Pixar-style 3D animated art style, suitable for young children, with soft lighting and no text or letters anywhere in the image.
- Only reference books from the Protestant 66-book canon (39 Old Testament + 27 New Testament). Never reference Apocrypha/deuterocanonical books (e.g. Tobit, Judith, Wisdom, Sirach, Baruch, 1-2 Maccabees).
- "bible_verse" must be your own natural Sinhala rendering of one real, age-appropriate verse directly relevant to the lesson's theme, written in vocabulary and tone consistent with the Sinhala Revised Old Version (ROV, Sri Lanka Bible Society, 1995) tradition — but you are NOT reproducing that specific copyrighted publication verbatim, and must not imply you are. Format as: the verse text, an em dash, then the book name and chapter:verse reference written in Sinhala.
- "story_slides" must tell the Bible story or lesson in an engaging, chronological way (see the exact paragraph count and length in the age guidance above), ending with a clear moral takeaway a child of this age can apply.
- "quiz_questions" must contain exactly 3 questions, in the style described in the age guidance above, that a teacher can ask the class out loud.
- "title" must be a short, warm, inviting Sinhala title for the lesson (under 8 words).

Return JSON in EXACTLY this shape and these keys:
{
  "title": "string in Sinhala",
  "bible_verse": "string in Sinhala",
  "story_slides": ["string in Sinhala", "string in Sinhala"],
  "quiz_questions": ["string in Sinhala", "string in Sinhala", "string in Sinhala"],
  "image_prompt": "string in English"
}`;
}

function getGeminiModel(ageGroup: AgeGroup) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("MISSING_GEMINI_KEY");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    // NOTE: update this to whichever current Gemini model your API key has
    // access to — check Google AI Studio for the latest model id.
    model: "gemini-2.0-flash",
    systemInstruction: buildSystemPrompt(ageGroup),
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.8,
      maxOutputTokens: 2048,
    },
  });
}

/** Strips accidental ```json fences in case the model ignores responseMimeType. */
function cleanJsonText(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function isValidLesson(data: unknown): data is RawGeminiLesson {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.title === "string" &&
    d.title.trim().length > 0 &&
    typeof d.bible_verse === "string" &&
    d.bible_verse.trim().length > 0 &&
    Array.isArray(d.story_slides) &&
    d.story_slides.length > 0 &&
    d.story_slides.every((s) => typeof s === "string") &&
    Array.isArray(d.quiz_questions) &&
    d.quiz_questions.length > 0 &&
    d.quiz_questions.every((s) => typeof s === "string") &&
    typeof d.image_prompt === "string" &&
    d.image_prompt.trim().length > 0
  );
}

async function generateLessonFromGemini(input: string, ageGroup: AgeGroup): Promise<RawGeminiLesson> {
  const model = getGeminiModel(ageGroup);
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

  if (!isValidLesson(parsed)) {
    throw new Error("INVALID_LESSON_SHAPE");
  }

  return parsed;
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
      body: JSON.stringify({
        inputs: imagePrompt,
        options: { wait_for_model: true },
      }),
      // Cold SDXL models can take a while to spin up — give this room,
      // but don't let one slow image generation hang the whole request forever.
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      console.error("Hugging Face image generation failed:", res.status, await res.text());
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.error("Hugging Face image generation error:", err);
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
      {
        error:
          "ඉල්ලීම් ගණන සීමාව ඉක්මවා ඇත. කරුණාකර මඳ වෙලාවක් රැඳී නැවත උත්සාහ කරන්න.",
      },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  let body: { input?: unknown; ageGroup?: unknown };
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

  // Validate age group — default to "8-10" if omitted (e.g. an old client
  // version that doesn't send the field yet) rather than rejecting the request.
  const ageGroup: AgeGroup = VALID_AGE_GROUPS.includes(body.ageGroup as AgeGroup)
    ? (body.ageGroup as AgeGroup)
    : "8-10";

  let lesson: RawGeminiLesson;
  try {
    lesson = await generateLessonFromGemini(input, ageGroup);
  } catch (err) {
    console.error("Gemini generation error:", err);
    const message =
      err instanceof Error && err.message === "MISSING_GEMINI_KEY"
        ? "සේවාදායක සැකසුම් දෝෂයකි. කරුණාකර පසුව උත්සාහ කරන්න."
        : "පාඩම සකස් කිරීමේදී දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Image generation failure should never block the text lesson from
  // reaching the teacher — fall back to image_url: null and let the UI
  // show a placeholder.
  const image_url = await generateLessonImage(lesson.image_prompt);

  const response: LessonResponse = {
    title: lesson.title,
    bible_verse: lesson.bible_verse,
    story_slides: lesson.story_slides,
    quiz_questions: lesson.quiz_questions,
    image_url,
    age_group: ageGroup,
  };

  return NextResponse.json(response, { status: 200 });
}
