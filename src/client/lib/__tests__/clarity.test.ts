import { afterEach, describe, expect, it, vi } from "vitest";
import { CLARITY_ID, loadClarity, shouldLoadClarity } from "../clarity";

function stubBrowser(hostname: string, flags: Record<string, unknown> = {}) {
  const tag: { async?: boolean; src?: string } = {};
  const first = { parentNode: { insertBefore: vi.fn() } };
  const win: Record<string, unknown> = { location: { hostname }, ...flags };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { createElement: vi.fn(() => tag), getElementsByTagName: vi.fn(() => [first]) });
  return { tag, first, win };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("shouldLoadClarity", () => {
  it("is on for a production build on a public hostname", () => {
    vi.stubEnv("NODE_ENV", "production");
    stubBrowser("higgsfree.com");
    expect(shouldLoadClarity()).toBe(true);
  });

  it.each(["development", "test"])("is off when NODE_ENV is %s", (env) => {
    vi.stubEnv("NODE_ENV", env);
    stubBrowser("higgsfree.com");
    expect(shouldLoadClarity()).toBe(false);
  });

  it.each(["localhost", "127.0.0.1"])("is off on %s", (hostname) => {
    vi.stubEnv("NODE_ENV", "production");
    stubBrowser(hostname);
    expect(shouldLoadClarity()).toBe(false);
  });

  it("is off only when CLARITY_DISABLED_ENV is exactly true", () => {
    vi.stubEnv("NODE_ENV", "production");
    stubBrowser("higgsfree.com", { CLARITY_DISABLED_ENV: true });
    expect(shouldLoadClarity()).toBe(false);
    stubBrowser("higgsfree.com", { CLARITY_DISABLED_ENV: false });
    expect(shouldLoadClarity()).toBe(true);
    stubBrowser("higgsfree.com", { CLARITY_DISABLED_ENV: "true" });
    expect(shouldLoadClarity()).toBe(true);
  });
});

describe("loadClarity", () => {
  it("injects the async tag ahead of the first script and queues calls until it loads", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { tag, first, win } = stubBrowser("higgsfree.com");
    loadClarity();
    expect(tag).toEqual({ async: true, src: `https://www.clarity.ms/tag/${CLARITY_ID}` });
    expect(first.parentNode.insertBefore).toHaveBeenCalledWith(tag, first);
    const clarity = win.clarity as ((...args: unknown[]) => void) & { q?: unknown[][] };
    clarity("set", "a", 1);
    expect(clarity.q).toEqual([["set", "a", 1]]);
  });

  it("keeps a clarity queue that already exists", () => {
    vi.stubEnv("NODE_ENV", "production");
    const existing = vi.fn();
    const { win } = stubBrowser("higgsfree.com", { clarity: existing });
    loadClarity();
    expect(win.clarity).toBe(existing);
  });

  it("touches nothing when a gate is closed", () => {
    vi.stubEnv("NODE_ENV", "production");
    const { first, win } = stubBrowser("higgsfree.com", { CLARITY_DISABLED_ENV: true });
    loadClarity();
    expect(first.parentNode.insertBefore).not.toHaveBeenCalled();
    expect(win.clarity).toBeUndefined();
  });
});

describe("CLARITY_ID", () => {
  it("defaults to the project's id, and an env var overrides it", async () => {
    expect(CLARITY_ID).toBe("z9kdvhwh47");
    vi.stubEnv("NEXT_PUBLIC_CLARITY_ID", " other-id ");
    vi.resetModules();
    expect((await import("../clarity")).CLARITY_ID).toBe("other-id");
  });
});
