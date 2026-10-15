/**
 * The video composer's AI Prompt Editor: which models it uses and the request bodies it sends.
 * Pure (no fetch, no DOM) so it can be unit tested; the calls are in `api.ts`.
 *
 * Models, from OpenRouter's live catalogs (docs/MODELS.md):
 * - GPT-6 Luna (Sep 2026): the fast, cost-efficient tier of GPT-6 ($0.05 / $0.25 per million tokens).
 * - GPT Image 2.5 Flare (Sep 2026): the speed tier of GPT Image 2.5, asked for `quality: "low"`.
 * - Gemini 4 Argon (13 Oct 2026): the newest Gemini that takes video input, for "Recreate video"; a
 *   flagship reasoning model, asked for low reasoning effort. Gemini 3.8 Flash is the cheaper swap.
 */
import type { ImageAspectRatio, VideoAspectRatio } from "@shared/types";
import type { ChatTextBody, ChatTextPart, NativeImageBody } from "./payloads";

export const PROMPT_EDITOR_MODEL = { id: "openai/gpt-6-luna", name: "GPT-6 Luna" } as const;
export const PREVIEW_IMAGE_MODEL = { id: "openai/gpt-image-2.5-flare", name: "GPT Image 2.5 Flare" } as const;
export const RECREATE_MODEL = { id: "google/gemini-4-argon", name: "Gemini 4 Argon" } as const;
/** The video goes inline as base64 (Gemini's inline limit is 20 MB of request); 15 MB leaves room for the encoding. */
export const MAX_RECREATE_VIDEO_BYTES = 15 * 1024 * 1024;

/** A rewrite is one paragraph; the cap leaves room for the (low) reasoning that counts toward it. */
const MAX_TOKENS = 1500;
export const MAX_PROMPT_CHARS = 8000;

/** What the composer is set to, so the rewrite fits the run it is for. */
export interface RewriteContext {
  modelName?: string;
  /** Seconds; absent for motion control (the reference video sets it). */
  duration?: number;
  aspectRatio?: VideoAspectRatio;
  /** A first frame is attached: describe motion, not the picture. */
  startsFromImage?: boolean;
  /** Motion control: a character image moves like a reference video. */
  motionControl?: boolean;
}

export const REWRITE_SYSTEM_PROMPT = [
  "You write and rewrite prompts for AI video generation models.",
  "Reply with the prompt only: no preamble, no quotes, no markdown, no lists, no notes.",
  "One paragraph of plain English, usually 40 to 120 words.",
  "Cover, when relevant and in this order: the subject and what it does, the setting, the camera (shot size and movement), lighting and mood, and the visual style.",
  "Describe what happens over the clip's length as one continuous shot, unless asked for cuts.",
  "Keep everything the current prompt specifies unless the instruction changes it. Keep names, quoted text and brands exactly as written.",
  "Do not add on-screen text, captions, logos or watermarks unless asked.",
  "When the video starts from an image, describe the motion, camera and changes rather than re-describing the image.",
  "Write in the language of the current prompt (or of the instruction when there is no prompt yet).",
].join(" ");

/** The instruction used when the user just presses Rewrite. */
export const DEFAULT_INSTRUCTION = "Improve it: make it vivid, specific and filmable, and keep the intent.";

function describeRun(ctx: RewriteContext): string {
  const parts: string[] = [];
  if (ctx.modelName) parts.push(ctx.modelName);
  if (ctx.motionControl) parts.push("motion control: a character image moves like a reference video, which also sets the length");
  else {
    if (ctx.duration) parts.push(`${ctx.duration} s`);
    if (ctx.aspectRatio) parts.push(ctx.aspectRatio);
  }
  if (ctx.startsFromImage && !ctx.motionControl) parts.push("starts from an attached image (first frame)");
  return parts.join(" · ");
}

