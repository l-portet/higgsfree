/** Media ids: the keys of the media store and what records point at (`gen_*.ext` outputs, `up_*.ext` uploads). */
import { describe, expect, it } from "vitest";
import { inputMediaIds, isGenerationId, isMediaId, mediaKind, mimeForId, newBatchId, newGenerationId, newUploadId, outputMediaId, ownerGenerationId } from "../media-ids";

describe("media ids", () => {
  it("accepts our own output and upload names only", () => {
    expect(isMediaId("gen_abc12345.png")).toBe(true);
    expect(isMediaId("up_x-Y_1abcd.webp")).toBe(true);
    expect(isMediaId("gen_abc12345.mp4")).toBe(true);
    expect(isMediaId("../etc/passwd")).toBe(false);
    expect(isMediaId("gen_abc12345")).toBe(false); // no extension
    expect(isMediaId("other_abc12345.png")).toBe(false);
    expect(isMediaId("gen_ab.png")).toBe(false); // too short
    expect(isMediaId("data:image/png;base64,AAAA")).toBe(false);
    expect(isMediaId(42)).toBe(false);
  });

  it("knows which kind an id is and which record owns an output", () => {
    expect(mediaKind("gen_abc12345.png")).toBe("output");
    expect(mediaKind("up_abc12345.jpg")).toBe("upload");
    expect(mediaKind("nope")).toBeUndefined();
    expect(ownerGenerationId("gen_abc12345.mp4")).toBe("gen_abc12345");
    expect(ownerGenerationId("up_abc12345.jpg")).toBeUndefined();
    expect(mimeForId("gen_abc12345.mp4")).toBe("video/mp4");
    expect(mimeForId("up_abc12345.jpg")).toBe("image/jpeg");
  });

  it("generates well-formed ids", () => {
    const g = newGenerationId();
    expect(isGenerationId(g)).toBe(true);
    expect(isMediaId(outputMediaId(g, "png"))).toBe(true);
    expect(ownerGenerationId(outputMediaId(g, "webp"))).toBe(g);
    expect(isMediaId(newUploadId("jpg"))).toBe(true);
    expect(newBatchId()).toMatch(/^batch_[A-Za-z0-9_-]{10}$/);
  });

  it("lists every media a record's inputs point at, once each", () => {
    expect(inputMediaIds({ referenceImages: ["up_aaaaaaaa.png", "gen_bbbbbbbb.png", "up_cccccccc.png"], firstFrame: "up_aaaaaaaa.png" })).toEqual([
      "up_aaaaaaaa.png",
      "gen_bbbbbbbb.png",
      "up_cccccccc.png",
    ]);
    expect(inputMediaIds({ firstFrame: "not-an-id" })).toEqual([]);
    expect(inputMediaIds(undefined)).toEqual([]);
  });
});
