import type { Metadata } from "next";
import VideoView from "@/features/video/VideoView";
import { card } from "../meta";

/**
 * The same view as `/`, kept for links that already point here (the nav sends the Video tab to `/`).
 * The canonical points at `/` so the two are not read as duplicates.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  ...card({ url: "/" }),
};

export default function Page() {
  return <VideoView />;
}
