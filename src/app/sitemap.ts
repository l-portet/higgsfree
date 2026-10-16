import type { MetadataRoute } from "next";
import { siteHref } from "@shared/site";

/** `output: "export"` prerenders this only when the handler is explicitly static. */
export const dynamic = "force-static";

/**
 * The two pages worth indexing. Left out on purpose: `/video`, which is the same view as `/` and
 * canonicals to it, and `/assets`, `/favorites` and `/settings` — all views onto a library that lives
 * in the visitor's own browser, so to a crawler they are empty and interchangeable. Those carry `noindex`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: siteHref("/"), lastModified, changeFrequency: "weekly", priority: 1 },
    { url: siteHref("/image"), lastModified, changeFrequency: "weekly", priority: 0.8 },
  ];
}
