"use client";

import { useCallback, useRef, useState } from "react";
import { computeWatchlistReorder } from "@/lib/portal/watchlistReorder";
import { createClient } from "@/lib/supabase";

export function useWatchlist(initialWatchlistedIds: string[], initialOrderById: Record<string, number> = {}): {
  watchlistedIds: Set<string>;
  watchlistOrder: Map<string, number>;
  isWatchlisted: (playerId: string) => boolean;
  toggleWatchlist: (playerId: string) => void;
  reorderWatchlist: (args: {
    visiblePlayerIds: string[];
    globalWatchlistedPlayerIds: string[];
    activePlayerId: string;
    overPlayerId: string;
  }) => void;
  watchlistError: string | null;
} {
  const [watchlistedIds, setWatchlistedIds] = useState<Set<string>>(() => new Set(initialWatchlistedIds));
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const watchlistedIdsRef = useRef<Set<string>>(new Set(initialWatchlistedIds));
  const watchlistOrderRef = useRef<Map<string, number>>(new Map(Object.entries(initialOrderById)));
  const [watchlistOrder, setWatchlistOrder] = useState<Map<string, number>>(() => new Map(Object.entries(initialOrderById)));
  const saveVersionsRef = useRef<Map<string, number>>(new Map());

  const applyWatchlistedIds = useCallback((next: Set<string>) => {
    watchlistedIdsRef.current = next;
    setWatchlistedIds(next);
  }, []);

  const applyWatchlistOrder = useCallback((next: Map<string, number>) => {
    watchlistOrderRef.current = next;
    setWatchlistOrder(next);
  }, []);

  const isWatchlisted = useCallback((playerId: string) => watchlistedIdsRef.current.has(playerId), []);

  const toggleWatchlist = useCallback((playerId: string) => {
    setWatchlistError(null);

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
  }, [applyWatchlistedIds]);

  const reorderWatchlist = useCallback((args: {
    visiblePlayerIds: string[];
    globalWatchlistedPlayerIds: string[];
    activePlayerId: string;
    overPlayerId: string;
  }) => {
    const result = computeWatchlistReorder({
      ...args,
      currentWatchlistOrders: watchlistOrderRef.current,
    });
    if (!result) return;

    setWatchlistError(null);
    const previousOrders = new Map(watchlistOrderRef.current);
    applyWatchlistOrder(result.nextOrders);

    const version = (saveVersionsRef.current.get(result.movedPlayerId) ?? 0) + 1;
    saveVersionsRef.current.set(result.movedPlayerId, version);

    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (saveVersionsRef.current.get(result.movedPlayerId) === version) {
            applyWatchlistOrder(previousOrders);
            setWatchlistError("Your session has expired. Please sign in again.");
          }
          return;
        }

        if (result.needsMaterialization) {
          const { error: materializationError } = await supabase.from("draft_picks").upsert(
            Array.from(result.materializedOrders, ([playerId, watchlistOrder]) => ({
              user_id: user.id,
              player_id: playerId,
              watchlist_order: watchlistOrder,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: "user_id,player_id" }
          );
          if (materializationError) throw materializationError;
        }

        const { error: watchlistOrderError } = await supabase.from("draft_picks").upsert(
          {
            user_id: user.id,
            player_id: result.movedPlayerId,
            watchlist_order: result.nextWatchlistOrder,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,player_id" }
        );
        if (watchlistOrderError) throw watchlistOrderError;
      } catch (error) {
        if (saveVersionsRef.current.get(result.movedPlayerId) === version) {
          applyWatchlistOrder(previousOrders);
          setWatchlistError(error instanceof Error ? error.message : "Unable to save your watchlist order.");
        }
      }
    })();
  }, [applyWatchlistOrder]);

  return { watchlistedIds, watchlistOrder, isWatchlisted, toggleWatchlist, reorderWatchlist, watchlistError };
}
