import { cn } from "@/lib/cn";

export interface ExamplePrompt {
  prompt: string;
  /** CSS `background` for the little swatch: a gradient standing in for a thumbnail. */
  art: string;
}

export interface EmptyFeedProps {
  title: string;
  description: string;
  examples?: ExamplePrompt[];
  /** An example was clicked: the composer takes the prompt. */
  onExample?: (prompt: string) => void;
  className?: string;
}

/** What a feed shows before anything was generated: a heading, one balanced line of guidance, example prompts to click. */
export function EmptyFeed({ title, description, examples, onExample, className }: EmptyFeedProps) {
  return (
    <div className={cn("flex w-full flex-col items-center px-2 text-center", className)}>
      <h1 className="text-[20px] font-semibold leading-7 tracking-[-0.02em] text-fg">{title}</h1>
      <p className="mt-2 max-w-[400px] text-balance text-[13px] leading-5 text-fg-subtle">{description}</p>
      {examples?.length ? (
        <ul className="mt-6 flex w-full max-w-[528px] flex-col gap-2" aria-label="Example prompts">
          {examples.map((ex) => (
            <li key={ex.prompt}>
              <button
                type="button"
                onClick={() => onExample?.(ex.prompt)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-card border border-border bg-panel p-[11px] pr-4 text-left text-[13px] leading-[19px] text-fg-muted",
                  "transition-colors duration-150 hover:border-border-strong hover:bg-surface hover:text-fg",
                )}
              >
                <span aria-hidden="true" className="aspect-[4/3] w-[58px] shrink-0 rounded-thumb" style={{ background: ex.art }} />
                <span className="min-w-0">{ex.prompt}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
