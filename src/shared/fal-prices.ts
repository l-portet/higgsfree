/**
 * fal's list prices for every endpoint the catalog routes to, as each endpoint's page
 * (`fal.ai/models/<endpoint>/llms.txt`) gave them on 15 Oct 2026. They are the app's estimates for runs on
 * fal, as `estCostUsd` / `estCostPerSecUsd` are for OpenRouter. fal has no public catalog to refresh them
 * from: its pricing API needs a key and gives one unit price per endpoint, without the resolution, audio
 * and quality tiers below. `src/client/lib/fal-pricing.ts` prices a request with them.
 */
import type { ImageAspectRatio, ImageSize, VideoResolution } from "./types.ts";

/** USD, the same at every resolution or by the app's resolution (fal's value when it differs is noted). */
export type ByResolution = number | Partial<Record<VideoResolution, number>>;

export type FalPrice =
  | {
      /** Per second of output video. */
      unit: "second";
      usd: ByResolution;
      /** With the audio track on, when it costs more. */
      audioUsd?: ByResolution;
      /** A limited-time rate, used up to and including `until` (YYYY-MM-DD, UTC). */
      promo?: { until: string; usd: ByResolution };
    }
  | {
      unit: "image";
      usd: number | Partial<Record<ImageSize, number>>;
      /** When the price depends on the output size: by the aspect ratio the app asks for (`auto`: fal's default size). */
      byAspect?: Partial<Record<ImageAspectRatio, number>>;
      /** Each reference image sent is billed on top, for every image made (Seedream 5.5's edits). */
      inputImageUsd?: number;
    }
  | {
      /** Per megapixel of output (1024 x 1024 pixels), rounded up, at least one. */
      unit: "megapixel";
      usd: number;
    };

const NANO_BANANA_PRO: FalPrice = { unit: "image", usd: { "1K": 0.15, "2K": 0.15, "4K": 0.3 } };
const NANO_BANANA_2: FalPrice = { unit: "image", usd: { "1K": 0.08, "2K": 0.12, "4K": 0.16 } };
// Billed in tokens at high quality (fal's default); these are fal's per-size figures for high.
const GPT_IMAGE_2: FalPrice = {
  unit: "image",
  usd: 0.211,
  byAspect: { auto: 0.145, "1:1": 0.211, "4:3": 0.145, "3:4": 0.145, "3:2": 0.165, "2:3": 0.165, "16:9": 0.158, "9:16": 0.158 },
};
// High quality (fal's default): 1024 x 1024 (also the default size) or any other size.
const GPT_IMAGE_1_5: FalPrice = { unit: "image", usd: 0.2, byAspect: { auto: 0.133, "1:1": 0.133 } };
// Read 13 Nov 2026: up to 2.61 MP (1K, and fal's 1.5K) or above it (2K). Edits add $0.012 for each reference image.
const SEEDREAM_5_5: FalPrice = { unit: "image", usd: { "1K": 0.03, "2K": 0.0405 } };
const KLING_V3_PRO: FalPrice = { unit: "second", usd: 0.112, audioUsd: 0.168 };
const KLING_V3_STANDARD: FalPrice = { unit: "second", usd: 0.084, audioUsd: 0.126 };
// The US-hosted endpoints (read 22 Oct 2026), 20% above the ones fal stopped listing.
const SEEDANCE_2_5: FalPrice = { unit: "second", usd: { "480p": 0.2646, "720p": 0.5676, "1080p": 1.396278 } };
const MINIMAX_H3: FalPrice = { unit: "second", usd: { "480p": 0.05, "768p": 0.06, "2K": 0.13, "4K": 0.16 } };
const MINIMAX_H3_MAX: FalPrice = {
  unit: "second",
  usd: { "480p": 0.05, "768p": 0.08, "1080p": 0.16 },
  promo: { until: "2026-10-15", usd: { "480p": 0.03, "768p": 0.048, "1080p": 0.096 } },
};
const GEMINI_OMNI_FLASH: FalPrice = { unit: "second", usd: { "720p": 0.1, "1080p": 0.15, "4K": 0.3 } };
// Read 6 Nov 2026. Sound included; fal's 360p ($0.0273) is not listed, the app has no 360p.
const GEMINI_OMNI_FLASH_1_2: FalPrice = { unit: "second", usd: { "720p": 0.0819, "1080p": 0.1229, "4K": 0.2457 } };
const FLUX_3_DRAFT: FalPrice = { unit: "second", usd: 0.06 };
// Launch offer (read 19 Oct 2026): 75% off from 15 Oct through 7 Nov.
const FLUX_3_MAX: FalPrice = {
  unit: "second",
  usd: { "720p": 0.17, "1080p": 0.29 },
  promo: { until: "2026-11-07", usd: { "720p": 0.0425, "1080p": 0.0725 } },
};
const KLING_O3_PRO: FalPrice = { unit: "second", usd: 0.112, audioUsd: 0.14 };
// Read 22 Oct 2026, while fal still says API access is "coming soon".
const KLING_V4: FalPrice = { unit: "second", usd: { "720p": 0.157, "1080p": 0.235 } };
const PIXVERSE_6: FalPrice = { unit: "second", usd: { "720p": 0.045, "1080p": 0.09 }, audioUsd: { "720p": 0.06, "1080p": 0.115 } };
// Read 12 Nov 2026. fal's 360p and 540p are not listed, the app has neither.
const PIXVERSE_6_MAX: FalPrice = { unit: "second", usd: { "720p": 0.099, "1080p": 0.198 }, audioUsd: { "720p": 0.135, "1080p": 0.252 } };
// 2K and 4K are fal's 1440p and 2160p.
const LTX_2_3: FalPrice = { unit: "second", usd: { "1080p": 0.08, "2K": 0.16, "4K": 0.32 } };

