"use client";

import { useEffect } from "react";
import { useAmbientMotionAllowed } from "@/lib/use-motion-policy";

/** Apply the existing device/visibility policy to CSS ambient decorations too. */
export default function AmbientMotionPolicy() {
  const allowed = useAmbientMotionAllowed();

  useEffect(() => {
    document.documentElement.dataset.ambientMotion = allowed ? "running" : "paused";
    return () => { delete document.documentElement.dataset.ambientMotion; };
  }, [allowed]);

  return null;
}
