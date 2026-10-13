import { Compass } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <Page className="flex flex-1 items-center justify-center">
      <EmptyState
        icon={<Compass />}
        title="Page not found"
        description="That page doesn't exist."
        action={
          <LinkButton href="/image" variant="primary">
            Go home
          </LinkButton>
        }
      />
    </Page>
  );
}
