/** Sniffing for uploaded reference audio: MP3 (an ID3 tag or an MPEG frame sync) and WAV (RIFF / WAVE). */
export interface AudioFormat {
  ext: "mp3" | "wav";
  mime: string;
}

export function detectAudio(bytes: Uint8Array): AudioFormat | undefined {
  const ascii = (from: number, to: number): string => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return { ext: "wav", mime: "audio/wav" };
  if (bytes.length >= 3 && ascii(0, 3) === "ID3") return { ext: "mp3", mime: "audio/mpeg" };
  // An MPEG audio frame header: 11 sync bits, then layer III (MPEG-1, 2 or 2.5).
  const b0 = bytes[0] ?? 0;
  const b1 = bytes[1] ?? 0;
  if (bytes.length >= 2 && b0 === 0xff && (b1 & 0xe0) === 0xe0 && (b1 & 0x06) === 0x02) return { ext: "mp3", mime: "audio/mpeg" };
  return undefined;
}

/** A clip's length in seconds, as the browser reads it. `undefined` when it cannot. */
export function readAudioDuration(file: Blob, timeoutMs = 5000): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    const done = (seconds?: number) => {
      clearTimeout(timer);
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? seconds : undefined);
    };
    const timer = setTimeout(() => done(), timeoutMs);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done();
    audio.src = url;
  });
}
