/**
 * Keeps password managers out of every field: none of the app's inputs is a login. `autoComplete="off"`
 * alone is ignored by most of them, so each one's own opt-out is set too (1Password, LastPass,
 * Bitwarden, Dashlane). Key fields are also not `type="password"` (see `Input`'s `masked`), which
 * is what makes managers offer to save or fill.
 */
export const NO_AUTOFILL = {
  autoComplete: "off",
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;

let textSecurity: boolean | undefined;

/** Whether the browser can mask a text field with CSS (`-webkit-text-security`); otherwise a password field is used. */
export function supportsTextSecurity(): boolean {
  if (textSecurity === undefined) {
    textSecurity = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("-webkit-text-security", "disc");
  }
  return textSecurity;
}
