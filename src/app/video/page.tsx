"use client";

import dynamic from "next/dynamic";
import { FeedFallback } from "@/components/layout/fallbacks";

const VideoPage = dynamic(() => import("@/features/video/VideoPage"), { ssr: false, loading: () => <FeedFallback /> });

export default function Page() {
  return <VideoPage />;
}
