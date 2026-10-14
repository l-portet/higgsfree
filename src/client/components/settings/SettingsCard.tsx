import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SettingsCardProps {
  /** DOM id for `/settings#<id>` links. */
  id?: string;
  icon?: ReactNode;
  title: ReactNode;
  /** Small badge / status pill rendered next to the title. */
  badge?: ReactNode;
  description?: ReactNode;
  /** Right-aligned header actions (buttons). */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Surface card used by every Settings section: icon · title · badge, muted description, body. */
export function SettingsCard({ id: domId, icon, title, badge, description, actions, children, className }: SettingsCardProps) {
  const id = useId();
  return (
    // scroll-mt clears the fixed nav when a `#id` link scrolls the card into view.
    <section id={domId} aria-labelledby={id} className={cn("scroll-mt-20 rounded-panel border border-border bg-surface p-5", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon ? <span className="inline-flex shrink-0 text-fg-muted [&_svg]:size-4">{icon}</span> : null}
            <h2 id={id} className="text-heading">
              {title}
            </h2>
            {badge}
          </div>
          {description ? <p className="mt-1 text-body text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

/** Uppercase 11px field label. */
export function FieldLabel({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn("mb-1.5 block text-label", className)}
      {...props}
    />
  );
}

/** `dt`/`dd` row for key–value lists (use inside a `<dl className="divide-y divide-border">`). */
export function Row({ label, children, mono, className }: { label: ReactNode; children: ReactNode; mono?: boolean; className?: string }) {
  if (children === undefined || children === null || children === "") return null;
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2", className)}>
      <dt className="shrink-0 text-body text-fg-subtle">{label}</dt>
      <dd className={cn("min-w-0 text-right tabular-nums", mono ? "break-all text-mono text-fg" : "text-body text-fg")}>{children}</dd>
    </div>
  );
}

/** Inline code chip for env var / file names. */
export function Code({ className, ...props }: ComponentProps<"code">) {
  return (
    <code
      className={cn("rounded-field bg-surface-3 px-1 py-0.5 font-mono text-[11px] text-fg-muted", className)}
      {...props}
    />
  );
}
