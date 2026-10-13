import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next build` also emits .next/standalone for the Docker image; Vercel ignores it.
  output: "standalone",
  // Native SQLite bindings (local `file:` databases) must not be bundled.
  serverExternalPackages: ["@libsql/client", "libsql"],
  // The default `file:` database path is statically known, so the tracer would otherwise ship a
  // local `data/` directory (database included) with the server; the TypeScript sources are
  // compiled into the bundle and never read at runtime.
  outputFileTracingExcludes: { "*": ["./data/**", "./src/**"] },
  // No next/image: generated media are dynamic URLs served straight from Vercel Blob / the media route.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
    ];
  },
};

export default nextConfig;
