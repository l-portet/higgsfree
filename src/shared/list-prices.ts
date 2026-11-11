/**
 * A provider's list price for one model, in the provider's own unit (kie.ai: credits; APIMart: USD).
 * `src/client/lib/list-pricing.ts` turns one into dollars for a request.
 */
import type { ImageSize, VideoResolution } from "./types.ts";

/** An amount, the same at every resolution or by the app's resolution. */
export type Amount = number | Partial<Record<VideoResolution, number>>;

export type ListPrice =
  | {
      /** Per second of output video. */
      unit: "second";
      amount: Amount;
      /** With the audio track on, when it costs more. */
      audioAmount?: Amount;
      /**
       * With reference videos attached: the run is billed on the output plus the reference videos' length, at this
       * rate (`amount` when absent, as on Wan 3.0).
       */
      videoInputAmount?: Amount;
    }
  | {
      /** Per clip, whatever its length, or by its length. */
      unit: "video";
      amount?: Amount;
      byDuration?: Record<number, Amount>;
    }
  | {
      unit: "image";
      amount: number | Partial<Record<ImageSize, number>>;
      /** Each reference image sent is billed on top, at this rate (kie.ai's Seedream 5.5). */
      inputImageAmount?: number;
    };
