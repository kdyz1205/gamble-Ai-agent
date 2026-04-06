// @ts-nocheck
"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { emitAppToast } from "@/lib/app-toast";
import * as api from "@/lib/api-client";

/**
 * Supabase Realtime: new public challenges + opponent accepted (creator hears “战士已就位”).
 * Requires Supabase project with Realtime enabled on `Challenge` and `Participant`, and matching DB URL.
 */
export default function ChallengeRealtimeBridge() {
  const { data: session, status } = useSession();
  const uid = (session?.user as { id?: string } | undefined)?.id;

  useEffect(() => {
    if (status !== "authenticated" || !uid) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    const channel: RealtimeChannel = supabase
      .channel("challengeai-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "Challenge" },
        (payload) => {
          const row = payload.new as {
            id?: string;
            title?: string;
            creatorId?: string;
            isPublic?: boolean;
          };
          if (!row?.id || !row.title) return;
          if (row.creatorId === uid) return;
          if (row.isPublic === false) return;
          emitAppToast(`新挑战上架：「${row.title.slice(0, 48)}${row.title.length > 48 ? "…" : ""}」`);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "Participant" },
        (payload) => {
          const row = payload.new as {
            challengeId?: string;
            userId?: string;
            role?: string;
            status?: string;
          };
          if (!row?.challengeId || row.role !== "opponent" || row.status !== "accepted") return;
          if (row.userId === uid) return;
          void api.getChallenge(row.challengeId).then(({ challenge }) => {
            if (challenge.creatorId === uid) {
              emitAppToast("战士已就位 — 对手已接受你的挑战。");
            }
          }).catch(() => {});
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [status, uid]);

  return null;
}
