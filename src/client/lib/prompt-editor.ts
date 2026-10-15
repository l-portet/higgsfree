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
import type { ImageAspectRatio, ImageSize, VideoAspectRatio } from "@shared/types";
import type { ChatTextBody, ChatTextPart, NativeImageBody } from "./payloads";

export const PROMPT_EDITOR_MODEL = { id: "openai/gpt-6-luna", name: "GPT-6 Luna" } as const;
export const PREVIEW_IMAGE_MODEL = { id: "openai/gpt-image-2.5-flare", name: "GPT Image 2.5 Flare" } as const;
export const RECREATE_MODEL = { id: "google/gemini-4-argon", name: "Gemini 4 Argon" } as const;
/** The video goes inline as base64 (Gemini's inline limit is 20 MB of request); 15 MB leaves room for the encoding. */
export const MAX_RECREATE_VIDEO_BYTES = 15 * 1024 * 1024;

/** Caps on the reply, leaving room for the (low) reasoning that counts toward them: a rewrite keeps a long
 * prompt's length, and a recreation is as long as the video needs. */
const MAX_TOKENS = 2500;
const RECREATE_MAX_TOKENS = 4000;
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
  "Reply with the prompt only: no preamble, no quotes around it, no markdown, no lists, no notes.",
  "Plain English prose. A rewrite keeps about the current prompt's length and level of detail unless the instruction asks to shorten or expand it.",
  "Cover, when relevant and in this order: the subject and what it does, the setting, the camera (shot size and movement), lighting and mood, and the visual style.",
  "Describe what happens over the clip's length as one continuous shot, unless asked for cuts or the current prompt already has them.",
  "Keep everything the current prompt specifies unless the instruction changes it. Keep names, quoted text and brands exactly as written.",
  "Keep every spoken line (dialogue in quotes) word for word, with who says it, how and when, unless the instruction changes it.",
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
    if (s.length > 1 && s.startsWith(open) && s.endsWith(close)) {
      const inner = s.slice(open.length, -close.length);
      // Only a pair that wraps the whole reply: a prompt that opens and ends on dialogue keeps its quotes.
      if (!inner.includes(open) && !inner.includes(close)) s = inner.trim();
    }
  }
  return s.slice(0, MAX_PROMPT_CHARS);
}

// ---------- Recreate video ----------

export const RECREATE_SYSTEM_PROMPT = [
  "You watch a video and write the prompt that would make an AI video generation model recreate it as closely as possible.",
  "Reply with the prompt only: no preamble, no quotes around it, no markdown, no headings, no lists, no notes.",
  "Write rich, concrete, flowing prose, as long as the video needs to be recreated faithfully and no longer.",
  "Describe only what is actually in the video, and leave nothing important out.",
  "People and characters: apparent age, build, hair, clothing with colors and materials, expressions, gestures and how they move. Objects and props: what they are, their colors, textures and positions.",
  "The setting: the place, time of day, weather, background details and the depth of the space.",
  "The camera: shot size, angle, lens feel and depth of field, and every movement (pan, tilt, dolly, handheld shake, zoom) with its direction and speed.",
  "Light and look: light sources, direction, quality and color, the mood, the visual style (live action, animation, film grain, color grade), and the motion feel (real time, slow motion, time-lapse).",
  "Tell the action in order, beat by beat, with rough timing (in the first second, at about three seconds, at the end); follow the video's own structure, and when it cuts, describe each shot in order and say where it cuts.",
  "Keep every spoken line, including voice-over and narration, word for word in double quotes, in the language it is spoken in, and say who speaks it (by a short description, never a real name), how (tone, volume, accent, emotion) and when. Never invent or paraphrase a line; when speech is unclear, describe it instead (muffled chatter, an unintelligible shout).",
  "Sound: ambient sound and sound effects as they happen, and the music by genre, tempo, instruments and mood. Do not transcribe song lyrics or name songs or artists.",
  "Quote on-screen text that is part of the scene (a sign, a title card) exactly; leave out watermarks, platform overlays and subtitles that only repeat the speech.",
  "Do not name real people, brands or copyrighted characters; describe them generically.",
  "The prompt is for a clip of the given length: when the video is longer, keep the stretch that matters most, with its action and the lines spoken in it, and leave out the rest.",
  "When the instruction asks for a change (another subject, setting, style, camera or line), write the prompt for the changed video and keep everything else exactly as in the original, dialogue included.",
  "Write in the language of the instruction, or in English when there is none; quoted lines stay in the language they are spoken in.",
].join(" ");

