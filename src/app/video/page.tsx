"use client";

import dynamic from "next/dynamic";
import { VideoFallback } from "@/components/layout/fallbacks";

const VideoPage = dynamic(() => import("@/features/video/VideoPage"), { ssr: false, loading: () => <VideoFallback /> });

export default function Page() {
  return <VideoPage />;
}
