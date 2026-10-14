"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FeedFallback } from "@/components/layout/fallbacks";

/** The Video view is the front door. A static export has no server redirect, so `/` hops on the client. */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/video");
  }, [router]);
  return <FeedFallback />;
}
