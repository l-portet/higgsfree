import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import type { ReactNode } from "react";
import Shell from "@/components/layout/Shell";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-inter-tight", display: "swap" });

const DESCRIPTION = "Open-source AI image and video studio powered by your OpenRouter key.";

/** Absolute base for social-card urls: APP_URL, else the Vercel production domain, else local dev. */
function siteUrl(): URL {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return new URL(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return new URL(vercel ? `https://${vercel}` : "http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "higgsfree", template: "%s · higgsfree" },
  description: DESCRIPTION,
  applicationName: "higgsfree",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    siteName: "higgsfree",
    title: "higgsfree",
    description: "Open-source AI image and video studio on your OpenRouter key.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "higgsfree" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "higgsfree",
    description: "Open-source AI image and video studio on your OpenRouter key.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${interTight.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
