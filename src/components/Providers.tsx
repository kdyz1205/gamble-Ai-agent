"use client";

import { SessionProvider } from "next-auth/react";
import AmbientMotionPolicy from "./AmbientMotionPolicy";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider><AmbientMotionPolicy />{children}</SessionProvider>;
}
