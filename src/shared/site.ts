/**
 * The canonical origin, used for `metadataBase`, the per-page canonicals, robots.txt and the sitemap.
 *
 * `APP_URL` (read by `next build`, so set it before building) wins, for local dev and for a preview
 * that wants its own domain in the metadata; everything else falls back to the real site. There is
 * deliberately no Vercel-domain step: `VERCEL_PROJECT_PRODUCTION_URL` is the project's production url,
 * which is a `*.vercel.app` host unless the custom domain happens to be the one Vercel considers
 * canonical — a silent way to ship the wrong canonical to Google.
 */
export const SITE_ORIGIN = process.env.APP_URL?.trim().replace(/\/+$/, "") || "https://higgsfree.com";

export const SITE_URL = new URL(SITE_ORIGIN);

/** An absolute url for `path` ("/", "/image", …) on the canonical origin. */
export function siteHref(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/** The one-line pitch: the homepage meta description, the og / twitter card text, and the JSON-LD. */
export const SITE_DESCRIPTION =
  "Generate AI images and video in your browser with your own OpenRouter or fal key. Open source, no account, no markup — every run billed at provider price.";

/** The source repo, for JSON-LD `sameAs`. */
export const SITE_REPO = "https://github.com/l-portet/higgsfree";
