"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";

export function useWatchlist(initialWatchlistedIds: string[], initialOrderById: Record<string, number> = {}): {
  watchlistedIds: Set<string>;
  watchlistOrder: Map<string, number>;
  isWatchlisted: (playerId: string) => boolean;
  toggleWatchlist: (playerId: string) => void;
  watchlistError: string | null;
} {
  const [watchlistedIds, setWatchlistedIds] = useState<Set<string>>(() => new Set(initialWatchlistedIds));
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const watchlistedIdsRef = useRef<Set<string>>(new Set(initialWatchlistedIds));
  const watchlistOrderRef = useRef<Map<string, number>>(new Map(Object.entries(initialOrderById)));
  const [watchlistOrder] = useState<Map<string, number>>(() => new Map(Object.entries(initialOrderById)));
  const saveVersionsRef = useRef<Map<string, number>>(new Map());

  const applyWatchlistedIds = useCallback((next: Set<string>) => {
    watchlistedIdsRef.current = next;
    setWatchlistedIds(next);
  }, []);

  const isWatchlisted = useCallback((playerId: string) => watchlistedIdsRef.current.has(playerId), []);

  const toggleWatchlist = useCallback((playerId: string) => {
    setWatchlistError(null);
    watchlistOrderRef.current = watchlistOrder;

    const previous = watchlistedIdsRef.current;
    const next = new Set(previous);
    if (next.has(playerId)) {
      next.delete(playerId);
    } else {
      next.add(playerId);
    }
    applyWatchlistedIds(next);

    const version = (saveVersionsRef.current.get(playerId) ?? 0) + 1;
    saveVersionsRef.current.set(playerId, version);

    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (saveVersionsRef.current.get(playerId) === version) {
          applyWatchlistedIds(previous);
          setWatchlistError("Your session has expired. Please sign in again.");
        }
        return;
      }

      const { error } = await supabase.from("draft_picks").upsert(
        {
          user_id: user.id,
          player_id: playerId,
          watchlisted: next.has(playerId),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,player_id" }
      );

      if (error && saveVersionsRef.current.get(playerId) === version) {
        applyWatchlistedIds(previous);
        setWatchlistError("Unable to update watchlist. Please try again.");
      }
    })();
  }, [applyWatchlistedIds, watchlistOrder]);

  return { watchlistedIds, watchlistOrder, isWatchlisted, toggleWatchlist, watchlistError };
}
