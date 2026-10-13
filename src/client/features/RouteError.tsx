import { CircleAlert } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { clearAppStorage } from "@/lib/storage";
import { Page } from "@/components/layout/Page";
import { Button, LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

function describe(error: unknown): { title: string; detail: string } {
  if (isRouteErrorResponse(error)) {
    return { title: `${error.status} ${error.statusText}`.trim(), detail: typeof error.data === "string" ? error.data : "" };
  }
  if (error instanceof Error) return { title: error.message || error.name, detail: error.stack ?? "" };
  return { title: String(error), detail: "" };
}

/**
 * Route-level error boundary (React Router `errorElement`). Renders inside the shell for page errors,
 * standalone if the shell itself throws, so it must not depend on providers from `Shell`.
 * "Reset local settings" wipes every `oh.*` localStorage key: the usual cause of a render crash on load.
 */
export default function RouteError() {
  const error = useRouteError();
  const { title, detail } = describe(error);

  const reset = () => {
    clearAppStorage();
    window.location.reload();
  };

  return (
    <Page className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-lg">
        <EmptyState
          icon={<CircleAlert />}
          title="Something went wrong"
          description="Reloading usually fixes it. If not, reset the local settings (model, prompt and filter preferences); your generations stay safe on the server."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => window.location.reload()}>
                Reload
              </Button>
              <Button variant="secondary" onClick={reset}>
                Reset local settings
              </Button>
              <LinkButton to="/" variant="ghost">
                Go home
              </LinkButton>
            </div>
          }
          className="py-8"
        />
        <div role="alert" className="rounded-md border border-danger/25 bg-danger/5 p-3">
          <div className="mb-1 text-meta font-medium text-danger">{title}</div>
          {detail ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-mono text-fg-muted">{detail}</pre>
          ) : null}
        </div>
      </div>
    </Page>
  );
}
