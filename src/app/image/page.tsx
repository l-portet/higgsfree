"use client";

import dynamic from "next/dynamic";
import { ImageFallback } from "@/components/layout/fallbacks";

const ImagePage = dynamic(() => import("@/features/image/ImagePage"), { ssr: false, loading: () => <ImageFallback /> });

export default function Page() {
  return <ImagePage />;
}
