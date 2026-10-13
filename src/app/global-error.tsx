"use client";

import RouteError from "@/features/RouteError";
import "./globals.css";

/** Replaces the root layout when the shell itself throws, so it has to render <html> and <body>. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en" className="dark">
      <body>
        <main className="flex min-h-dvh flex-col">
          <RouteError error={error} />
        </main>
      </body>
    </html>
  );
}
