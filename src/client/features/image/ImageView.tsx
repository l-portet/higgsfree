"use client";

import dynamic from "next/dynamic";
import { FEED_CELL } from "@/components/FeedGrid";
import { FeedFallback } from "@/components/layout/fallbacks";

/** The image feed, client-only (the library lives in IndexedDB). See VideoView for why this file exists. */
const ImagePage = dynamic(() => import("@/features/image/ImagePage"), {
  ssr: false,
  loading: () => <FeedFallback aspect={FEED_CELL.image} />,
});

export default function ImageView() {
  return <ImagePage />;
}
