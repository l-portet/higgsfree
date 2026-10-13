import { describe, expect, it } from "vitest";
import { base64ToBytes, blobToDataUrl, bytesToBase64, parseDataUrl, toDataUrl } from "../data-url";

describe("parseDataUrl / toDataUrl", () => {
  it("round-trips base64 payloads", () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const url = toDataUrl("image/png", bytes);
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    const parsed = parseDataUrl(url);
    expect(parsed?.mime).toBe("image/png");
    expect(Array.from(parsed?.bytes ?? [])).toEqual(Array.from(bytes));
  });
  it("rejects non data urls", () => {
    expect(parseDataUrl("up_x.png")).toBeUndefined();
    expect(parseDataUrl("data:image/png;base64")).toBeUndefined();
  });
  it("returns undefined (not a throw) for malformed percent-encoding or base64", () => {
    expect(parseDataUrl("data:image/png,%E0%A4%A")).toBeUndefined();
    expect(parseDataUrl("data:image/png;base64,***")).toBeUndefined();
    expect(parseDataUrl("data:text/plain,hi%20there")?.bytes).toEqual(new TextEncoder().encode("hi there"));
  });
  it("encodes large buffers in chunks without blowing the call stack", () => {
    const big = new Uint8Array(300_000).map((_, i) => i % 251);
    expect(Array.from(base64ToBytes(bytesToBase64(big)))).toEqual(Array.from(big));
  });
  it("turns a Blob into a data url with its own type", async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    expect(await blobToDataUrl(new Blob([bytes], { type: "image/webp" }))).toBe(toDataUrl("image/webp", bytes));
  });
});
