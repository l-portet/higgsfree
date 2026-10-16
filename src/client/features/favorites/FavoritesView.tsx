"use client";

import dynamic from "next/dynamic";
import { FeedFallback } from "@/components/layout/fallbacks";

/** Client-only (the library lives in IndexedDB). See VideoView for why this file exists. */
const FavoritesPage = dynamic(() => import("@/features/favorites/FavoritesPage"), { ssr: false, loading: () => <FeedFallback /> });

export default function FavoritesView() {
  return <FavoritesPage />;
}
