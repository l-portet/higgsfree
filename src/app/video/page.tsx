"use client";

import dynamic from "next/dynamic";
import { FEED_CELL } from "@/components/FeedGrid";
import { FeedFallback } from "@/components/layout/fallbacks";

const VideoPage = dynamic(() => import("@/features/video/VideoPage"), { ssr: false, loading: () => <FeedFallback aspect={FEED_CELL.video} statusLine /> });

export default function Page() {
  return <VideoPage />;
}
