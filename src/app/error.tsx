"use client";

import RouteError from "@/features/RouteError";

/** Page-level error boundary; renders inside the shell. */
export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  return <RouteError error={error} />;
}
