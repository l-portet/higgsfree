import { BookOpen, ExternalLink, Github, Info } from "lucide-react";
import type { SettingsResponse } from "@shared/types";
import { cn } from "@/lib/cn";
import { GITHUB_URL } from "@/lib/constants";
import { useSettings, type ServerStatus } from "@/store/settings";
import { Row, SettingsCard } from "./SettingsCard";

const OPENROUTER_DOCS_URL = "https://openrouter.ai/docs";

const STATUS: Record<ServerStatus, { label: string; dot: string }> = {
  online: { label: "Online", dot: "bg-success" },
  offline: { label: "Offline", dot: "bg-danger" },
  unknown: { label: "Connecting…", dot: "bg-fg-faint" },
};

function ExternalRow({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-body font-medium text-fg underline-offset-4 transition-colors hover:underline [&_svg]:size-3.5"
    >
      {icon}
      {children}
      <ExternalLink className="text-fg-faint" aria-hidden="true" />
    </a>
  );
}

export function AboutCard({ settings }: { settings: SettingsResponse | null }) {
  const server = useSettings((s) => s.server);
  const status = STATUS[server];

  return (
    <SettingsCard icon={<Info />} title="About" description="Open-source, self-hosted studio on your OpenRouter key.">
      <dl className="divide-y divide-border">
        <Row label="Version" mono>
          {settings?.version ? `v${settings.version}` : "—"}
        </Row>
        <Row label="Server">
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", status.dot)} aria-hidden="true" />
            {status.label}
          </span>
        </Row>
        <Row label="License">MIT</Row>
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <ExternalRow href={GITHUB_URL} icon={<Github aria-hidden="true" />}>
          GitHub
        </ExternalRow>
        <ExternalRow href={OPENROUTER_DOCS_URL} icon={<BookOpen aria-hidden="true" />}>
          OpenRouter docs
        </ExternalRow>
      </div>
      <p className="mt-4 text-caption">Not affiliated with Higgsfield AI. Model names belong to their owners.</p>
    </SettingsCard>
  );
}
