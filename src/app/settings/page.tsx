import type { Metadata } from "next";
import SettingsRedirect from "@/features/SettingsRedirect";

/** `noindex`: nothing but a redirect into the settings dialog, with no content of its own. */
export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SettingsRedirect />;
}
