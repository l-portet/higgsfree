"use client";

import dynamic from "next/dynamic";
import { AssetsFallback } from "@/components/layout/fallbacks";

/** Client-only (the library lives in IndexedDB). See VideoView for why this file exists. */
const AssetsPage = dynamic(() => import("@/features/assets/AssetsPage"), { ssr: false, loading: () => <AssetsFallback /> });

export default function AssetsView() {
  return <AssetsPage />;
}
