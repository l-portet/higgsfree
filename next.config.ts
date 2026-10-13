import { createRequire } from "node:module";
import type { NextConfig } from "next";

const { version } = createRequire(import.meta.url)("./package.json") as { version: string };

const nextConfig: NextConfig = {
  // A static site: `next build` writes out/ (one HTML file per route plus the assets). There is no server code.
  output: "export",
  // Generated media are blob: object urls; next/image is not used.
  images: { unoptimized: true },
  // Inlined at build time (the About card).
  env: { NEXT_PUBLIC_APP_VERSION: version },
};

export default nextConfig;
