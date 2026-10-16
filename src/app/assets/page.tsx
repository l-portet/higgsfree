import type { Metadata } from "next";
import AssetsView from "@/features/assets/AssetsView";

/**
 * `noindex`: this is a view onto a library that lives in the visitor's own browser, so to a crawler it
 * is an empty grid — indistinguishable from `/favorites` and from every other visitor's. `follow` stays
 * on so the nav links out of here still carry weight.
 */
export const metadata: Metadata = {
  title: "Assets",
  description: "Every image and video you have generated, in this browser.",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <AssetsView />;
}
