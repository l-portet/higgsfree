"use client";

import dynamic from "next/dynamic";
import { HomeFallback } from "@/components/layout/fallbacks";

// Route-level code splitting, client-only: the pages read localStorage and the stores on first
// render, so they are not server-rendered; the fallback is shaped like the page it stands in for.
const HomePage = dynamic(() => import("@/features/home/HomePage"), { ssr: false, loading: () => <HomeFallback /> });

export default function Page() {
  return <HomePage />;
}
