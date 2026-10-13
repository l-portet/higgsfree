import { describe, expect, it } from "vitest";
import { parseRange } from "../range.ts";

describe("parseRange", () => {
  it("returns undefined without a header", () => {
    expect(parseRange(undefined, 100)).toBeUndefined();
    expect(parseRange("", 100)).toBeUndefined();
  });
  it("parses bounded, open-ended and suffix ranges", () => {
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=50-", 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=0-999", 100)).toEqual({ start: 0, end: 99 });
  });
  it("flags unsatisfiable ranges (416)", () => {
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=20-10", 100)).toBe("invalid");
    expect(parseRange("bytes=-0", 100)).toBe("invalid");
    expect(parseRange("bytes=0-", 0)).toBe("invalid");
  });
  it("ignores malformed, multi-range and non-byte headers (serve the whole file)", () => {
    expect(parseRange("items=0-1", 100)).toBeUndefined();
    expect(parseRange("bytes=0-1,5-6", 100)).toBeUndefined();
    expect(parseRange("bytes=-", 100)).toBeUndefined();
    expect(parseRange("bytes=", 100)).toBeUndefined();
    expect(parseRange("bytes=a-b", 100)).toBeUndefined();
    expect(parseRange("garbage", 100)).toBeUndefined();
  });
});
