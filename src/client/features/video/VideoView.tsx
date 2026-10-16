"use client";

import dynamic from "next/dynamic";
import { FEED_CELL } from "@/components/FeedGrid";
import { FeedFallback } from "@/components/layout/fallbacks";

/**
 * The video feed, client-only: it reads the library out of IndexedDB, which only exists in the browser.
 * `ssr: false` cannot live in a Server Component, so it sits here and the route's `page.tsx` stays a
 * Server Component — the only place `metadata` may be exported from. Rendered by both `/` and `/video`.
 */
const VideoPage = dynamic(() => import("@/features/video/VideoPage"), {
  ssr: false,
  loading: () => <FeedFallback aspect={FEED_CELL.video} statusLine />,
});

export default function VideoView() {
  return <VideoPage />;
}
