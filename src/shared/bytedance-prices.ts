/**
 * ByteDance's own Seedance models on BytePlus ModelArk (region ap-southeast-1): what each takes and what it costs,
 * from ModelArk's model list, video API reference and pricing page (read 11 Nov 2026; docs/BYTEDANCE.md).
 *
 * A clip is billed in tokens: (input video seconds + output seconds) × width × height × 24 fps / 1024, at a USD rate
 * per million tokens that depends on the resolution (and is lower when a video is attached, which this app never sends
 * to ModelArk). The frame sizes below are the ones the API reference lists per resolution and ratio; they reproduce
 * ModelArk's own price examples to the cent (Seedance 2.5, 5 s at 720p 16:9: 108,000 tokens × $10.70/M = $1.156).
 */
import type { VideoAspectRatio, VideoResolution } from "./types";

/** Seedance 2.5 and the 2.0 series render 480p (and 2.0 has 4K) at different sizes. */
export type BytedanceFamily = "seedance-2.5" | "seedance-2.0";

export interface BytedanceVideoModel {
  family: BytedanceFamily;
  /** Output resolutions, in the app's names (ModelArk writes `4k`). */
  resolutions: VideoResolution[];
  /** Whole seconds. */
  durations: { min: number; max: number };
  /** Style references (`reference_image`) in one run. */
  maxReferenceImages: number;
  /** USD per 1M tokens by resolution, with no video attached. */
  usdPerMTokens: Partial<Record<VideoResolution, number>>;
}

/** By ModelArk model id. Seedance 1.5 Pro (`seedance-1-5-pro-251215`) retires on 11 Nov 2026 and is left out. */
export const BYTEDANCE_VIDEO_MODELS: Record<string, BytedanceVideoModel> = {
  "dreamina-seedance-2-5-260628": {
    family: "seedance-2.5",
    resolutions: ["480p", "720p", "1080p"],
    durations: { min: 4, max: 30 },
    maxReferenceImages: 30,
    usdPerMTokens: { "480p": 10.7, "720p": 10.7, "1080p": 11.7 },
  },
  "dreamina-seedance-2-0-260128": {
    family: "seedance-2.0",
    resolutions: ["480p", "720p", "1080p", "4K"],
    durations: { min: 4, max: 15 },
    maxReferenceImages: 9,
    usdPerMTokens: { "480p": 7, "720p": 7, "1080p": 7.7, "4K": 4 },
  },
  "dreamina-seedance-2-0-fast-260128": {
    family: "seedance-2.0",
    resolutions: ["480p", "720p"],
    durations: { min: 4, max: 15 },
    maxReferenceImages: 9,
    usdPerMTokens: { "480p": 5.6, "720p": 5.6 },
  },
  "dreamina-seedance-2-0-mini-260615": {
    family: "seedance-2.0",
    resolutions: ["480p", "720p"],
    durations: { min: 4, max: 15 },
    maxReferenceImages: 9,
    usdPerMTokens: { "480p": 3.5, "720p": 3.5 },
  },
};

/** The ratios ModelArk takes (besides `adaptive`: the frame's shape, or the model's pick). */
export const BYTEDANCE_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] as const satisfies readonly VideoAspectRatio[];
export type BytedanceRatio = (typeof BYTEDANCE_RATIOS)[number];

type Frames = Record<BytedanceRatio, readonly [width: number, height: number]>;

const FRAMES_720P: Frames = { "16:9": [1280, 720], "4:3": [1112, 834], "1:1": [960, 960], "3:4": [834, 1112], "9:16": [720, 1280], "21:9": [1470, 630] };
const FRAMES_1080P: Frames = { "16:9": [1920, 1080], "4:3": [1664, 1248], "1:1": [1440, 1440], "3:4": [1248, 1664], "9:16": [1080, 1920], "21:9": [2206, 946] };

/** Output width × height by family, resolution and ratio ("Width and height pixel values" in the API reference). */
export const BYTEDANCE_FRAMES: Record<BytedanceFamily, Partial<Record<VideoResolution, Frames>>> = {
  "seedance-2.5": {
    "480p": { "16:9": [854, 480], "4:3": [752, 560], "1:1": [640, 640], "3:4": [560, 752], "9:16": [480, 854], "21:9": [992, 432] },
    "720p": FRAMES_720P,
    "1080p": FRAMES_1080P,
  },
  "seedance-2.0": {
    "480p": { "16:9": [864, 496], "4:3": [752, 560], "1:1": [640, 640], "3:4": [560, 752], "9:16": [496, 864], "21:9": [992, 432] },
    "720p": FRAMES_720P,
    "1080p": FRAMES_1080P,
    "4K": { "16:9": [3840, 2160], "4:3": [3326, 2494], "1:1": [2880, 2880], "3:4": [2494, 3326], "9:16": [2160, 3840], "21:9": [4398, 1886] },
  },
};

/** Tokens for one second of output at a frame size: width × height × 24 fps / 1024. */
export const tokensPerSecond = ([width, height]: readonly [number, number]): number => (width * height * 24) / 1024;
