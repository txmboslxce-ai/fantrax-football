import { mapPosition, type PlayerWindowStats } from "@/lib/portal/playerMetrics";
import {
  PLAYER_WINDOW_STATS_COLUMNS,
  emptyWindowStatsRow,
  toPlayerWindowStats,
  type PlayerWindowStatsRow,
} from "@/lib/portal/summaryAdapters";
import { DRAFT_POOL_SEASON, DRAFT_STATS_SEASON } from "@/lib/season/draft";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import DraftToolTableClient from "./DraftToolTableClient";

type DraftPlayer = {
  id: string;
  fantrax_id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  multi_position: string | null;
  setPieces: {
    penaltiesOrder: number | null;
    cornersOrder: number | null;
    directFreekicksOrder: number | null;
  };
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
  stats: PlayerWindowStats;
  corners: number;
  freeKickShots: number;
  goals: number;
  assists: number;
  adp: number | null;
  rank: number;
  picked: boolean;
  watchlisted: boolean;
  customRank: number | null;
  watchlistOrder: number | null;
  tier: number | null;
  tierOrder: number | null;
};

function normalizeAdp(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeCustomRank(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadDraftPlayers(): Promise<DraftPlayer[]> {
  const supabase = await createServerSupabaseClient();

  const { data: poolRows, error: poolError } = await supabase
    .from("season_player_pool")
    .select("fantrax_id, adp")
    .eq("season", DRAFT_POOL_SEASON);

  if (poolError) {
    throw new Error(`Unable to load the ${DRAFT_POOL_SEASON} draft pool: ${poolError.message}`);
  }

  const adpByFantraxId = new Map(
    (poolRows ?? []).map((row) => [row.fantrax_id as string, normalizeAdp(row.adp)])
  );
  const poolFantraxIds = Array.from(adpByFantraxId.keys());
  if (poolFantraxIds.length === 0) {
    return [];
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select(
      "id, fantrax_id, name, team, position, multi_position, fpl_player_data(penalties_order, corners_order, direct_freekicks_order, chance_of_playing_next_round, status, news)"
    )
    .in("fantrax_id", poolFantraxIds)
    .order("name");

  if (playersError) {
    throw new Error(`Unable to load draft players: ${playersError.message}`);
  }

  const playerRows = (players ?? []) as Array<{
    id: string;
    fantrax_id: string;
    name: string;
    team: string;
    position: string;
    multi_position: string | null;
    fpl_player_data:
      | {
          penalties_order: number | null;
          corners_order: number | null;
          direct_freekicks_order: number | null;
          chance_of_playing_next_round: number | null;
          status: string | null;
          news: string | null;
        }
      | Array<{
          penalties_order: number | null;
          corners_order: number | null;
          direct_freekicks_order: number | null;
          chance_of_playing_next_round: number | null;
          status: string | null;
          news: string | null;
        }>
      | null;
  }>;
  const playerIds = playerRows.map((player) => player.id);
  if (playerIds.length === 0) {
    return [];
  }

  // Draft Tool always shows season-window stats from DRAFT_STATS_SEASON,
  // precomputed by lib/portal/summaryRecompute.ts — this is a lookup, not
  // a recalculation across the whole draft pool.
  const { data: windowRows, error: windowError } = await supabase
    .from("player_window_stats")
    .select(PLAYER_WINDOW_STATS_COLUMNS)
    .eq("season", DRAFT_STATS_SEASON)
    .eq("stat_window", "season")
    .in("player_id", playerIds);

  if (windowError) {
    throw new Error(`Unable to load ${DRAFT_STATS_SEASON} player statistics: ${windowError.message}`);
  }

  const windowRowByPlayer = new Map<string, PlayerWindowStatsRow>(
    ((windowRows ?? []) as PlayerWindowStatsRow[]).map((row) => [row.player_id, row])
  );

  const unrankedPlayers = playerRows.map((player) => {
    const fplData = Array.isArray(player.fpl_player_data) ? player.fpl_player_data[0] : player.fpl_player_data;
    const position = mapPosition(player.position);
    const windowRow = windowRowByPlayer.get(player.id) ?? emptyWindowStatsRow(player.id, DRAFT_STATS_SEASON, "season");
    return {
      id: player.id,
      fantrax_id: player.fantrax_id,
      name: player.name,
      team: player.team,
      position,
      multi_position: player.multi_position,
      setPieces: {
        penaltiesOrder: fplData?.penalties_order ?? null,
        cornersOrder: fplData?.corners_order ?? null,
        directFreekicksOrder: fplData?.direct_freekicks_order ?? null,
      },
      chanceOfPlaying: fplData?.chance_of_playing_next_round ?? null,
      availabilityStatus: fplData?.status ?? null,
      availabilityNews: fplData?.news ?? null,
      stats: toPlayerWindowStats(windowRow),
      corners: windowRow.corner_kicks,
      freeKickShots: windowRow.free_kick_shots,
      goals: windowRow.goals,
      assists: windowRow.assists,
      adp: adpByFantraxId.get(player.fantrax_id) ?? null,
      rank: 0,
      picked: false,
      watchlisted: false,
      customRank: null,
      watchlistOrder: null,
      tier: null,
      tierOrder: null,
    };
  });

  return unrankedPlayers
    .sort((a, b) => b.stats.season_pts - a.stats.season_pts || a.name.localeCompare(b.name))
    .map((player, index) => ({ ...player, rank: index + 1 }));
}

export default async function DraftToolPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/portal/drafttool");
  }

  const [draftPlayers, { data: draftPickRows, error: draftPicksError }] = await Promise.all([
    loadDraftPlayers(),
    supabase
      .from("draft_picks")
      .select("player_id, picked, watchlisted, custom_rank, watchlist_order, tier, tier_order")
      .eq("user_id", user.id),
  ]);

  if (draftPicksError) {
    throw new Error(`Unable to load draft board: ${draftPicksError.message}`);
  }

  const draftPicksByPlayerId = new Map(
    (draftPickRows ?? []).map((draftPick) => [
      draftPick.player_id as string,
      {
        picked: draftPick.picked === true,
        watchlisted: draftPick.watchlisted === true,
        customRank: normalizeCustomRank(draftPick.custom_rank),
        watchlistOrder: normalizeCustomRank(draftPick.watchlist_order),
        tier: normalizeCustomRank(draftPick.tier),
        tierOrder: normalizeCustomRank(draftPick.tier_order),
      },
    ])
  );
  const players = draftPlayers.map((player) => ({
    ...player,
    ...draftPicksByPlayerId.get(player.id),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">Draft Tool</h1>
        <p className="mt-2 text-sm text-brand-dark/70">
          Statistics are from the {DRAFT_STATS_SEASON} season. Players are sorted by ADP by default, and every column is sortable. Add a tier to any player in the Tier column, then click Show My Tiers Only to reorder players within their tiers. Prefer a single ranking without tiers? Use Rank Players instead.
        </p>
        <p className="mt-1 text-sm text-slate-500">Your Watchlist, Picked, Tier, and Rank selections are all saved automatically.</p>
      </div>

      <DraftToolTableClient players={players} />
    </div>
  );
}
