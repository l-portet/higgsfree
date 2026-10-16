import type { Metadata } from "next";
import VideoView from "@/features/video/VideoView";
import { SITE_DESCRIPTION, SITE_REPO, siteHref } from "@shared/site";
import { card } from "./meta";

/**
 * The front door is the Video view, rendered here rather than redirected to `/video`: a client-side
 * redirect left the most-linked url on the site a blank stub, and `/` and `/video` competing as
 * duplicates. `/video` still serves the same view for old links, and canonicals back to this page.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  ...card({ url: "/" }),
};

/** Tells Google what the page is, since the app itself renders in the browser and has little text to read. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "higgsfree",
  url: siteHref("/"),
  description: SITE_DESCRIPTION,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web browser",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  license: "https://opensource.org/licenses/MIT",
  sameAs: SITE_REPO,
  image: siteHref("/og-image.png"),
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <VideoView />
    </>
  );
}
