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
  "bytedance/seedance-2-5": { unit: "second", amount: { "480p": 28, "720p": 63, "1080p": 158 } },
  "bytedance/seedance-2": { unit: "second", amount: { "480p": 19, "720p": 41, "1080p": 102, "4K": 208 } },
  "bytedance/seedance-2-fast": { unit: "second", amount: { "480p": 11.7, "720p": 24.8 } },
  "bytedance/seedance-2-mini": { unit: "second", amount: { "480p": 3.8, "720p": 8.2 } },
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
  "pixverse-v6": { unit: "second", amount: { "720p": 7.2, "1080p": 14.4 }, audioAmount: { "720p": 9.6, "1080p": 18.4 } },
  "vidu-q4/image-to-video": { unit: "second", amount: { "720p": 15.2, "1080p": 19.2, "2K": 30.4, "4K": 62.4 } },

  // ---------- image ----------
  "nano-banana-pro": { unit: "image", amount: { "1K": 18, "2K": 18, "4K": 24 } },
  "nano-banana-2": { unit: "image", amount: { "1K": 8, "2K": 12, "4K": 18 } },
  "nano-banana-2-lite": { unit: "image", amount: 4 },
  "google/nano-banana": { unit: "image", amount: 4 },
  "gpt-image-2": { unit: "image", amount: { "1K": 6, "2K": 10, "4K": 16 } },
  "flux1-kontext#flux-kontext-pro": { unit: "image", amount: 5 },
  "z-image": { unit: "image", amount: 0.8 },
};
