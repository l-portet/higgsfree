/** Client-side unique id for transient UI records (reference images, frames). */
export function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

/** `size` url-safe characters (nanoid's alphabet), for generation, batch and media ids. */
export function shortId(size = 12): string {
  const bytes = new Uint8Array(size);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) crypto.getRandomValues(bytes);
  else for (let i = 0; i < size; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b & 63];
  return out;
}
