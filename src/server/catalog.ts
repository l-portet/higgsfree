/**
 * Catalog lookups that also see models OpenRouter lists but the curated catalog
 * does not know yet ("discovered"). They are synthesized from the cached live
 * snapshot with conservative caps so they can be generated with right away; the
 * snapshot refreshes every `LIVE_TTL_MS`, which is the discovery cadence.
 */
import type { ModelProvider, VideoModel } from "../shared/types.ts";
import { findVideoModel, PROVIDER_LABEL } from "../shared/models.ts";
import { listLiveModels, liveSnapshot, type LiveModels, type LiveVideoModel } from "./openrouter.ts";

const isKnownProvider = (p: string): p is ModelProvider => Object.hasOwn(PROVIDER_LABEL, p);

/** "MiniMax: Hailuo 3 Max" -> "Hailuo 3 Max"; falls back to the slug's model part. */
function displayName(m: LiveVideoModel): string {
  const stripped = (m.name ?? "").replace(/^[^:]{1,40}:\s+/, "").trim();
  return stripped || m.id.split("/").pop() || m.id;
}

export function synthesizeVideoModel(m: LiveVideoModel): VideoModel {
  const vendor = m.id.split("/")[0] ?? "";
  return {
    kind: "video",
    id: m.id,
    name: displayName(m),
    provider: isKnownProvider(vendor) ? vendor : "openrouter",
    description: "New on OpenRouter. Limits and price not verified yet.",
    featured: false,
    badges: ["new"],
    caps: {
      textToVideo: m.inputModalities.includes("text"),
      imageToVideo: m.inputModalities.includes("image"),
      lastFrame: false,
      audio: false,
      references: false,
    },
    durations: { min: 4, max: 10, step: 1 },
    defaultDuration: 5,
    resolutions: [],
    aspectRatios: ["16:9", "9:16", "1:1"],
    estCostPerSecUsd: {},
    verified: false,
    discovered: true,
  };
}

let memoSnapshot: LiveModels | undefined;
let memo: VideoModel[] = [];

/** Video models in the live snapshot that are not in `VIDEO_MODELS` (hidden entries count as known). Memoized per snapshot. */
export function discoveredVideoModels(): VideoModel[] {
  const live = liveSnapshot();
  if (!live) return [];
  if (live !== memoSnapshot) {
    memoSnapshot = live;
    memo = live.video.filter((m) => !findVideoModel(m.id)).map(synthesizeVideoModel);
  }
  return memo;
}

/** Catalog entry or discovered model for `id`, from what is cached right now. */
export function resolveVideoModel(id: string): VideoModel | undefined {
  return findVideoModel(id) ?? discoveredVideoModels().find((m) => m.id === id);
}

/**
 * Same as `resolveVideoModel`, but a miss first refreshes the live snapshot (a
 * no-op while it is fresh) so a discovered slug works before any page load
 * primed the cache.
 */
export async function lookupVideoModel(id: string, key: string | undefined): Promise<VideoModel | undefined> {
  const known = findVideoModel(id);
  if (known) return known;
  await listLiveModels(key);
  return resolveVideoModel(id);
}
