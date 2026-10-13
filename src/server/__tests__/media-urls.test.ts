/** Media url parsing shared by both storage backends: only our own `gen_*` / `up_*` names, from `/media/` or a public Blob store. */
import { describe, expect, it } from "vitest";
import { inputMediaUrls, isBlobUrl, mediaName } from "../media.ts";

const BLOB = "https://abc123xyz.public.blob.vercel-storage.com";

describe("mediaName", () => {
  it("accepts local and blob urls for outputs and uploads", () => {
    expect(mediaName("/media/gen_abc.png")).toBe("gen_abc.png");
    expect(mediaName("/media/up_abc.webp?x=1")).toBe("up_abc.webp");
    expect(mediaName(`${BLOB}/media/gen_abc.mp4`)).toBe("gen_abc.mp4");
    expect(mediaName(`${BLOB}/media/uploads/up_abc.jpg`)).toBe("up_abc.jpg");
  });
  it("rejects anything that is not ours", () => {
    expect(mediaName("/media/../etc/passwd")).toBeUndefined();
    expect(mediaName("/media/other.png")).toBeUndefined();
    expect(mediaName("https://evil.example/media/gen_abc.png")).toBeUndefined();
    expect(mediaName(`${BLOB}/elsewhere/gen_abc.png`)).toBeUndefined();
    expect(mediaName(`http://abc.public.blob.vercel-storage.com/media/gen_a.png`)).toBeUndefined(); // https only
    expect(mediaName("data:image/png;base64,AAAA")).toBeUndefined();
    expect(isBlobUrl("https://x.public.blob.vercel-storage.com/a")).toBe(true);
    expect(isBlobUrl("https://x.public.blob.vercel-storage.com.evil.example/a")).toBe(false);
  });
  it("lists only uploads among a generation's inputs, once each", () => {
    expect(inputMediaUrls({ referenceImages: ["/media/up_a.png", "/media/gen_b.png", `${BLOB}/media/uploads/up_c.png`], firstFrame: "/media/up_a.png" })).toEqual([
      "/media/up_a.png",
      `${BLOB}/media/uploads/up_c.png`,
    ]);
    expect(inputMediaUrls(undefined)).toEqual([]);
  });
});
