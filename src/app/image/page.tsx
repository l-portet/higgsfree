import type { Metadata } from "next";
import ImageView from "@/features/image/ImageView";
import { card } from "../meta";

const TITLE = "AI image generation";
const DESCRIPTION =
  "Generate images from a prompt with FLUX.1 Kontext, Ideogram 4.5, Gemini and more, on your own OpenRouter or fal key. Open source, no account, billed at provider price.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/image" },
  ...card({ url: "/image", title: `${TITLE} · higgsfree`, description: DESCRIPTION }),
};

export default function Page() {
  return <ImageView />;
}
