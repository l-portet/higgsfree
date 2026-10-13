/** The key and the defaults in localStorage, never leaked; uploads are sniffed, not trusted. */
import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "@shared/models";
import * as api from "../api";
import { getMediaBlob } from "../db/media";
import { KEY_STORAGE, PROTECTED_STORAGE_KEYS } from "../settings";
import { clearAppStorage, writeJson } from "../storage";
import { PNG_2X2 } from "../../__tests__/mock-openrouter";

const KEY = "sk-or-v1-abcdefghijklmnopqrstuvwxyz0123";

describe("settings", () => {
  it("stores the key in localStorage and only ever shows it masked", async () => {
    expect(await api.getSettings()).toEqual({ hasKey: false, defaults: { imageModel: DEFAULT_IMAGE_MODEL, videoModel: DEFAULT_VIDEO_MODEL } });
    const saved = await api.updateSettings({ apiKey: ` ${KEY} ` });
    expect(saved).toMatchObject({ hasKey: true, keyMasked: "sk-or-v1-…0123" });
    expect(JSON.stringify(saved)).not.toContain("abcdefgh");
    expect(localStorage.getItem(KEY_STORAGE)).toBe(JSON.stringify(KEY));
    expect((await api.updateSettings({ apiKey: "" })).hasKey).toBe(false);
    expect(localStorage.getItem(KEY_STORAGE)).toBeNull();
    await expect(api.getCredits()).rejects.toMatchObject({ status: 401 });
  });

  it("validates default models against the catalog and keeps the old values on a bad one", async () => {
    await expect(api.updateSettings({ defaults: { imageModel: "nope/x" } })).rejects.toMatchObject({ status: 400, error: "Unknown image model: nope/x" });
    await expect(api.updateSettings({ defaults: { videoModel: "nope/y" } })).rejects.toMatchObject({ status: 400 });
    await expect(api.updateSettings({ defaults: { videoModel: "runway/aleph-2" } })).rejects.toMatchObject({ status: 400 }); // hidden
    expect((await api.getSettings()).defaults).toEqual({ imageModel: DEFAULT_IMAGE_MODEL, videoModel: DEFAULT_VIDEO_MODEL });
    const next = await api.updateSettings({ defaults: { imageModel: "krea/krea-2-large", videoModel: "kwaivgi/kling-v3.0-pro" } });
    expect(next.defaults).toEqual({ imageModel: "krea/krea-2-large", videoModel: "kwaivgi/kling-v3.0-pro" });
    expect((await api.updateSettings({ defaults: { imageModel: "google/gemini-2.5-flash-image" } })).defaults.videoModel).toBe("kwaivgi/kling-v3.0-pro");
  });

  it("survives 'Reset local settings'", async () => {
    await api.updateSettings({ apiKey: KEY, defaults: { imageModel: "krea/krea-2-large" } });
    writeJson("higgsfree.composer", { mode: "video" });
    clearAppStorage(PROTECTED_STORAGE_KEYS);
    expect(localStorage.getItem("higgsfree.composer")).toBeNull();
    expect(await api.getSettings()).toMatchObject({ hasKey: true, defaults: { imageModel: "krea/krea-2-large" } });
  });
});

describe("upload", () => {
  it("sniffs the bytes: PNG is stored with its dimensions, anything else is refused", async () => {
    const png = await api.upload(new Blob([PNG_2X2], { type: "application/octet-stream" }));
    expect(png.media).toMatchObject({ mime: "image/png", bytes: PNG_2X2.length, width: 2, height: 2 });
    expect(png.media.id).toMatch(/^up_[A-Za-z0-9_-]{12}\.png$/);
    expect((await getMediaBlob(png.media.id))?.type).toBe("image/png");
    const pdf = new Blob([new TextEncoder().encode("%PDF-1.4 not an image")], { type: "image/png" }); // the declared type lies
    await expect(api.upload(pdf)).rejects.toMatchObject({ status: 400, error: expect.stringContaining("Unsupported file type") });
    const gif = new Blob([new TextEncoder().encode("GIF89a\u0001\u0000\u0001\u0000")]);
    await expect(api.upload(gif)).rejects.toMatchObject({ status: 400 });
    await expect(api.upload(new Blob([]))).rejects.toMatchObject({ status: 400, error: "Empty file" });
    await expect(api.upload(new Blob([new Uint8Array(25 * 1024 * 1024 + 1)]))).rejects.toMatchObject({ status: 413 });
  });
});
