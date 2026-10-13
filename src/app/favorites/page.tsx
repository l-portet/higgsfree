"use client";

import dynamic from "next/dynamic";
import { FeedFallback } from "@/components/layout/fallbacks";

const FavoritesPage = dynamic(() => import("@/features/favorites/FavoritesPage"), { ssr: false, loading: () => <FeedFallback /> });

export default function Page() {
  return <FavoritesPage />;
}
