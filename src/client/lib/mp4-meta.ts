/**
 * Best-effort MP4 metadata (width / height / duration) from `moov` boxes.
 * Pure TS, tolerant of `moov` placed after `mdat` and of 64-bit box sizes.
 */
export interface Mp4Meta {
  width?: number;
  height?: number;
  durationSec?: number;
}

const u32 = (b: Uint8Array, o: number): number =>
  (((b[o] ?? 0) << 24) | ((b[o + 1] ?? 0) << 16) | ((b[o + 2] ?? 0) << 8) | (b[o + 3] ?? 0)) >>> 0;
const u64 = (b: Uint8Array, o: number): number => u32(b, o) * 0x1_0000_0000 + u32(b, o + 4);
const type = (b: Uint8Array, o: number): string => String.fromCharCode(...b.subarray(o, o + 4));

interface Box {
  type: string;
  start: number; // payload start
  end: number; // box end (exclusive)
}

function* boxes(b: Uint8Array, from: number, to: number): Generator<Box> {
  let pos = from;
  while (pos + 8 <= to) {
    let size = u32(b, pos);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > to) return;
      size = u64(b, pos + 8);
      header = 16;
    } else if (size === 0) {
      size = to - pos;
    }
    if (size < header || pos + size > to) return;
    yield { type: type(b, pos + 4), start: pos + header, end: pos + size };
    pos += size;
  }
}

function find(b: Uint8Array, from: number, to: number, name: string): Box | undefined {
  for (const box of boxes(b, from, to)) if (box.type === name) return box;
  return undefined;
}

export function parseMp4Meta(b: Uint8Array): Mp4Meta {
  const meta: Mp4Meta = {};
  try {
    const moov = find(b, 0, b.length, "moov");
    if (!moov) return meta;
    const mvhd = find(b, moov.start, moov.end, "mvhd");
    if (mvhd) {
      const version = b[mvhd.start] ?? 0;
      const timescale = version === 1 ? u32(b, mvhd.start + 20) : u32(b, mvhd.start + 12);
      const duration = version === 1 ? u64(b, mvhd.start + 24) : u32(b, mvhd.start + 16);
      if (timescale > 0 && duration > 0) meta.durationSec = Math.round((duration / timescale) * 1000) / 1000;
    }
    for (const trak of boxes(b, moov.start, moov.end)) {
      if (trak.type !== "trak") continue;
      const tkhd = find(b, trak.start, trak.end, "tkhd");
      if (!tkhd) continue;
      const version = b[tkhd.start] ?? 0;
      const off = tkhd.start + (version === 1 ? 88 : 76);
      const width = u32(b, off) / 65536;
      const height = u32(b, off + 4) / 65536;
      if (width > 0 && height > 0) {
        meta.width = Math.round(width);
        meta.height = Math.round(height);
        break;
      }
    }
  } catch {
    /* best-effort */
  }
  return meta;
}

/** Reads bytes `start..end` (inclusive) of the file; may return fewer bytes at the end. */
export type RangeReader = (start: number, end: number) => Promise<Uint8Array>;

/**
 * Same parse, but with bounded reads from any random-access source: walk the
 * top-level boxes by header only (16 bytes each), then load just the `moov` box,
 * never the `mdat` payload, which is the whole video. Used over `Blob.slice`, so a 4K clip
 * is never read whole for its metadata.
 */
export async function parseMp4MetaFromRanges(size: number, read: RangeReader, maxMoovBytes = 64 * 1024 * 1024): Promise<Mp4Meta> {
  try {
    let pos = 0;
    while (pos + 8 <= size) {
      const header = await read(pos, Math.min(pos + 15, size - 1));
      if (header.length < 8) break;
      let boxSize = u32(header, 0);
      let headerLen = 8;
      if (boxSize === 1) {
        if (header.length < 16) break;
        boxSize = u64(header, 8);
        headerLen = 16;
      } else if (boxSize === 0) {
        boxSize = size - pos;
      }
      if (boxSize < headerLen || pos + boxSize > size) break;
      if (type(header, 4) === "moov") {
        if (boxSize > maxMoovBytes) break;
        return parseMp4Meta(await read(pos, pos + boxSize - 1));
      }
      pos += boxSize;
    }
  } catch {
    /* best-effort */
  }
  return {};
}
