import { createRequire } from "node:module";
import type { NextConfig } from "next";

const require = createRequire(import.meta.url);
const { version } = require("./package.json") as { version: string };

/** `NEXT_OUTPUT=standalone` (the Dockerfile): a self-contained Node server in .next/standalone. */
const standalone = process.env.NEXT_OUTPUT === "standalone";

const nextConfig: NextConfig = {
  // Static pages (prerendered at build time) plus one server route, the ByteDance pass-through
  // (src/app/api/bytedance): ModelArk refuses browser calls, so those go through this server, which stores nothing.
  // Everything else still runs in the browser. Vercel runs the route as a function; elsewhere it needs `next start`
  // or the standalone server.
  ...(standalone
    ? {
        output: "standalone" as const,
        // Vercel adds these from vercel.json; a standalone server sends the same ones itself.
        headers: async () => (require("./vercel.json") as { headers: Awaited<ReturnType<NonNullable<NextConfig["headers"]>>> }).headers,
      }
    : {}),
  poweredByHeader: false,
  // Generated media are blob: object urls; next/image is not used.
  images: { unoptimized: true },
  // Inlined at build time (the About card).
  env: { NEXT_PUBLIC_APP_VERSION: version },
};

export default nextConfig;
