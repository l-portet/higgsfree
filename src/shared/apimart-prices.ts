/**
 * APIMart's prices in USD for every model a route sends to, from APIMart's public price catalog
 * (`api.apimart.ai/api/pricing/models/all`, read 20 Oct 2026; it sends no CORS header, so the app cannot read
 * it live). These are the Gold tier, the "current price" APIMart shows (80% of its list price); a Platinum
 * or Diamond account pays 5–10% less, a run's real cost is recorded from the task. Keyed like
 * `ApimartPayload.priceKey`: the model id, or `model#tier`.
 */
import type { ListPrice } from "./list-prices.ts";

export const APIMART_PRICES: Record<string, ListPrice> = {
  // ---------- video ----------
  // Per 8 s clip.
  "veo3.1-quality": { unit: "video", amount: { "720p": 1, "1080p": 1, "4K": 1.5 } },
  "veo3.1-fast": { unit: "video", amount: { "720p": 0.14, "1080p": 0.14, "4K": 0.64 } },
  "veo3.1-lite": { unit: "video", amount: { "720p": 0.07, "1080p": 0.07, "4K": 0.57 } },
  "seedance-2.5": { unit: "second", amount: { "480p": 0.09608, "720p": 0.216, "1080p": 0.38488 } },
  "seedance-2.0": { unit: "second", amount: { "480p": 0.066, "720p": 0.142, "1080p": 0.3544, "4K": 0.722 } },
  "seedance-2.0-fast": { unit: "second", amount: { "480p": 0.03984, "720p": 0.0856 } },
  "seedance-2.0-mini": { unit: "second", amount: { "480p": 0.01815, "720p": 0.03903 } },
  // Read 20 Oct 2026. The catalog no longer lists it (12 Nov 2026), though its doc page does: the last price it gave.
  "seedance-1-5-pro": { unit: "second", amount: { "480p": 0.0204, "720p": 0.044, "1080p": 0.108 } },
  "MiniMax-H3": { unit: "second", amount: { "768p": 0.05712, "2K": 0.09144 } },
  "MiniMax-H3-Max": { unit: "second", amount: { "480p": 0.03768, "768p": 0.05712, "1080p": 0.128 } },
  "MiniMax-Hailuo-2.3": { unit: "second", amount: { "768p": 0.0488, "1080p": 0.072 } },
  "wan3.0-video": { unit: "second", amount: { "480p": 0.03288, "720p": 0.06575, "1080p": 0.1315 } },
  "wan3.0-video-prime": { unit: "second", amount: { "480p": 0.05143, "720p": 0.10286, "1080p": 0.20571 } },
  "wan2.7": { unit: "second", amount: { "720p": 0.0664, "1080p": 0.1096 } },
  "wan2.6": { unit: "second", amount: { "720p": 0.05, "1080p": 0.084 } },
  // std renders 720p, pro 1080p.
  "kling-v3#std": { unit: "second", amount: 0.0672, audioAmount: 0.1008 },
  "kling-v3#pro": { unit: "second", amount: 0.0896, audioAmount: 0.1344 },
  "kling-video-o1#std": { unit: "second", amount: 0.0672 },
  // Without a video input (read 22 Oct 2026).
  "kling-v4": { unit: "second", amount: { "720p": 0.157, "1080p": 0.235 } },
  "pixverse-v6": { unit: "second", amount: { "720p": 0.032, "1080p": 0.064 }, audioAmount: { "720p": 0.04, "1080p": 0.08 } },
  // Read 26 Oct 2026.
  "pixverse-v6-max": { unit: "second", amount: { "720p": 0.0391112, "1080p": 0.0782224 }, audioAmount: { "720p": 0.0533336, "1080p": 0.0995552 } },
  "gemini-omni-1.1-flash-ext": {
    unit: "video",
    byDuration: {
      4: { "720p": 0.25, "1080p": 0.25, "4K": 0.75 },
      6: { "720p": 0.3, "1080p": 0.3, "4K": 0.8 },
      8: { "720p": 0.35, "1080p": 0.35, "4K": 0.85 },
      10: { "720p": 0.4, "1080p": 0.4, "4K": 0.9 },
    },
  },
  // The same with the sound off.
  "flux-3-video": { unit: "second", amount: { "720p": 0.136, "1080p": 0.232 } },
  "viduq4-preview": { unit: "second", amount: { "720p": 0.0912, "1080p": 0.1024, "2K": 0.1624, "4K": 0.3328 } },

  // ---------- image ----------
  "gemini-3-pro-image-preview": { unit: "image", amount: { "1K": 0.03, "2K": 0.03, "4K": 0.04 } },
  "gemini-3.1-flash-image-preview": { unit: "image", amount: { "1K": 0.015, "2K": 0.02, "4K": 0.025 } },
  "gemini-3.1-flash-lite-image-ext": { unit: "image", amount: 0.0125 },
  "gemini-2.5-flash-image-preview": { unit: "image", amount: 0.0125 },
  "gpt-image-2": { unit: "image", amount: { "1K": 0.0085, "2K": 0.015, "4K": 0.022 } },
  "flux-kontext-pro": { unit: "image", amount: 0.032 },
  // Without prompt_extend, which doubles it.
  "z-image-turbo": { unit: "image", amount: 0.01 },
  // Seedream 5.5 (read 13 Nov 2026 from `api.apimart.ai/api/pricing/model?model=seedream-5-5`; the catalog has no
  // reference fee): Gold is 65% of the list price here. 1.5K, which the app has no size for, is 0.013 too. Every
  // reference image is billed on top, the first included.
  "seedream-5-5": { unit: "image", amount: { "1K": 0.013, "2K": 0.02275 }, inputImageAmount: 0.0052 },
};
