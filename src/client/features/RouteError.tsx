import { CircleAlert } from "lucide-react";
import { PROTECTED_STORAGE_KEYS } from "@/lib/settings";
import { clearAppStorage } from "@/lib/storage";
import { Page } from "@/components/layout/Page";
import { Button, LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

function describe(error: unknown): { title: string; detail: string } {
  if (error instanceof Error) return { title: error.message || error.name, detail: error.stack ?? "" };
  return { title: String(error), detail: "" };
}

/**
 * Error screen behind Next's `error.tsx` (inside the shell) and `global-error.tsx` (when the shell
 * itself throws), so it must not depend on providers from `Shell`.
 * "Reset local settings" wipes the `higgsfree.*` localStorage keys except the API key and the default
 * models: UI preferences are the usual cause of a render crash on load, the key and the library never are.
 */
export default function RouteError({ error }: { error: unknown }) {
  const { title, detail } = describe(error);

  const reset = () => {
    clearAppStorage(PROTECTED_STORAGE_KEYS);
    window.location.reload();
  };

  return (
    <Page className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-lg">
        <EmptyState
          icon={<CircleAlert />}
          title="Something went wrong"
          description="Reloading usually fixes it. If not, reset the local settings (model, prompt and filter preferences); your key and your library are kept."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => window.location.reload()}>
                Reload
              </Button>
              <Button variant="secondary" onClick={reset}>
                Reset local settings
              </Button>
              <LinkButton href="/image" variant="ghost">
                Go home
              </LinkButton>
            </div>
          }
          className="py-8"
        />
        <div role="alert" className="rounded-control border border-danger/25 bg-danger/5 p-3">
          <div className="mb-1 text-meta font-medium text-danger">{title}</div>
          {detail ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-mono text-fg-muted">{detail}</pre>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