/** The instruction used when the user asks for the prompt without saying more. */
export const DEFAULT_RECREATE_INSTRUCTION = "Write the prompt that recreates this video as closely as possible, with every detail that matters and every spoken line word for word.";

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
    max_tokens: RECREATE_MAX_TOKENS,
    reasoning: { effort: "low", exclude: true },
    usage: { include: true },
  };
}

/** The ratios GPT Image 2.5 Flare takes. */
const PREVIEW_ASPECTS: readonly ImageAspectRatio[] = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"];

export const STORYBOARD_FRAMES = 6;

/** How the six frames sit in the one preview picture: the picture's ratio and the grid. */
export interface StoryboardLayout {
  canvas: ImageAspectRatio;
  cols: 2 | 3;
  rows: 2 | 3;
}

const ratioOf = (r: string): number => {
  const [w, h] = r.split(":").map(Number);
  return w && h ? w / h : 16 / 9;
};

/**
 * The grid and picture whose frames come closest to the video's own shape: a landscape video gets 2 columns of
 * 3 rows on a 4:3 picture (2:1 frames), a portrait one 3 columns of 2 rows on 3:4 (1:2 frames), a square one
 * 3 × 2 on 3:2 (square frames). A frame's ratio is the picture's times rows over columns.
 */
export function storyboardLayout(ar: VideoAspectRatio | undefined): StoryboardLayout {
  const target = Math.log(ratioOf(ar ?? "16:9"));
  let best: StoryboardLayout = { canvas: "4:3", cols: 2, rows: 3 };
  let bestDiff = Infinity;
  for (const canvas of PREVIEW_ASPECTS) {
    for (const [cols, rows] of [[2, 3], [3, 2]] as const) {
      const diff = Math.abs(Math.log((ratioOf(canvas) * rows) / cols) - target);
      if (diff < bestDiff - 1e-9) {
        bestDiff = diff;
        best = { canvas, cols, rows };
      }
    }
  }
  return best;
}

// ---------- the preview's configuration ----------

export type PreviewQuality = NonNullable<NativeImageBody["quality"]>;

/** A model the preview can run on: its options as OpenRouter's image catalog lists them (15 Oct 2026). */
export interface PreviewModel {
  id: string;
  name: string;
  /** One line for the picker. */
  note: string;
  qualities?: readonly PreviewQuality[];
  resolutions?: readonly ImageSize[];
}

/** Every one of these takes the grid's ratios (1:1, 3:2, 2:3, 4:3, 3:4, 16:9, 9:16, 21:9) and reference images. */
export const PREVIEW_MODELS: readonly PreviewModel[] = [
  { id: PREVIEW_IMAGE_MODEL.id, name: PREVIEW_IMAGE_MODEL.name, note: "Fastest, priced per token", qualities: ["auto", "low", "medium", "high", "xhigh", "max"] },
  { id: "openai/gpt-image-2.5-sunburst", name: "GPT Image 2.5 Sunburst", note: "More detail, slower", qualities: ["auto", "low", "medium", "high", "xhigh", "max"] },
  { id: "google/gemini-nano-banana-2.1", name: "Nano Banana 2.1", note: "Keeps characters consistent", resolutions: ["1K", "2K", "4K"] },
  { id: "bytedance-seed/seedream-5-0-flash", name: "Seedream 5.0 Flash", note: "Flat $0.018 per picture", resolutions: ["1K", "2K"] },
];

export const previewModel = (id: string): PreviewModel => PREVIEW_MODELS.find((m) => m.id === id) ?? (PREVIEW_MODELS[0] as PreviewModel);

