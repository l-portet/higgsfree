"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FeedFallback } from "@/components/layout/fallbacks";
import { useUi, type SettingsSection } from "@/store/ui";

const BY_HASH: Record<string, SettingsSection> = { keys: "keys", providers: "keys", fal: "keys", openrouter: "keys", library: "library", about: "about" };

/** Settings live in a dialog now. Old `/settings` links (and `#fal`, `#providers`…) open it over the Image view. */
export default function SettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    useUi.getState().openSettings(BY_HASH[window.location.hash.slice(1)] ?? "keys");
    router.replace("/image");
  }, [router]);
  return <FeedFallback />;
}
