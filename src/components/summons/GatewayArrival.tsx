"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GatewayArrival() {
  const router = useRouter();

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    if (search.get("arrival") === "gateway") {
      router.replace("/summons", { scroll: false });
    }
  }, [router]);

  return null;
}
