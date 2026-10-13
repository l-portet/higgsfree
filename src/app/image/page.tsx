"use client";

import dynamic from "next/dynamic";
import { FeedFallback } from "@/components/layout/fallbacks";

const ImagePage = dynamic(() => import("@/features/image/ImagePage"), { ssr: false, loading: () => <FeedFallback /> });

export default function Page() {
  return <ImagePage />;
}
