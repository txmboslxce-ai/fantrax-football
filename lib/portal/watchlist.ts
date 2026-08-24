import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function getWatchlistData(userId: string): Promise<{
  watchlistedIds: string[];
  orderById: Record<string, number>;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("draft_picks")
    .select("player_id, watchlist_order")
    .eq("user_id", userId)
    .eq("watchlisted", true);

  if (error) {
    return { watchlistedIds: [], orderById: {} };
  }

  const rows = data ?? [];
  return {
    watchlistedIds: rows.map((row) => row.player_id as string),
    orderById: Object.fromEntries(
      rows.flatMap((row) => row.watchlist_order == null ? [] : [[row.player_id as string, row.watchlist_order as number]])
    ),
  };
}

export async function getWatchlistedPlayerIds(userId: string): Promise<string[]> {
  const { watchlistedIds } = await getWatchlistData(userId);
  return watchlistedIds;
}
