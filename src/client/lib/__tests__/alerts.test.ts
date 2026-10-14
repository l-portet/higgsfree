/** "Video ready" alerts: stored prefs, the ding, and the notification (permission, text, click). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Generation } from "@shared/types";

let oscillators = 0;
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => undefined);
  createGain() {
    const ramp = vi.fn();
    return { gain: { setValueAtTime: ramp, exponentialRampToValueAtTime: ramp }, connect: (n: unknown) => n };
  }
  createOscillator() {
    oscillators++;
    return { type: "", frequency: { setValueAtTime: vi.fn() }, connect: (n: unknown) => n, start: vi.fn(), stop: vi.fn() };
  }
}

const shown: { title: string; opts: NotificationOptions; instance: { onclick: null | (() => void); close: () => void } }[] = [];
let permission: NotificationPermission = "granted";
class FakeNotification {
  static get permission() {
    return permission;
  }
  static requestPermission = vi.fn(async () => permission);
  onclick: null | (() => void) = null;
  close = vi.fn();
  constructor(title: string, opts: NotificationOptions) {
    shown.push({ title, opts, instance: this });
  }
}

const focus = vi.fn();
const g = { id: "gen_abcdefgh", modelName: "Kling 3.0", prompt: "  a slow   dolly shot ".repeat(10) } as Generation;

async function load() {
  vi.resetModules();
  return import("../alerts");
}

beforeEach(() => {
  oscillators = 0;
  shown.length = 0;
  permission = "granted";
  focus.mockClear();
  vi.stubGlobal("window", { AudioContext: FakeAudioContext, focus, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("Notification", FakeNotification);
});

describe("video alerts", () => {
  it("are off until switched on, and keep only real booleans", async () => {
    const a = await load();
    expect(a.readAlertPrefs()).toEqual({ sound: false, notify: false });
    a.announceVideoReady(g);
    expect(oscillators).toBe(0);
    expect(shown).toHaveLength(0);
    localStorage.setItem(a.ALERTS_STORAGE, JSON.stringify({ sound: "yes", notify: true }));
    expect(a.readAlertPrefs()).toEqual({ sound: false, notify: true });
    expect(a.writeAlertPrefs({ sound: true })).toEqual({ sound: true, notify: true });
  });

  it("dings, and notifies with the model and a clipped prompt; the notification is silent when the ding plays", async () => {
    const a = await load();
    a.writeAlertPrefs({ sound: true, notify: true });
    const onClick = vi.fn();
    a.announceVideoReady(g, onClick);
    expect(oscillators).toBe(3);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.title).toBe("Video ready");
    expect(shown[0]?.opts).toMatchObject({ tag: g.id, icon: "/icon-192.png", silent: true });
    expect(shown[0]?.opts.body).toMatch(/^Kling 3\.0 · a slow dolly shot a slow dolly shot/);
    expect(shown[0]?.opts.body?.endsWith("…")).toBe(true);
    shown[0]?.instance.onclick?.();
    expect(focus).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalled();
    expect(shown[0]?.instance.close).toHaveBeenCalled();
  });

  it("notifies only with permission, and only when switched on", async () => {
    const a = await load();
    a.writeAlertPrefs({ sound: false, notify: true });
    permission = "default";
    a.announceVideoReady(g);
    permission = "denied";
    a.announceVideoReady(g);
    expect(shown).toHaveLength(0);
    permission = "granted";
    a.announceVideoReady(g);
    expect(shown[0]?.opts.silent).toBe(false);
    a.writeAlertPrefs({ notify: false });
    a.announceVideoReady(g);
    expect(shown).toHaveLength(1);
    expect(oscillators).toBe(0);
  });

  it("reports a browser without notifications as unsupported", async () => {
    vi.stubGlobal("Notification", undefined);
    const a = await load();
    expect(a.notificationSupport()).toBe("unsupported");
    expect(await a.requestNotificationPermission()).toBe("unsupported");
    expect(a.showVideoNotification(g)).toBe(false);
  });
});
