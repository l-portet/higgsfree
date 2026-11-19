import { BookOpen, ExternalLink, Github, Info } from "lucide-react";
import { GITHUB_URL } from "@/lib/constants";
import { Row, SettingsCard } from "./SettingsCard";

const OPENROUTER_DOCS_URL = "https://openrouter.ai/docs";
/** Inlined at build time; unset in dev. */
const APP_VERSION = (process.env.NEXT_PUBLIC_APP_VERSION ?? "").trim() || "dev";

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

export function AboutCard() {
  return (
    <SettingsCard icon={<Info />} title="About" description="Open-source studio on your OpenRouter key. Runs in your browser; only ByteDance and Replicate calls pass through the server, which keeps nothing.">
      <dl className="divide-y divide-border">
        <Row label="Version" mono>
          {`v${APP_VERSION}`}
        </Row>
        <Row label="Data">This browser (IndexedDB)</Row>
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