export const FAL_PRICES: Record<string, FalPrice> = {
  // ---------- image ----------
  "fal-ai/nano-banana-pro": NANO_BANANA_PRO,
  "fal-ai/nano-banana-pro/edit": NANO_BANANA_PRO,
  "fal-ai/nano-banana-2": NANO_BANANA_2,
  "fal-ai/nano-banana-2/edit": NANO_BANANA_2,
  "openai/gpt-image-2": GPT_IMAGE_2,
  "openai/gpt-image-2/edit": GPT_IMAGE_2,
  "fal-ai/flux-pro/kontext/text-to-image": { unit: "image", usd: 0.04 },
  "fal-ai/flux-pro/kontext": { unit: "image", usd: 0.04 },
  "fal-ai/flux-pro/v1.1-ultra": { unit: "image", usd: 0.06 },
  // Medium quality (fal's default); the size does not change the price.
  "ideogram/v4.5": { unit: "image", usd: 0.06 },
  "ideogram/v4.5/edit": { unit: "image", usd: 0.06 },
  "fal-ai/gpt-image-1.5": GPT_IMAGE_1_5,
  "fal-ai/gpt-image-1.5/edit": GPT_IMAGE_1_5,
  "bytedance/seedream/v5.5/text-to-image": SEEDREAM_5_5,
  "bytedance/seedream/v5.5/edit": { ...SEEDREAM_5_5, inputImageUsd: 0.012 },
  "fal-ai/qwen-image-edit-2511": { unit: "megapixel", usd: 0.03 },
  "fal-ai/z-image/turbo": { unit: "megapixel", usd: 0.005 },
  "fal-ai/flux/dev": { unit: "megapixel", usd: 0.025 },
  "fal-ai/flux/schnell": { unit: "megapixel", usd: 0.003 },

  // ---------- video ----------
  "bytedance/seedance-2.5/us/text-to-video": SEEDANCE_2_5,
  "bytedance/seedance-2.5/us/image-to-video": SEEDANCE_2_5,
  "minimax/h3/text-to-video": MINIMAX_H3,
  "minimax/h3/image-to-video": MINIMAX_H3,
  "minimax/h3-max/text-to-video": MINIMAX_H3_MAX,
  "minimax/h3-max/image-to-video": MINIMAX_H3_MAX,
  "fal-ai/kling-video/v3/pro/text-to-video": KLING_V3_PRO,
  "fal-ai/kling-video/v3/pro/image-to-video": KLING_V3_PRO,
  "fal-ai/kling-video/v3/standard/text-to-video": KLING_V3_STANDARD,
  "fal-ai/kling-video/v3/standard/image-to-video": KLING_V3_STANDARD,
  // Per second of the result, which is as long as the reference video.
  "fal-ai/kling-video/v3/pro/motion-control": { unit: "second", usd: 0.168 },
  "fal-ai/kling-video/v3/standard/motion-control": { unit: "second", usd: 0.126 },
  "google/gemini-omni-flash/v1.1/text-to-video": GEMINI_OMNI_FLASH,
  "google/gemini-omni-flash/v1.1/image-to-video": GEMINI_OMNI_FLASH,
  "google/gemini-omni-flash/v1.2/text-to-video": GEMINI_OMNI_FLASH_1_2,
  "google/gemini-omni-flash/v1.2/image-to-video": GEMINI_OMNI_FLASH_1_2,
  "blackforestlabs/flux-3-max/text-to-video": FLUX_3_MAX,
  "blackforestlabs/flux-3-max/image-to-video": FLUX_3_MAX,
  "blackforestlabs/flux-3/text-to-video/draft": FLUX_3_DRAFT,
  "blackforestlabs/flux-3/image-to-video/draft": FLUX_3_DRAFT,
  "blackforestlabs/flux-3/first-last-frame-to-video/draft": FLUX_3_DRAFT,
  "kling/v4/text-to-video": KLING_V4,
  "kling/v4/image-to-video": KLING_V4,
  "fal-ai/kling-video/o3/pro/text-to-video": KLING_O3_PRO,
  "fal-ai/kling-video/o3/pro/image-to-video": KLING_O3_PRO,
  "fal-ai/kling-video/v3/turbo/pro/text-to-video": { unit: "second", usd: 0.14 },
  "fal-ai/kling-video/v3/turbo/pro/image-to-video": { unit: "second", usd: 0.14 },
  "fal-ai/pixverse/v6/text-to-video": PIXVERSE_6,
  "fal-ai/pixverse/v6/image-to-video": PIXVERSE_6,
  "pixverse/v6/max/text-to-video": PIXVERSE_6_MAX,
  "pixverse/v6/max/image-to-video": PIXVERSE_6_MAX,
  "fal-ai/vidu/q4/image-to-video": {
    unit: "second",
    usd: { "720p": 0.095, "1080p": 0.12, "2K": 0.19, "4K": 0.39 },
    promo: { until: "2026-11-30", usd: { "720p": 0.0665, "1080p": 0.084, "2K": 0.133, "4K": 0.273 } },
  },
  "fal-ai/ltx-2.3/text-to-video": LTX_2_3,
  "fal-ai/ltx-2.3/image-to-video": LTX_2_3,
  // fal prices Luma per 5 or 10 s clip, the same per second for both; image-to-video costs less.
  "luma/agent/ray/v3.2/text-to-video": { unit: "second", usd: { "720p": 0.2, "1080p": 0.4 } },
  "luma/agent/ray/v3.2/image-to-video": { unit: "second", usd: { "720p": 0.06, "1080p": 0.24 } },
  // Video editing (read 19 Oct 2026): per second of the edited clip, which is as long as the source.
  "blackforestlabs/flux-3/edit-video": { unit: "second", usd: 0.03 },
  "fal-ai/kling-video/o3/pro/video-to-video/edit": { unit: "second", usd: 0.168 },
  "fal-ai/kling-video/o3/standard/video-to-video/edit": { unit: "second", usd: 0.126 },
  "google/gemini-omni-flash/v1.1/edit": GEMINI_OMNI_FLASH,
  "google/gemini-omni-flash/v1.2/edit": GEMINI_OMNI_FLASH_1_2,
  // $0.05 (480p) or $0.07 (720p) per second of output plus $0.01 per second of input.
  "xai/grok-imagine-video/edit-video": { unit: "second", usd: { "480p": 0.06, "720p": 0.08 } },
  "fal-ai/wan/v2.7/edit-video": { unit: "second", usd: { "720p": 0.1, "1080p": 0.15 } },
};
