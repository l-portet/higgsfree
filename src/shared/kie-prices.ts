/**
 * kie.ai's list prices, in credits ($0.005 each), for every model a route sends to, as kie's pricing page
 * (`kie.ai/pricing`) gave them on 20 Oct 2026. Keyed like `KiePayload.priceKey`: the createTask model id, or
 * `model#tier` when a tier inside it changes the price. `src/client/lib/kie-pricing.ts` prices a request with them.
 */
import type { ListPrice } from "./list-prices.ts";

export const KIE_PRICES: Record<string, ListPrice> = {
  // ---------- video ----------
  "veo-3-1#veo3": { unit: "video", amount: { "720p": 250, "1080p": 255, "4K": 370 } },
  "veo-3-1#veo3_fast": { unit: "video", amount: { "720p": 60, "1080p": 65, "4K": 180 } },
  "veo-3-1#veo3_lite": { unit: "video", amount: { "720p": 30, "1080p": 35, "4K": 150 } },
  // std renders 720p, pro 1080p.
  "kling-3.0/video#std": { unit: "second", amount: 14, audioAmount: 20 },
  "kling-3.0/video#pro": { unit: "second", amount: 18, audioAmount: 27 },
  // keyframe-to-video, and reference-to-video without a reference video (read 22 Oct 2026). With reference videos (read
  // 31 Oct 2026, like the Seedance and Wan 3.0 rates below), output plus input seconds are billed.
  "kling-4.0": { unit: "second", amount: { "720p": 28.5, "1080p": 42.5 }, videoInputAmount: { "720p": 17, "1080p": 25.5 } },
  "bytedance/seedance-2-5": { unit: "second", amount: { "480p": 28, "720p": 63, "1080p": 158 }, videoInputAmount: { "480p": 17, "720p": 38, "1080p": 95 } },
  "bytedance/seedance-2": { unit: "second", amount: { "480p": 19, "720p": 41, "1080p": 102, "4K": 208 }, videoInputAmount: { "480p": 11.5, "720p": 25, "1080p": 62, "4K": 128 } },
  "bytedance/seedance-2-fast": { unit: "second", amount: { "480p": 11.7, "720p": 24.8 }, videoInputAmount: { "480p": 6.8, "720p": 15 } },
  "bytedance/seedance-2-mini": { unit: "second", amount: { "480p": 3.8, "720p": 8.2 }, videoInputAmount: { "480p": 2.4, "720p": 5 } },
  "minimax-h3": { unit: "second", amount: { "768p": 8, "2K": 13 } },
  "wan/3-0-video": { unit: "second", amount: { "480p": 8, "720p": 16, "1080p": 32 } },
  "wan/3-0-video-prime": { unit: "second", amount: { "480p": 12.2, "720p": 25.2, "1080p": 50.4 } },
  "wan/2-7": { unit: "second", amount: { "720p": 16, "1080p": 24 } },
  "wan/2-7-videoedit": { unit: "second", amount: { "720p": 16, "1080p": 24 } },
  "grok-imagine": { unit: "second", amount: { "480p": 2.4, "720p": 4.5, "1080p": 8 } },
  // No 1080p price listed: such a run is not priced.
  "grok-imagine-video-1-5-preview": { unit: "second", amount: { "480p": 2.4, "720p": 4.5 } },
  "google/gemini-omni-flash-1-1": {
    unit: "video",
    byDuration: {
      4: { "720p": 63, "1080p": 63, "4K": 147 },
      6: { "720p": 84, "1080p": 84, "4K": 168 },
      8: { "720p": 105, "1080p": 105, "4K": 189 },
      10: { "720p": 126, "1080p": 126, "4K": 210 },
    },
  },
  // Read 10 Nov 2026; kie also lists 360p, at 4, which the app has no use for.
  "google/gemini-omni-flash-1-2": { unit: "second", amount: { "720p": 9, "1080p": 10, "4K": 22 } },
  "pixverse-v6": { unit: "second", amount: { "720p": 7.2, "1080p": 14.4 }, audioAmount: { "720p": 9.6, "1080p": 18.4 } },
  // Read 26 Oct 2026.
  "pixverse-v6-max": { unit: "second", amount: { "720p": 8.8, "1080p": 17.6 }, audioAmount: { "720p": 12, "1080p": 22.4 } },
  "vidu-q4/image-to-video": { unit: "second", amount: { "720p": 15.2, "1080p": 19.2, "2K": 30.4, "4K": 62.4 } },

  // ---------- image ----------
  "nano-banana-pro": { unit: "image", amount: { "1K": 18, "2K": 18, "4K": 24 } },
  "nano-banana-2": { unit: "image", amount: { "1K": 8, "2K": 12, "4K": 18 } },
  "nano-banana-2-lite": { unit: "image", amount: 4 },
  "google/nano-banana": { unit: "image", amount: 4 },
  "gpt-image-2-text-to-image": { unit: "image", amount: { "1K": 6, "2K": 10, "4K": 16 } },
  // No entry for GPT Image 2.6 Flare and Sunburst: kie bills them per million tokens, with no per-image price (read 6 Nov 2026).
  // GPT Image 2.6 Economy: 5 credits at 1K, its only size, with or without references (read 6 Nov 2026).
  "gpt-image-2-6/economy-text-to-image": { unit: "image", amount: 5 },
  // Seedream 5.5 (read 11 Nov 2026): 1.5K, which the app has no size for, is 3.6 too. Edits cost the same, plus 1.44 for
  // each reference image.
  "seedream/5-5-text-to-image": { unit: "image", amount: { "1K": 3.6, "2K": 6.3 }, inputImageAmount: 1.44 },
  // MiniMax H3 Image (read 12 Nov 2026): 1K and 2K are one tier. Edits cost the same, plus 0.5 for each reference image.
  "minimax-h3/text-to-image": { unit: "image", amount: { "1K": 1.8, "2K": 1.8, "4K": 5.5 }, inputImageAmount: 0.5 },
  // Kling Image 4.0 (read 20 Nov 2026): one model for text to image and edits, plus 0.5 for each reference image (or
  // element). 8K, which `ImageSize` cannot say, is 28.3.
  "kling-4-0/image": { unit: "image", amount: { "2K": 11.3, "4K": 17 }, inputImageAmount: 0.5 },
  "flux1-kontext#flux-kontext-pro": { unit: "image", amount: 5 },
  "z-image": { unit: "image", amount: 0.8 },
};
