/** Data URL and base64 helpers on browser primitives (`atob` / `btoa` / `FileReader`); no Buffer. */

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Chunked so a 25 MB image does not blow the argument limit of `String.fromCharCode`. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

export function parseDataUrl(s: string): { mime: string; bytes: Uint8Array<ArrayBuffer> } | undefined {
  if (!s.startsWith("data:")) return undefined;
  const comma = s.indexOf(",");
  if (comma < 0) return undefined;
  const header = s.slice(5, comma);
  const payload = s.slice(comma + 1);
  const parts = header.split(";");
  const mime = parts[0] || "application/octet-stream";
  try {
    if (parts.includes("base64")) return { mime, bytes: base64ToBytes(payload) };
    return { mime, bytes: new TextEncoder().encode(decodeURIComponent(payload)) };
  } catch {
    return undefined; // malformed base64 or percent-encoding; callers map this to a 400
  }
}

export function toDataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

/** The browser's own base64 encoder where there is one (`FileReader`), else the chunked `btoa` above. */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader === "undefined") return toDataUrl(blob.type || "application/octet-stream", new Uint8Array(await blob.arrayBuffer()));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read file"));
    reader.readAsDataURL(blob);
  });
}
