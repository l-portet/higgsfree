import { describe, expect, it } from "vitest";
import { parseDataUrl, isSafeMediaName, toDataUrl } from "../media.ts";

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
    expect(parseDataUrl("/media/gen_x.png")).toBeUndefined();
    expect(parseDataUrl("data:image/png;base64")).toBeUndefined();
  });
  it("returns undefined (not a throw) for malformed percent-encoding", () => {
    expect(parseDataUrl("data:image/png,%E0%A4%A")).toBeUndefined();
    expect(parseDataUrl("data:text/plain,hi%20there")?.bytes).toEqual(new TextEncoder().encode("hi there"));
  });
});

describe("isSafeMediaName", () => {
  it("only allows plain file names", () => {
    expect(isSafeMediaName("gen_abc123.png")).toBe(true);
    expect(isSafeMediaName("up_x-Y_1.webp")).toBe(true);
    expect(isSafeMediaName("../etc/passwd")).toBe(false);
    expect(isSafeMediaName("..")).toBe(false);
    expect(isSafeMediaName(".hidden")).toBe(false);
    expect(isSafeMediaName("a/b.png")).toBe(false);
    expect(isSafeMediaName("a b.png")).toBe(false);
  });
});
