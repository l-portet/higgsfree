import type { MetadataRoute } from "next";
import { siteHref } from "@shared/site";

/** Prerendered at build time, like the pages: nothing here depends on the request. */
export const dynamic = "force-static";

/**
 * robots.txt, prerendered by `next build`.
 *
 * `/_next/` and the `.txt` files are the build's own artefacts — the chunk graph and the RSC payloads
 * (`/index.txt`, `/video.txt`, `/__next.*.txt`), which are served as plain text and would otherwise be
 * crawlable duplicates of every page. Crawlers fetch `/robots.txt` itself without consulting these rules,
 * so the `.txt` pattern matching it is harmless.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/_next/", "/*.txt$", "/settings"],
    },
    sitemap: siteHref("/sitemap.xml"),
  };
}
