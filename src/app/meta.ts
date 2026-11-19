import type { Metadata } from "next";
import { SITE_DESCRIPTION } from "@shared/site";

export const DEFAULT_TITLE = "higgsfree — open-source AI image & video studio";

const CARD_IMAGE = { url: "/og-image.png", width: 1200, height: 630, alt: "higgsfree — The open-source AI studio at provider price" };

export interface CardInput {
  /** The page's own url. Omitted in the layout, which has no url of its own. */
  url?: string;
  /** The title as it appears on the card: the `%s · higgsfree` title template is not applied here. */
  title?: string;
  description?: string;
}

/**
 * The complete `openGraph` and `twitter` blocks for one page.
 *
 * Next replaces these two objects wholesale rather than merging them into the layout's, so a page that
 * sets only a url or only a title silently drops the card image, the site name and the card type it
 * looked like it was inheriting. Every page that touches either one builds it here instead.
 */
export function card({ url, title = DEFAULT_TITLE, description = SITE_DESCRIPTION }: CardInput): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: { type: "website", siteName: "higgsfree", url, title, description, images: [CARD_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [CARD_IMAGE.url] },
  };
}
