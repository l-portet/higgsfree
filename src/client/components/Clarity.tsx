"use client";

import { useEffect } from "react";
import { loadClarity } from "@/lib/clarity";

/** Renders nothing: after hydration, loads Microsoft Clarity if `shouldLoadClarity` allows it. */
export function Clarity() {
  useEffect(() => {
    loadClarity();
  }, []);
  return null;
}
