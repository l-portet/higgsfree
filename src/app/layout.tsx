import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import type { ReactNode } from "react";
import { Clarity } from "@/components/Clarity";
import Shell from "@/components/layout/Shell";
import { SITE_DESCRIPTION, SITE_URL } from "@shared/site";
import { DEFAULT_TITLE, card } from "./meta";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-inter-tight", display: "swap" });

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: { default: DEFAULT_TITLE, template: "%s · higgsfree" },
  description: SITE_DESCRIPTION,
  applicationName: "higgsfree",
  manifest: "/site.webmanifest",
  // No `alternates.canonical` here: a value in the layout is inherited by every page, which would
  // point all of them at one url. Each page declares its own.
  keywords: ["AI image generator", "AI video generator", "OpenRouter", "fal", "open source", "text to image", "text to video"],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  ...card({}),
};

const GA_ID = "G-SCFQ6KQ6L0";
/** Google tag endpoints, per https://developers.google.com/tag-platform/security/guides/csp (GA4). */
const GA_SCRIPT = "https://*.googletagmanager.com";
const GA_CONNECT = "https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com";
/** Microsoft Clarity's tag, recorder and uploads, per https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-csp. Its sync pixel redirects to c.bing.com. */
const CLARITY_ORIGIN = "https://*.clarity.ms";
const CLARITY_PIXEL = "https://c.bing.com";

/**
 * Production only (Next dev needs eval and websockets). The keys live in this browser, so the one
 * thing worth locking down is where a script on this origin may send data: OpenRouter, fal, kie.ai, APIMart, Revana
 * (their API hosts, upload targets and the CDNs their results come from), plus the Google Analytics
 * and Microsoft Clarity endpoints, and nothing else.
 */
const FAL_ORIGINS = "https://fal.run https://queue.fal.run https://rest.fal.ai https://api.fal.ai https://fal.media https://*.fal.media https://storage.googleapis.com";
const KIE_ORIGINS = "https://api.kie.ai https://kieai.redpandaai.co https://*.aiquickdraw.com";
const APIMART_ORIGINS = "https://api.apimart.ai https://upload.apimart.ai";
// Revana's API, and the Cloudflare R2 storage its uploads go to and its results redirect to.
const REVANA_ORIGINS = "https://api.revana.si https://*.r2.cloudflarestorage.com";
const OPENROUTER_ORIGIN = (process.env.NEXT_PUBLIC_OPENROUTER_BASE_URL ?? "").trim().replace(/\/+$/, "") || "https://openrouter.ai";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${GA_SCRIPT} ${CLARITY_ORIGIN}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${GA_CONNECT} ${CLARITY_ORIGIN} ${CLARITY_PIXEL}`,
  "media-src 'self' blob:",
  "font-src 'self'",
  `connect-src 'self' ${OPENROUTER_ORIGIN} ${FAL_ORIGINS} ${KIE_ORIGINS} ${APIMART_ORIGINS} ${REVANA_ORIGINS} ${GA_CONNECT} ${CLARITY_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `data-accent-intro`: the page opens on the old lime until Shell plays the sweep; `data-accent-sweep` holds
    // transitions off for the accent's leg of it alone (globals.css).
    <html lang="en" className={`dark ${inter.variable} ${interTight.variable}`} data-accent-intro="" data-accent-sweep="">
      {process.env.NODE_ENV === "production" ? (
        <head>
          <meta httpEquiv="Content-Security-Policy" content={CSP} />
        </head>
      ) : null}
      <body>
        <Shell>{children}</Shell>
        <Clarity />
      </body>
      {process.env.NODE_ENV === "production" ? <GoogleAnalytics gaId={GA_ID} /> : null}
    </html>
  );
}
