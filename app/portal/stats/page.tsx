import StatsTableClient from "@/app/portal/stats/StatsTableClient";
import { mapPosition, type PlayerTableWindowKey } from "@/lib/portal/playerMetrics";
import { getUserLeagueRoster } from "@/lib/portal/leagueRoster";
import { getWatchlistData } from "@/lib/portal/watchlist";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { resolvePortalSeason } from "@/lib/season/portal-season";
import {
  PLAYER_WINDOW_STATS_COLUMNS,
  emptyWindowStatsRow,
  toStatsWindowRow,
  type PlayerWindowStatsRow,
  type StatsWindowRow,
} from "@/lib/portal/summaryAdapters";

type StatsPlayerRecord = {
  id: string;
  player: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  ownershipPct: number;
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
  xgPer90: number | null;
  xaPer90: number | null;
  windows: Partial<Record<PlayerTableWindowKey, StatsWindowRow>>;
};

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  const numeric = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseOwnership(value: string | null): number {
  if (!value) {
    return 0;
  }

  const numeric = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

type StatsPageProps = {
  searchParams?: { season?: string | string[] } | Promise<{ season?: string | string[] }>;
};

export default async function StatsPage({ searchParams }: StatsPageProps) {
  const supabase = await createServerSupabaseClient();
  const resolvedSearchParams = searchParams && typeof searchParams === "object" && "then" in searchParams ? await searchParams : searchParams;
  const requestedSeason = Array.isArray(resolvedSearchParams?.season) ? resolvedSearchParams.season[0] : resolvedSearchParams?.season;
  const { availableSeasons, season: SEASON } = await resolvePortalSeason(supabase, requestedSeason);

  const { data: poolRows, error: poolError } = await supabase
    .from("season_player_pool")
    .select("fantrax_id")
    .eq("season", SEASON);

  if (poolError) {
    throw new Error(`Unable to load the ${SEASON} player pool: ${poolError.message}`);
  }

  const poolFantraxIds = (poolRows ?? []).map((row) => row.fantrax_id as string);

  const [
    {
      data: { user },
    },
    { data: players, error: playersError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    poolFantraxIds.length > 0
      ? supabase
          .from("players")
          .select("id, name, team, position, ownership_pct, fpl_player_data(expected_goals_per_90, expected_assists_per_90, chance_of_playing_next_round, status, news)")
          .in("fantrax_id", poolFantraxIds)
          .order("name")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (playersError) {
    throw new Error(`Unable to load players: ${playersError.message}`);
  }

  const { data: profile } = user
    ? await supabase.from("profiles").select("fantrax_league_id").eq("id", user.id).maybeSingle()
    : { data: null };

  const playerIds = (players ?? []).map((player) => player.id as string);

  // Season totals and box-score breakdowns are precomputed by
  // lib/portal/summaryRecompute.ts whenever scores sync — this is a
  // lookup, not a recalculation across the whole pool.
  const [windowResult, leagueRoster, watchlistData] = await Promise.all([
    playerIds.length > 0
      ? supabase.from("player_window_stats").select(PLAYER_WINDOW_STATS_COLUMNS).eq("season", SEASON).eq("window", "season").in("player_id", playerIds)
      : Promise.resolve({ data: [], error: null }),
    user ? getUserLeagueRoster(user.id, profile?.fantrax_league_id ?? null) : Promise.resolve(null),
    user ? getWatchlistData(user.id) : Promise.resolve({ watchlistedIds: [], orderById: {} }),
  ]);

  if (windowResult.error) {
    throw new Error(`Unable to load ${SEASON} player summaries: ${windowResult.error.message}`);
  }

  const windowRowByPlayer = new Map<string, PlayerWindowStatsRow>(
    ((windowResult.data ?? []) as PlayerWindowStatsRow[]).map((row) => [row.player_id, row])
  );

  let latestGameweek = 0;
  for (const row of windowRowByPlayer.values()) {
    latestGameweek = Math.max(latestGameweek, row.current_gameweek);
  }

  const statsRows: StatsPlayerRecord[] = ((players ?? []) as Array<{
    id: string;
    name: string;
    team: string;
    position: string;
    ownership_pct: string | null;
    fpl_player_data:
      | {
          chance_of_playing_next_round: number | null;
          status: string | null;
          news: string | null;
          expected_goals_per_90: number | string | null;
          expected_assists_per_90: number | string | null;
        }
      | Array<{
          chance_of_playing_next_round: number | null;
          status: string | null;
          news: string | null;
          expected_goals_per_90: number | string | null;
          expected_assists_per_90: number | string | null;
        }>
      | null;
  }>)
    .map((player) => {
      const windowRow = windowRowByPlayer.get(player.id) ?? emptyWindowStatsRow(player.id, SEASON, "season");
      const availabilityRaw = Array.isArray(player.fpl_player_data) ? player.fpl_player_data[0] : player.fpl_player_data;

      return {
        id: player.id,
        player: player.name,
        team: player.team,
        position: mapPosition(player.position),
        ownershipPct: parseOwnership(player.ownership_pct),
        chanceOfPlaying: availabilityRaw?.chance_of_playing_next_round ?? null,
        availabilityStatus: availabilityRaw?.status ?? null,
        availabilityNews: availabilityRaw?.news ?? null,
        xgPer90: toNullableNumber(availabilityRaw?.expected_goals_per_90),
        xaPer90: toNullableNumber(availabilityRaw?.expected_assists_per_90),
        windows: { season: toStatsWindowRow(windowRow) },
      };
    })
    .sort((a, b) => b.windows.season!.season_pts - a.windows.season!.season_pts);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">Player Stats</h1>
        <p className="mt-2 text-sm text-brand-dark/70">Filterable and sortable season {SEASON} player output.</p>
      </div>
      <StatsTableClient key={SEASON} rows={statsRows} latestGameweek={latestGameweek} leagueRoster={leagueRoster} season={SEASON} availableSeasons={availableSeasons} watchlistedPlayerIds={watchlistData.watchlistedIds} watchlistOrderById={watchlistData.orderById} />
    </div>
  );
}