/** The storyboard instructions; `{frames}`, `{columns}` and `{rows}` are filled in for each picture. */
export const DEFAULT_STORYBOARD_INSTRUCTIONS = [
  "A storyboard of {frames} frames from one video, in a grid of {columns} columns and {rows} rows, read left to right and top to bottom.",
  "The frames run in order from the first moment of the shot to the last, evenly spaced in time, so the grid shows how the video unfolds: the action and the camera move progress from frame to frame.",
  "The same subjects, setting, lighting and style in every frame, like stills from one continuous take.",
  "Thin, even gaps between the frames; no numbers, captions, labels, text or borders.",
].join(" ");

const MAX_INSTRUCTIONS_CHARS = 4000;

export interface PreviewConfig {
  model: string;
  /** GPT Image models. */
  quality?: PreviewQuality;
  /** Nano Banana, Seedream. */
  resolution?: ImageSize;
  /** Send the attached first frame (or character image) as a reference, and ask for it as the first panel. */
  useReference: boolean;
  instructions: string;
}

export const DEFAULT_PREVIEW_CONFIG: PreviewConfig = { model: PREVIEW_IMAGE_MODEL.id, quality: "low", useReference: true, instructions: DEFAULT_STORYBOARD_INSTRUCTIONS };

/** A model's own default: GPT Image at low quality, the others at their smallest resolution. */
function modelDefaults(m: PreviewModel): Pick<PreviewConfig, "quality" | "resolution"> {
  return m.qualities ? { quality: "low" } : m.resolutions ? { resolution: m.resolutions[0] } : {};
}

/** Whatever was stored (or edited) as a valid config: a known model, an option that model lists, real instructions. */
export function normalizePreviewConfig(raw: unknown): PreviewConfig {
  const o = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const model = previewModel(typeof o.model === "string" ? o.model : DEFAULT_PREVIEW_CONFIG.model);
  const out: PreviewConfig = {
    model: model.id,
    useReference: o.useReference !== false,
    instructions: typeof o.instructions === "string" && o.instructions.trim() ? o.instructions.slice(0, MAX_INSTRUCTIONS_CHARS) : DEFAULT_STORYBOARD_INSTRUCTIONS,
    ...modelDefaults(model),
  };
  if (model.qualities?.includes(o.quality as PreviewQuality)) out.quality = o.quality as PreviewQuality;
  if (model.resolutions?.includes(o.resolution as ImageSize)) out.resolution = o.resolution as ImageSize;
  return out;
}

/** Switch model, keeping what still applies and taking the new model's defaults for the rest. */
export function withPreviewModel(config: PreviewConfig, id: string): PreviewConfig {
  const { quality: _q, resolution: _r, ...rest } = config;
  return normalizePreviewConfig({ ...rest, model: id, ...modelDefaults(previewModel(id)) });
}

const fill = (template: string, values: Record<string, number>): string => template.replace(/\{(frames|columns|rows)\}/g, (_, k: string) => String(values[k]));

/**
 * One picture with six frames of the shot in a grid, from its first moment to its last, to preview how the
 * video unfolds, run as the configuration says; with the first frame as a reference (and the first panel)
 * when one is attached and the configuration uses it.
 */
export function buildPreviewBody(prompt: string, layout: StoryboardLayout, config: PreviewConfig = DEFAULT_PREVIEW_CONFIG, referenceDataUrl?: string): NativeImageBody {
  const model = previewModel(config.model);
  const ref = config.useReference ? referenceDataUrl : undefined;
  const lead = fill(config.instructions.trim() || DEFAULT_STORYBOARD_INSTRUCTIONS, { frames: STORYBOARD_FRAMES, columns: layout.cols, rows: layout.rows });
  const body: NativeImageBody = {
    model: model.id,
    prompt: `${lead}${ref ? " The first frame matches the reference image." : ""}\n\nThe video:\n${prompt.trim()}`,
    aspect_ratio: layout.canvas,
  };
  if (model.qualities && config.quality && model.qualities.includes(config.quality)) body.quality = config.quality;
  if (model.resolutions && config.resolution && model.resolutions.includes(config.resolution)) body.resolution = config.resolution;
  if (ref) body.input_references = [{ type: "image_url", image_url: { url: ref } }];
  return body;
}
