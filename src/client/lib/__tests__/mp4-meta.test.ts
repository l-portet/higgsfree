import { describe, expect, it } from "vitest";
import { parseMp4Meta, parseMp4MetaFromRanges } from "../mp4-meta";

const u32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const str = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const box = (type: string, ...payload: number[][]): number[] => {
  const body = payload.flat();
  return [...u32(8 + body.length), ...str(type), ...body];
};
const zeros = (n: number): number[] => new Array<number>(n).fill(0);

function mvhd(timescale: number, duration: number): number[] {
  return box("mvhd", [0, 0, 0, 0], u32(0), u32(0), u32(timescale), u32(duration), u32(0x10000), [1, 0], zeros(10), zeros(36), zeros(24), u32(2));
}
function tkhd(width: number, height: number): number[] {
  return box("tkhd", [0, 0, 0, 3], u32(0), u32(0), u32(1), u32(0), u32(0), zeros(8), zeros(8), zeros(36), u32(width << 16), u32(height << 16));
}

describe("parseMp4Meta", () => {
  it("reads duration and the video track size from moov", () => {
    const audioTrak = box("trak", tkhd(0, 0));
    const videoTrak = box("trak", tkhd(720, 1280));
    const moov = box("moov", mvhd(1000, 5000), audioTrak, videoTrak);
    const file = Uint8Array.from([...box("ftyp", str("isom"), u32(0)), ...moov, ...box("mdat", zeros(16))]);
    expect(parseMp4Meta(file)).toEqual({ width: 720, height: 1280, durationSec: 5 });
  });

  it("finds moov after mdat and handles 64-bit box sizes", () => {
    const mdatPayload = zeros(32);
    const largeMdat = [...u32(1), ...str("mdat"), ...u32(0), ...u32(16 + mdatPayload.length), ...mdatPayload];
    const moov = box("moov", mvhd(600, 1500), box("trak", tkhd(1920, 1080)));
    const file = Uint8Array.from([...largeMdat, ...moov]);
    expect(parseMp4Meta(file)).toEqual({ width: 1920, height: 1080, durationSec: 2.5 });
  });

  it("returns an empty object for garbage", () => {
    expect(parseMp4Meta(Uint8Array.from([1, 2, 3]))).toEqual({});
    expect(parseMp4Meta(new Uint8Array(0))).toEqual({});
  });
});

describe("parseMp4MetaFromRanges", () => {
  /** A range reader over a Blob that records what it was asked for. */
  const blobReader = (bytes: Uint8Array<ArrayBuffer>): { read: (start: number, end: number) => Promise<Uint8Array>; ranges: [number, number][] } => {
    const blob = new Blob([bytes]);
    const ranges: [number, number][] = [];
    return {
      ranges,
      read: async (start, end) => {
        ranges.push([start, end]);
        return new Uint8Array(await blob.slice(start, end + 1).arrayBuffer());
      },
    };
  };

  it("reads only box headers + moov, never the mdat payload", async () => {
    const moov = box("moov", mvhd(1000, 5000), box("trak", tkhd(720, 1280)));
    const ftyp = box("ftyp", str("isom"), u32(0));
    const mdat = box("mdat", zeros(4096));
    const file = Uint8Array.from([...ftyp, ...moov, ...mdat]);
    const { read, ranges } = blobReader(file);
    expect(await parseMp4MetaFromRanges(file.length, read)).toEqual({ width: 720, height: 1280, durationSec: 5 });
    const mdatPayloadStart = ftyp.length + moov.length + 8;
    for (const [, end] of ranges) expect(end).toBeLessThan(mdatPayloadStart);
    expect(ranges.reduce((n, [s, e]) => n + (e - s + 1), 0)).toBeLessThan(file.length / 2);
  });

  it("finds moov after a 64-bit mdat and matches the in-memory parser", async () => {
    const mdatPayload = zeros(2048);
    const largeMdat = [...u32(1), ...str("mdat"), ...u32(0), ...u32(16 + mdatPayload.length), ...mdatPayload];
    const moov = box("moov", mvhd(600, 1500), box("trak", tkhd(1920, 1080)));
    const file = Uint8Array.from([...largeMdat, ...moov]);
    const { read, ranges } = blobReader(file);
    expect(await parseMp4MetaFromRanges(file.length, read)).toEqual(parseMp4Meta(file));
    expect(await parseMp4MetaFromRanges(file.length, read)).toEqual({ width: 1920, height: 1080, durationSec: 2.5 });
    expect(ranges.some(([s]) => s === largeMdat.length)).toBe(true); // jumped straight to moov
  });

  it("returns an empty object for garbage or an oversized moov", async () => {
    expect(await parseMp4MetaFromRanges(3, blobReader(Uint8Array.from([1, 2, 3])).read)).toEqual({});
    const moov = box("moov", mvhd(1000, 5000), box("trak", tkhd(720, 1280)));
    expect(await parseMp4MetaFromRanges(moov.length, blobReader(Uint8Array.from(moov)).read, 16)).toEqual({});
    const failing = async (): Promise<Uint8Array> => {
      throw new Error("read failed");
    };
    expect(await parseMp4MetaFromRanges(100, failing)).toEqual({});
  });
});