export function buildRewriteBody(prompt: string, instruction: string, ctx: RewriteContext = {}): ChatTextBody {
  const current = prompt.trim();
  const ask = instruction.trim() || DEFAULT_INSTRUCTION;
  const run = describeRun(ctx);
  const user = [
    run ? `Video: ${run}` : "",
    current ? `Current prompt:\n"""\n${current}\n"""` : "Current prompt: (empty, write a new one from the instruction)",
    `Instruction: ${ask}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    model: PROMPT_EDITOR_MODEL.id,
    messages: [
      { role: "system", content: REWRITE_SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    stream: true,
    max_tokens: MAX_TOKENS,
    reasoning: { effort: "low", exclude: true },
    usage: { include: true },
  };
}

/**
 * The model's reply as a prompt: a code fence, a "Prompt:" label or wrapping quotes some models add
 * despite the instructions are taken off. Also used on the partial text while it streams.
 */
export function cleanRewrite(text: string): string {
  let s = text.trim();
  s = s.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "");
  s = s.replace(/^(?:\*\*)?(?:prompt|rewritten prompt|video prompt)\s*:(?:\*\*)?\s*/i, "");
  const pairs: [string, string][] = [['"', '"'], ["“", "”"], ["'", "'"]];
  for (const [open, close] of pairs) {
    if (s.length > 1 && s.startsWith(open) && s.endsWith(close)) s = s.slice(open.length, -close.length).trim();
  }
  return s.slice(0, MAX_PROMPT_CHARS);
}

// ---------- Recreate video ----------

export const RECREATE_SYSTEM_PROMPT = [
  "You watch a short video and write the prompt that would make an AI video generation model recreate it.",
  "Reply with the prompt only: no preamble, no quotes, no markdown, no lists, no notes.",
  "One paragraph of plain English, usually 60 to 150 words.",
  "Describe what is actually in the video, in this order: the subject and what it does, the setting, the camera (shot size, angle and movement, cuts if any), lighting and mood, the visual style (film look, animation, color grade), and the pacing.",
  "Be concrete about motion and timing: what moves, how fast, and what changes from the first second to the last.",
  "The prompt is for a clip of the given length: when the video is longer, describe its most characteristic stretch of that length as one continuous shot.",
  "Do not name real people, brands or copyrighted characters; describe them generically.",
  "Do not mention on-screen text, captions, logos or watermarks unless they are part of the shot.",
  "When the instruction asks for a change (another subject, setting, style or camera), write the prompt for the changed video and keep everything else as in the original.",
  "Write in the language of the instruction, or in English when there is none.",
].join(" ");

/** The instruction used when the user asks for the prompt without saying more. */
export const DEFAULT_RECREATE_INSTRUCTION = "Write the prompt that recreates this video as closely as possible.";

/** The video as a data URL plus what the composer is set to, so the prompt fits the run it is for. */
export function buildRecreateBody(videoDataUrl: string, instruction: string, ctx: RewriteContext = {}): ChatTextBody {
  const ask = instruction.trim() || DEFAULT_RECREATE_INSTRUCTION;
  const run = describeRun(ctx);
  const text = [run ? `The prompt is for: ${run}` : "", `Instruction: ${ask}`].filter(Boolean).join("\n\n");
  const content: ChatTextPart[] = [
    { type: "text", text },
    // `static`: one pass at a fixed frame rate, the fast mode for a short clip.
    { type: "video_url", video_url: { url: videoDataUrl, processing: "static" } },
  ];
  return {
    model: RECREATE_MODEL.id,
    messages: [
      { role: "system", content: RECREATE_SYSTEM_PROMPT },
      { role: "user", content },
    ],
    stream: true,
    max_tokens: MAX_TOKENS,
    reasoning: { effort: "low", exclude: true },
    usage: { include: true },
  };
}

/** The ratios GPT Image 2.5 Flare takes; the video's ratio when it is one of them, else the closest. */
const PREVIEW_ASPECTS: readonly ImageAspectRatio[] = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"];

export function previewAspect(ar: VideoAspectRatio | undefined): ImageAspectRatio {
  if (!ar) return "16:9";
  if ((PREVIEW_ASPECTS as readonly string[]).includes(ar)) return ar as ImageAspectRatio;
  const [w, h] = ar.split(":").map(Number);
  const target = w && h ? w / h : 16 / 9;
  let best: ImageAspectRatio = "16:9";
  let bestDiff = Infinity;
  for (const a of PREVIEW_ASPECTS) {
    const [aw, ah] = a.split(":").map(Number);
    const diff = Math.abs(Math.log((aw ?? 1) / (ah ?? 1)) - Math.log(target));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = a;
    }
  }
  return best;
}

/** A still that shows the look of the shot; with the first frame as a reference when one is attached. */
export function buildPreviewBody(prompt: string, aspect: ImageAspectRatio, referenceDataUrl?: string): NativeImageBody {
  const lead = referenceDataUrl
    ? "A single still frame from a video that starts from the reference image, a few seconds in. No captions or borders."
    : "A single still frame from the video shot described below, a few seconds in. No captions or borders.";
  const body: NativeImageBody = { model: PREVIEW_IMAGE_MODEL.id, prompt: `${lead}\n\n${prompt.trim()}`, aspect_ratio: aspect, quality: "low" };
  if (referenceDataUrl) body.input_references = [{ type: "image_url", image_url: { url: referenceDataUrl } }];
  return body;
}
