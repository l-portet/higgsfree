"use client";

import dynamic from "next/dynamic";
import { FEED_CELL } from "@/components/FeedGrid";
import { FeedFallback } from "@/components/layout/fallbacks";

const ImagePage = dynamic(() => import("@/features/image/ImagePage"), { ssr: false, loading: () => <FeedFallback aspect={FEED_CELL.image} /> });

export default function Page() {
  return <ImagePage />;
}
