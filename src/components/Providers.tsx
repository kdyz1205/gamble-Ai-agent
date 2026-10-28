"use client";

import { SessionProvider } from "next-auth/react";
import AmbientMotionPolicy from "./AmbientMotionPolicy";
import {ComposerInputMemoryProvider} from "./summons/ComposerInputMemory";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider><AmbientMotionPolicy /><ComposerInputMemoryProvider>{children}</ComposerInputMemoryProvider></SessionProvider>;
}
