import type { Metadata } from "next";
import FavoritesView from "@/features/favorites/FavoritesView";

/** `noindex`: the library is this browser's, and empty to a crawler. */
export const metadata: Metadata = {
  title: "Favorites",
  description: "The generations you have kept, in folders.",
  robots: { index: false, follow: true },
};

export default function Page() {
  return <FavoritesView />;
}
