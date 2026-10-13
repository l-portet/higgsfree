"use client";

import dynamic from "next/dynamic";
import { AssetsFallback } from "@/components/layout/fallbacks";

const AssetsPage = dynamic(() => import("@/features/assets/AssetsPage"), { ssr: false, loading: () => <AssetsFallback /> });

export default function Page() {
  return <AssetsPage />;
}
