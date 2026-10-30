/** Reference audio sniffing: what an uploaded clip's bytes say it is. */
import { describe, expect, it } from "vitest";
import { detectAudio } from "../audio-meta";

const bytes = (...parts: (string | number[])[]): Uint8Array =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("detectAudio", () => {
  it("reads WAV, MP3 with an ID3 tag, and a bare MP3 frame", () => {
    expect(detectAudio(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toEqual({ ext: "wav", mime: "audio/wav" });
    expect(detectAudio(bytes("ID3", [4, 0]))).toEqual({ ext: "mp3", mime: "audio/mpeg" });
    expect(detectAudio(bytes([0xff, 0xfb, 0x90, 0x00]))).toEqual({ ext: "mp3", mime: "audio/mpeg" });
  });
  it("refuses anything else", () => {
    expect(detectAudio(bytes("RIFF", [0, 0, 0, 0], "AVI "))).toBeUndefined();
    expect(detectAudio(bytes([0xff, 0xf1, 0x50, 0x80]))).toBeUndefined(); // AAC (ADTS)
    expect(detectAudio(bytes([0x89], "PNG"))).toBeUndefined();
  });
});
