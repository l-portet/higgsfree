/** Console logger with a fixed prefix (the console adds its own timestamps). Never log secrets. */
const PREFIX = "[higgsfree]";

export const log = {
  info(msg: string, ...rest: unknown[]): void {
    console.info(`${PREFIX} ${msg}`, ...rest);
  },
  warn(msg: string, ...rest: unknown[]): void {
    console.warn(`${PREFIX} ${msg}`, ...rest);
  },
  error(msg: string, ...rest: unknown[]): void {
    console.error(`${PREFIX} ${msg}`, ...rest);
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
