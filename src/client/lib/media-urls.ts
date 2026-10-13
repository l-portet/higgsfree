/**
 * Object URLs for media in the library, shared and ref-counted: a card, the lightbox and a
 * download link for the same file hold one `blob:` url, revoked a few seconds after the last
 * one lets go (StrictMode's double mount and lightbox prev/next never re-create it).
 */
import { useEffect, useState } from "react";
import { getMediaBlob } from "./db/media";
import { notFound } from "./errors";

interface Entry {
  refs: number;
  url?: string;
  loading?: Promise<string>;
  revokeTimer?: ReturnType<typeof setTimeout>;
}

export const REVOKE_GRACE_MS = 5_000;
/** How long a download link keeps its url after the click (revoking too early aborts the save in Firefox). */
const DOWNLOAD_HOLD_MS = 60_000;

const cache = new Map<string, Entry>();

function entryFor(id: string): Entry {
  let e = cache.get(id);
  if (!e) {
    e = { refs: 0 };
    cache.set(id, e);
  }
  return e;
}

/** Hold a url for `id` until the matching `releaseMediaUrl`. Rejects with a 404 when the media is gone. */
export function acquireMediaUrl(id: string): Promise<string> {
  const e = entryFor(id);
  e.refs++;
  if (e.revokeTimer) {
    clearTimeout(e.revokeTimer);
    e.revokeTimer = undefined;
  }
  if (e.url) return Promise.resolve(e.url);
  if (!e.loading) {
    e.loading = getMediaBlob(id)
      .then((blob) => {
        if (!blob) throw notFound(`Media ${id} not found`);
        if (cache.get(id) !== e) return URL.createObjectURL(blob); // released meanwhile; caller gets a one-off url
        e.url = URL.createObjectURL(blob);
        return e.url;
      })
      .finally(() => {
        e.loading = undefined;
      });
  }
  return e.loading;
}

export function releaseMediaUrl(id: string): void {
  const e = cache.get(id);
  if (!e) return;
  e.refs = Math.max(0, e.refs - 1);
  if (e.refs > 0) return;
  if (!e.url) {
    if (!e.loading) cache.delete(id);
    return;
  }
  e.revokeTimer = setTimeout(() => {
    if (e.refs > 0) return;
    if (e.url) URL.revokeObjectURL(e.url);
    cache.delete(id);
  }, REVOKE_GRACE_MS);
}

/** The object url for a media id, `undefined` on the first render, while loading, or when the file is missing. */
export function useMediaUrl(id: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!id) {
      setUrl(undefined);
      return;
    }
    let live = true;
    acquireMediaUrl(id)
      .then((u) => {
        if (live) setUrl(u);
      })
      .catch(() => {
        if (live) setUrl(undefined);
      });
    return () => {
      live = false;
      releaseMediaUrl(id);
    };
  }, [id]);
  return id ? url : undefined;
}

/** Save a media file through a hidden download link. Resolves once the click was issued. */
export async function downloadMedia(id: string, filename: string): Promise<void> {
  const url = await acquireMediaUrl(id);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => releaseMediaUrl(id), DOWNLOAD_HOLD_MS);
}

/** After the library was replaced or cleared: every url is stale. */
export function revokeAllMediaUrls(): void {
  for (const [id, e] of cache) {
    if (e.revokeTimer) clearTimeout(e.revokeTimer);
    if (e.url) URL.revokeObjectURL(e.url);
    cache.delete(id);
  }
}
