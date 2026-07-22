/**
 * app/api/generate-lesson/route.ts  v2.0
 *
 * Key fix: Google Auth keys (AQ.Ab...) need Authorization: Bearer header.
 * Standard keys (AIza...) use ?key= query param. Auto-detected.
 *
 * New output fields:
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
// Auth — auto-detect key type
// ---------------------------------------------------------------------------

function buildFetchArgs(
  apiKey: string,
  model: string,
  body: object
): { url: string; headers: Record<string, string> } {
  const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
  const isAuthKey = apiKey.startsWith("AQ.");
  return {
    url: isAuthKey
      ? `${BASE}/${model}:generateContent`
      : `${BASE}/${model}:generateContent?key=${apiKey}`,
    headers: {
      "Content-Type": "application/json",
      ...(isAuthKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Models — 2026 priority order
// ---------------------------------------------------------------------------

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite-preview-06-17",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
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
- All Sinhala fields: grammatically correct pure Sinhala. No English, no Singlish mixed in.
- Protestant 66-book canon only (39 OT + 27 NT). Never reference Apocrypha.
- "bible_verse": your own Sinhala rendering in the spirit of the ROV (Sri Lanka Bible Society 1995) — do NOT claim to reproduce that copyrighted text verbatim. Format: verse text — book name chapter:verse in Sinhala.
- "memory_verse": derived from the same verse, condensed or restated — age-appropriate, easily memorised.

REQUIRED FIELDS:
${all.map((f) => `- ${f}`).join("\n")}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValid(data: unknown, sections: LessonSections): data is RawGeminiLesson {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (typeof d.title !== "string" || !d.title.trim()) return false;
  if (typeof d.bible_verse !== "string" || !d.bible_verse.trim()) return false;
  if (typeof d.memory_verse !== "string") return false;
  if (sections.story && (!Array.isArray(d.story_slides) || d.story_slides.length === 0)) return false;
  if (sections.quiz && (!Array.isArray(d.quiz_questions) || d.quiz_questions.length === 0)) return false;
  if (sections.activities && (!Array.isArray(d.activity_ideas) || d.activity_ideas.length === 0)) return false;
  if (sections.image && (typeof d.image_prompt !== "string" || !d.image_prompt.trim())) return false;
  return true;
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
    generationConfig: { responseMimeType: "application/json", temperature: 0.85, maxOutputTokens: 2560 },
  };

  let lastStatus = 0;
  let lastBody = "";

  for (const model of GEMINI_MODELS) {
    const { url, headers } = buildFetchArgs(apiKey, model, requestBody);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      console.warn(`[Gemini] ${model} fetch error:`, err);
      continue;
    }

    lastStatus = res.status;
    const text = await res.text();
    lastBody = text;

    if (!res.ok) {
      // 400 = bad request (bad key/format) or quota → stop immediately
      if (res.status === 400 || res.status === 429 || res.status === 403) {
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
        console.warn(`[Gemini] ${model} invalid shape, trying next`);
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
    if (!res.ok) { console.error("[HuggingFace] failed:", res.status); return null; }
    const buf = await res.arrayBuffer();
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch (err) {
    console.error("[HuggingFace] error:", err);
    return null;
  }
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
      : msg.includes("403") || msg.includes("400")
      ? "Gemini API key වලංගු නැත. AI Studio හි නව Auth key (AQ.Ab...) සාදා Vercel ට දොහළ key update කරන්න."
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
