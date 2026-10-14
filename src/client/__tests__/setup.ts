/**
 * Test environment: plain Node (its Blob survives fake-indexeddb's structured clone, jsdom's
 * does not), a fresh IndexedDB and an empty localStorage for every test. The engine's own
 * fallbacks cover `navigator.locks` and `FileReader`, which Node lacks.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, vi } from "vitest";
import { closeDb } from "@/lib/db/index";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

const hasStorage = (): boolean => {
  try {
    return typeof localStorage === "object" && localStorage !== null && typeof localStorage.getItem === "function";
  } catch {
    return false;
  }
};
if (!hasStorage()) Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true, writable: true });

/** Blobs behind the `blob:` urls handed out in this test, so assertions can read them back. */
export const objectUrls = new Map<string, Blob>();
let urlCounter = 0;

beforeEach(() => {
  // No test reaches the network: suites that need fetch install a mock (mock-openrouter.ts or vi.stubGlobal).
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    throw new TypeError(`network disabled in tests: ${input instanceof Request ? input.url : String(input)}`);
  });
  closeDb();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  objectUrls.clear();
  URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    const url = `blob:test/${++urlCounter}`;
    if (blob instanceof Blob) objectUrls.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    objectUrls.delete(url);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
