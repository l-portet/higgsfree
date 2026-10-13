/** Example prompts for the empty feeds. Clicking one fills the composer; the swatch stands in for a thumbnail. */
import type { ExamplePrompt } from "@/components/EmptyFeed";

export const IMAGE_EXAMPLES: ExamplePrompt[] = [
  {
    prompt: "Matte ceramic espresso cup on wet slate, rim light, steam caught mid-curl",
    art: "radial-gradient(120% 90% at 22% 20%, #6b4a8f 0%, #3a2651 48%, #1a1324 100%)",
  },
  {
    prompt: "Editorial still life: brutalist concrete vases with wild poppies, hard noon shadows",
    art: "radial-gradient(120% 90% at 70% 30%, #7a3f6e 0%, #43264a 50%, #1c1120 100%)",
  },
  {
    prompt: "Hands kneading dough on floured marble, window light, muted palette, close crop",
    art: "radial-gradient(120% 90% at 30% 70%, #4a4a8c 0%, #2b2b5a 50%, #14142a 100%)",
  },
];

export const VIDEO_EXAMPLES: ExamplePrompt[] = [
  {
    prompt: "Slow aerial dolly over fog-covered pine forest at dawn, volumetric light through the canopy",
    art: "radial-gradient(120% 90% at 30% 25%, #4a74b0 0%, #2a3f66 50%, #0e1424 100%)",
  },
  {
    prompt: "Steadicam walk through an empty greenhouse, dust in shafts of light, slow reveal",
    art: "radial-gradient(120% 90% at 40% 70%, #8a5a1f 0%, #4a3010 50%, #1a1206 100%)",
  },
  {
    prompt: "Locked-off shot of a diner at 3am, one customer, rain outside, sign flickering",
    art: "radial-gradient(120% 90% at 60% 40%, #6a8a2a 0%, #38481c 50%, #121a08 100%)",
  },
];
