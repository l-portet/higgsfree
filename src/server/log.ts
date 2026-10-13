/** Concise single-line logger with ISO timestamps. Never log secrets. */
const ts = (): string => new Date().toISOString();

export const log = {
  info(msg: string, ...rest: unknown[]): void {
    console.log(`${ts()} ${msg}`, ...rest);
  },
  warn(msg: string, ...rest: unknown[]): void {
    console.warn(`${ts()} WARN ${msg}`, ...rest);
  },
  error(msg: string, ...rest: unknown[]): void {
    console.error(`${ts()} ERROR ${msg}`, ...rest);
  },
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
