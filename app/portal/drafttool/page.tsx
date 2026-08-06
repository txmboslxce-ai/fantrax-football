import {
  decorateGameweeks,
  mapPosition,
  summarizePlayerWindow,
  type PlayerGameweekRow,
  type PlayerWindowStats,
} from "@/lib/portal/playerMetrics";
import { DRAFT_POOL_SEASON, DRAFT_STATS_SEASON } from "@/lib/season/draft";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

type DraftPickRow = {
  player_id: string;
  picked: boolean;
  notes: string | null;
};

type DraftPlayer = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  setPieces: {
    penaltiesOrder: number | null;
    cornersOrder: number | null;
    directFreekicksOrder: number | null;
  };
  stats: PlayerWindowStats;
  picked: boolean;
  notes: string | null;
};

function isMissingDraftPicksTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205";
}

async function loadDraftPlayers(userId: string): Promise<DraftPlayer[]> {
  const supabase = await createServerSupabaseClient();

  const { data: poolRows, error: poolError } = await supabase
    .from("season_player_pool")
    .select("fantrax_id")
    .eq("season", DRAFT_POOL_SEASON);

  if (poolError) {
    throw new Error(`Unable to load the ${DRAFT_POOL_SEASON} draft pool: ${poolError.message}`);
  }

  const poolFantraxIds = (poolRows ?? []).map((row) => row.fantrax_id as string);
  if (poolFantraxIds.length === 0) {
    return [];
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select(
      "id, name, team, position, fpl_player_data(penalties_order, corners_order, direct_freekicks_order)"
    )
    .in("fantrax_id", poolFantraxIds)
    .order("name");

  if (playersError) {
    throw new Error(`Unable to load draft players: ${playersError.message}`);
  }

  const playerRows = (players ?? []) as Array<{
    id: string;
    name: string;
    team: string;
    position: string;
    fpl_player_data:
      | {
          penalties_order: number | null;
          corners_order: number | null;
          direct_freekicks_order: number | null;
        }
      | Array<{
          penalties_order: number | null;
          corners_order: number | null;
          direct_freekicks_order: number | null;
        }>
      | null;
  }>;
  const playerIds = playerRows.map((player) => player.id);
  if (playerIds.length === 0) {
    return [];
  }

  const [{ data: gameweeks, error: gameweeksError }, { data: draftPicks, error: draftPicksError }] = await Promise.all([
    supabase
      .from("player_gameweeks")
      .select(
        "id, player_id, season, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, clean_sheet, goals_against, saves, key_passes, tackles_won, interceptions, clearances, aerials_won"
      )
      .eq("season", DRAFT_STATS_SEASON)
      .in("player_id", playerIds)
      .range(0, 40000),
    supabase.from("draft_picks").select("player_id, picked, notes").eq("user_id", userId),
  ]);

  if (gameweeksError) {
    throw new Error(`Unable to load ${DRAFT_STATS_SEASON} player statistics: ${gameweeksError.message}`);
  }
  if (draftPicksError && !isMissingDraftPicksTable(draftPicksError)) {
    throw new Error(`Unable to load draft picks: ${draftPicksError.message}`);
  }

  const rowsByPlayer = new Map<string, PlayerGameweekRow[]>();
  for (const row of (gameweeks ?? []) as PlayerGameweekRow[]) {
    const existing = rowsByPlayer.get(row.player_id);
    if (existing) {
      existing.push(row);
    } else {
      rowsByPlayer.set(row.player_id, [row]);
    }
  }

  const picksByPlayer = new Map(
    ((draftPicks ?? []) as DraftPickRow[]).map((pick) => [pick.player_id, pick])
  );

  return playerRows.map((player) => {
    const fplData = Array.isArray(player.fpl_player_data) ? player.fpl_player_data[0] : player.fpl_player_data;
    const position = mapPosition(player.position);
    const decoratedRows = decorateGameweeks(rowsByPlayer.get(player.id) ?? [], player.team, []);
    const draftPick = picksByPlayer.get(player.id);

    return {
      id: player.id,
      name: player.name,
      team: player.team,
      position,
      setPieces: {
        penaltiesOrder: fplData?.penalties_order ?? null,
        cornersOrder: fplData?.corners_order ?? null,
        directFreekicksOrder: fplData?.direct_freekicks_order ?? null,
      },
      stats: summarizePlayerWindow(decoratedRows, position),
      picked: draftPick?.picked ?? false,
      notes: draftPick?.notes ?? null,
    };
  });
}

export default async function DraftToolPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/portal/drafttool");
  }

  const players = await loadDraftPlayers(user.id);
  const samplePlayer = players[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">Draft Tool</h1>
        <p className="mt-2 text-sm text-brand-dark/70">
          {players.length} eligible players from the {DRAFT_POOL_SEASON} draft pool. Statistics use {DRAFT_STATS_SEASON}.
        </p>
      </div>

      {samplePlayer ? (
        <p className="text-sm text-brand-dark/70">
          Sample: {samplePlayer.name} — {samplePlayer.stats.fantasy_pts_per_start} FP/Start, {samplePlayer.stats.ghost_pts_per_start} Ghost Pts/Start.
        </p>
      ) : null}
    </div>
  );
}
