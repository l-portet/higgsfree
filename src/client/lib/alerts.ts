/**
 * "Video ready" alerts: a short ding (synthesized with Web Audio, no file to ship) and a system
 * notification, each switched on in Settings › Notifications and stored in this browser.
 *
 * They fire from the engine's video-completed hook, which runs only in the tab that drove the job
 * (it holds the job's Web Lock), so several open tabs still give one ding and one notification.
 * This is the Notifications API: it needs this site open in a tab (in the background is fine). True
 * Web Push, with the site closed, would need a server, and the app has none.
 */
import type { Generation } from "@shared/types";
import { errorMessage, log } from "./log";
import { readJson, writeJson } from "./storage";

export const ALERTS_STORAGE = "higgsfree.videoAlerts";

export interface AlertPrefs {
  /** Ding when a video is ready. */
  sound: boolean;
  /** System notification when a video is ready. */
  notify: boolean;
}

const DEFAULTS: AlertPrefs = { sound: false, notify: false };

export function readAlertPrefs(): AlertPrefs {
  const raw = readJson<Record<string, unknown>>(ALERTS_STORAGE, {});
  return { sound: raw.sound === true, notify: raw.notify === true };
}

export function writeAlertPrefs(next: Partial<AlertPrefs>): AlertPrefs {
  const prefs = { ...DEFAULTS, ...readAlertPrefs(), ...next };
  writeJson(ALERTS_STORAGE, prefs);
  return prefs;
}

// ---------- the ding ----------

let ctx: AudioContext | undefined;

function audioContext(): AudioContext | undefined {
  if (ctx) return ctx;
  const Ctor = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
  if (!Ctor) return undefined;
  try {
    ctx = new Ctor();
  } catch {
    return undefined;
  }
  return ctx;
}

/**
 * Browsers keep audio muted until the page has been clicked or typed in. A video can finish long after
 * a reload, so unlock the audio on the first interaction (while the sound is on); the ding can then play
 * with the tab in the background. Returns the cleanup.
 */
export function primeAudioOnInteraction(): () => void {
  const prime = () => {
    if (!readAlertPrefs().sound) return;
    const c = audioContext();
    if (c && c.state === "suspended") void c.resume().catch(() => undefined);
  };
  const opts = { capture: true, passive: true } as const;
  window.addEventListener("pointerdown", prime, opts);
  window.addEventListener("keydown", prime, opts);
  return () => {
    window.removeEventListener("pointerdown", prime, opts);
    window.removeEventListener("keydown", prime, opts);
  };
}

/** A bell-like ding: a sine at C6 with a quieter octave and a soft inharmonic partial, struck and left to ring for about a second. */
export function playDing(): void {
  const c = audioContext();
  if (!c) return;
  if (c.state === "suspended") void c.resume().catch(() => undefined);
  const now = c.currentTime + 0.02;
  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.22, now + 0.008);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
  master.connect(c.destination);
  for (const [freq, level, decay] of [
    [1046.5, 1, 1.3],
    [2093, 0.35, 0.7],
    [2885, 0.12, 0.35],
  ] as const) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + 1.4);
  }
}

// ---------- the notification ----------

export type NotifySupport = "granted" | "default" | "denied" | "unsupported";

export function notificationSupport(): NotifySupport {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/** Ask for permission (call it from a click: Safari and Firefox only ask inside one). */
export async function requestNotificationPermission(): Promise<NotifySupport> {
  if (notificationSupport() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return notificationSupport();
  }
}

/** "Kling 3.0 · a slow dolly shot through a neon market…" */
function notificationBody(g: Pick<Generation, "modelName" | "prompt">): string {
  const prompt = g.prompt.trim().replace(/\s+/g, " ");
  const clipped = prompt.length > 90 ? `${prompt.slice(0, 89)}…` : prompt;
  return clipped ? `${g.modelName} · ${clipped}` : g.modelName;
}

/**
 * Show "Video ready" (or `title`) when permission is granted. `tag` replaces an earlier notification for
 * the same run instead of stacking a second one. Some mobile browsers only notify through a service
 * worker; there it does nothing. Returns whether a notification was shown.
 */
export function showVideoNotification(g: Pick<Generation, "id" | "modelName" | "prompt">, onClick?: () => void, opts: { title?: string; silent?: boolean } = {}): boolean {
  if (notificationSupport() !== "granted") return false;
  try {
    const n = new Notification(opts.title ?? "Video ready", { body: notificationBody(g), icon: "/icon-192.png", tag: g.id, silent: opts.silent });
    n.onclick = () => {
      window.focus();
      n.close();
      onClick?.();
    };
    return true;
  } catch (err) {
    log.warn(`notification failed: ${errorMessage(err)}`);
    return false;
  }
}

/** The engine's video-completed hook: the ding and / or the notification, as set in Settings. */
export function announceVideoReady(g: Generation, onClick?: () => void): void {
  const prefs = readAlertPrefs();
  if (prefs.sound) playDing();
  // The ding is the sound: keep the system's own notification sound out of it.
  if (prefs.notify) showVideoNotification(g, onClick, { silent: prefs.sound });
}
