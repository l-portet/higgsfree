import { useSettings } from "@/store/settings";
import { Page, PageHeader } from "@/components/layout/Page";
import { AboutCard } from "@/components/settings/AboutCard";
import { ApiKeyCard } from "@/components/settings/ApiKeyCard";
import { CreditsCard } from "@/components/settings/CreditsCard";
import { DefaultsCard } from "@/components/settings/DefaultsCard";
import { StorageCard } from "@/components/settings/StorageCard";

export default function SettingsPage() {
  const settings = useSettings((s) => s.settings);
  const server = useSettings((s) => s.server);

  return (
    <Page className="max-w-[760px] pb-16">
      <PageHeader
        title="Settings"
        description={
          server === "offline" && !settings
            ? "Server unreachable. Start the API to edit settings."
            : "Your OpenRouter key, default models and local storage."
        }
      />
      <div className="flex flex-col gap-4">
        <ApiKeyCard settings={settings} />
        <CreditsCard />
        <DefaultsCard settings={settings} />
        <StorageCard settings={settings} />
        <AboutCard settings={settings} />
      </div>
    </Page>
  );
}
