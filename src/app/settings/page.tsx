"use client";

import dynamic from "next/dynamic";
import { SettingsFallback } from "@/components/layout/fallbacks";

const SettingsPage = dynamic(() => import("@/features/settings/SettingsPage"), { ssr: false, loading: () => <SettingsFallback /> });

export default function Page() {
  return <SettingsPage />;
}
