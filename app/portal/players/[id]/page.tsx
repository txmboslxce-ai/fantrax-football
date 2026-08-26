import PlayerDetailCharts from "@/components/portal/charts/PlayerDetailCharts";
import PercentileRadarChart from "@/components/portal/charts/PercentileRadarChart";
import PercentileStatsTable, { type StatTableRow } from "@/components/portal/charts/PercentileStatsTable";
import {
  decorateGameweeks,
  formatFixed,
  mapPosition,
  nextFixtures,
  teamNameMap,
  type FixtureRow,
  type PlayerGameweekRow,
  type TeamRow,
} from "@/lib/portal/playerMetrics";
import {
  PLAYER_WINDOW_STATS_COLUMNS,
  digitsForRadarStat,
  emptyWindowStatsRow,
  toPlayerSeasonSummary,
  type PlayerWindowStatsRow,
  type RadarDatum,
  type RadarProfileKey,
} from "@/lib/portal/summaryAdapters";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentSeason } from "@/lib/season/current";
import { resolvePortalSeason } from "@/lib/season/portal-season";
import { getUserLeagueRoster } from "@/lib/portal/leagueRoster";
import RosterPill from "@/app/components/ui/RosterPill";
import { notFound } from "next/navigation";
import PlayerGameweekTableClient from "./PlayerGameweekTableClient";

type PlayerDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?:
    | {
        season?: string | string[];
      }
    | Promise<{
        season?: string | string[];
      }>;
};

type FplPlayerData = {
  expected_goals_per_90: number | string | null;
  expected_assists_per_90: number | string | null;
  penalties_order: number | null;
  corners_order: number | null;
  direct_freekicks_order: number | null;
  status: string | null;
  chance_of_playing_next_round: number | null;
  news: string | null;
  news_added: string | null;
  last_synced_at: string | null;
  synced_at: string | null;
};

type PlayerDetailRow = {
  id: string;
  name: string;
  team: string;
  position: string;
  ownership_pct: string | null;
  fpl_player_data: FplPlayerData | FplPlayerData[] | null;
};

type RadarProfileRow = {
  profile: RadarProfileKey;
  data: RadarDatum[];
};

function toStatTableRows(profile: RadarProfileKey, data: RadarDatum[]): StatTableRow[] {
  return data.map((point) => ({
    stat: point.stat,
    digits: digitsForRadarStat(profile, point.stat),
    values: [{ playerId: "self", rawValue: point.rawValue, percentile: point.percentile }],
  }));
}

const POSITION_PLURAL: Record<"DEF" | "MID" | "FWD", string> = {
  DEF: "defenders",
  MID: "midfielders",
  FWD: "forwards",
};

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapAvailabilityStatus(status: string | null, chance: number | null): string {
  if (status === "d" || (status === "a" && chance != null && chance < 100)) {
    return "Doubtful";
  }
  if (status === "i") {
    return "Injured";
  }
  if (status === "u") {
    return "Unavailable";
  }
  if (status === "s") {
    return "Suspended";
  }
  return "Available";
}

function formatShortDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function PlayerDetailPage({ params, searchParams }: PlayerDetailPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const resolvedSearchParams =
    searchParams && typeof searchParams === "object" && "then" in searchParams ? await searchParams : searchParams;
  const requestedTableSeason = Array.isArray(resolvedSearchParams?.season) ? resolvedSearchParams.season[0] : resolvedSearchParams?.season;

  // Neither depends on the other's result.
  const [season, { availableSeasons, season: tableSeason }] = await Promise.all([
    getCurrentSeason(supabase),
    resolvePortalSeason(supabase, requestedTableSeason),
  ]);

  const [
    {
      data: { user },
    },
    { data: player, error: playerError },
    { data: gameweeks, error: gameweeksError },
    { data: teamFixtures, error: fixturesError },
    { data: teams, error: teamsError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("players")
      .select(
        "id, name, team, position, ownership_pct, fpl_player_data(expected_goals_per_90, expected_assists_per_90, penalties_order, corners_order, direct_freekicks_order, status, chance_of_playing_next_round, news, news_added, last_synced_at, synced_at)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("player_gameweeks")
      .select(
        "id, player_id, season, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, clean_sheet, goals_against, goals_against_outfield, saves, key_passes, shots_on_target, tackles_won, interceptions, clearances, aerials_won, accurate_crosses, blocked_shots, dribbles_succeeded, dispossessed, penalties_drawn, penalties_missed, yellow_cards, red_cards, own_goals, subbed_on, subbed_off, penalty_saves, high_claims, smothers, corner_kicks, free_kick_shots"
      )
      .eq("player_id", id)
      .eq("season", season)
      .order("gameweek", { ascending: true }),
    supabase
      .from("fixtures")
      .select("id, season, gameweek, home_team, away_team")
      .eq("season", season)
      .order("gameweek"),
    supabase.from("teams").select("abbrev, name, full_name"),
  ]);

  if (playerError) {
    throw new Error(`Unable to load player: ${playerError.message}`);
  }
  if (!player) {
    notFound();
  }
  if (gameweeksError) {
    throw new Error(`Unable to load player gameweeks: ${gameweeksError.message}`);
  }
  if (fixturesError) {
    throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
  }
  if (teamsError) {
    throw new Error(`Unable to load teams: ${teamsError.message}`);
  }

  const playerRow = player as PlayerDetailRow;

  // None of these five depend on each other's result — only on `user`,
  // `season`, `tableSeason`, and `playerRow.position`, all already known
  // — so they run together instead of in three separate sequential
  // round-trips. Radar chart rankings and fixture-difficulty rankings are
  // precomputed league-wide by lib/portal/summaryRecompute.ts whenever
  // scores sync; these are lookups scoped to this one player/team, not a
  // recalculation across the whole pool.
  const [
    { data: profile },
    tableResult,
    radarProfilesResult,
    fdrResult,
    windowStatsResult,
  ] = await Promise.all([
    user ? supabase.from("profiles").select("fantrax_league_id").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    tableSeason === season
      ? Promise.resolve(null)
      : Promise.all([
          supabase
            .from("player_gameweeks")
            .select(
              "id, player_id, season, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, clean_sheet, goals_against, goals_against_outfield, saves, key_passes, shots_on_target, tackles_won, interceptions, clearances, aerials_won, accurate_crosses, blocked_shots, dribbles_succeeded, dispossessed, penalties_drawn, penalties_missed, yellow_cards, red_cards, own_goals, subbed_on, subbed_off, penalty_saves, high_claims, smothers, corner_kicks, free_kick_shots"
            )
            .eq("player_id", id)
            .eq("season", tableSeason)
            .order("gameweek", { ascending: true }),
          supabase
            .from("fixtures")
            .select("id, season, gameweek, home_team, away_team")
            .eq("season", tableSeason)
            .order("gameweek"),
        ]),
    supabase.from("player_radar_profiles").select("profile, data").eq("season", season).eq("player_id", id),
    supabase.from("team_fixture_difficulty").select("team, rank").eq("season", tableSeason).eq("position", playerRow.position),
    supabase.from("player_window_stats").select(PLAYER_WINDOW_STATS_COLUMNS).eq("season", season).eq("stat_window", "season").eq("player_id", id).maybeSingle(),
  ]);

  // leagueRoster needs `profile`, so it's the one thing that still has
  // to wait until after the block above resolves.
  const leagueRoster = user ? await getUserLeagueRoster(user.id, profile?.fantrax_league_id ?? null) : null;

  const [tableGameweeksResult, tableFixturesResult] = tableResult ?? [null, null];

  if (tableGameweeksResult?.error) {
    throw new Error(`Unable to load ${tableSeason} player gameweeks: ${tableGameweeksResult.error.message}`);
  }
  if (tableFixturesResult?.error) {
    throw new Error(`Unable to load ${tableSeason} fixtures: ${tableFixturesResult.error.message}`);
  }

  const tableGameweeks = tableGameweeksResult?.data ?? gameweeks ?? [];
  const tableFixtures = tableFixturesResult?.data ?? teamFixtures ?? [];

  if (radarProfilesResult.error) {
    throw new Error(`Unable to load ${season} radar profile: ${radarProfilesResult.error.message}`);
  }
  if (fdrResult.error) {
    throw new Error(`Unable to load ${tableSeason} fixture difficulty: ${fdrResult.error.message}`);
  }
  if (windowStatsResult.error) {
    throw new Error(`Unable to load ${season} player summary: ${windowStatsResult.error.message}`);
  }

  const radarProfileByKey = new Map<string, RadarDatum[]>(
    ((radarProfilesResult.data ?? []) as RadarProfileRow[]).map((row) => [row.profile, row.data])
  );

  const fdrRankByTeam: Record<string, number> = {};
  for (const row of (fdrResult.data ?? []) as Array<{ team: string; rank: number }>) {
    fdrRankByTeam[row.team] = row.rank;
  }

  const summary = toPlayerSeasonSummary((windowStatsResult.data as PlayerWindowStatsRow | null) ?? emptyWindowStatsRow(id, season, "season"));

  const fplData = Array.isArray(playerRow.fpl_player_data) ? playerRow.fpl_player_data[0] : playerRow.fpl_player_data;
  const xgPer90 = toNumber(fplData?.expected_goals_per_90);
  const xaPer90 = toNumber(fplData?.expected_assists_per_90);
  const hasXgXa = xgPer90 != null && xaPer90 != null;
  const hasSetPieces =
    fplData?.penalties_order != null || fplData?.corners_order != null || fplData?.direct_freekicks_order != null;
  const availabilityStatus = mapAvailabilityStatus(fplData?.status ?? null, fplData?.chance_of_playing_next_round ?? null);
  const showAvailabilityCard =
    (fplData?.chance_of_playing_next_round != null && fplData.chance_of_playing_next_round < 100) || fplData?.status !== "a";
  const availabilityDate = formatShortDate(fplData?.last_synced_at ?? null);
  const syncedDate = formatShortDate(fplData?.synced_at ?? null);
  const availabilityIsRed = availabilityStatus === "Injured" || availabilityStatus === "Unavailable" || availabilityStatus === "Suspended";

  const teamNames = teamNameMap((teams ?? []) as TeamRow[]);
  const fixturesForTeam = ((teamFixtures ?? []) as FixtureRow[]).filter(
    (fixture) => fixture.home_team === playerRow.team || fixture.away_team === playerRow.team
  );
  const tableFixturesForTeam = (tableFixtures as FixtureRow[]).filter(
    (fixture) => fixture.home_team === playerRow.team || fixture.away_team === playerRow.team
  );
  const decorated = decorateGameweeks((gameweeks ?? []) as PlayerGameweekRow[], playerRow.team, fixturesForTeam);
  const tableDecorated = decorateGameweeks(tableGameweeks as PlayerGameweekRow[], playerRow.team, tableFixturesForTeam);
  const playerPosition = mapPosition(playerRow.position);
  const isGoalkeeper = playerPosition === "GK";
  const fantasyData = radarProfileByKey.get("fantasy") ?? [];
  const statsTotalData = radarProfileByKey.get("stats_total") ?? [];
  const statsPer90Data = radarProfileByKey.get("stats_per90") ?? [];
  const goalkeeperData = radarProfileByKey.get("goalkeeper") ?? [];

  const selfSeries = (data: RadarDatum[]) => [{ id: playerRow.id, name: playerRow.name, color: "#005B3A", data }];

  const radarCharts = (
    <div className={isGoalkeeper ? "grid gap-4 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"}>
      <div className="flex flex-col gap-2">
        <PercentileRadarChart
          title="Fantasy Profile"
          caption={isGoalkeeper ? "Ranked against starting goalkeepers." : "Ranked against outfield players who've started at least one game."}
          players={selfSeries(fantasyData)}
        />
        <PercentileStatsTable players={[{ id: "self", name: playerRow.name, color: "#005B3A" }]} rows={toStatTableRows("fantasy", fantasyData)} />
      </div>
      {isGoalkeeper ? (
        <div className="flex flex-col gap-2">
          <PercentileRadarChart
            title="Goalkeeping Profile"
            caption="Ranked against starting goalkeepers."
            players={selfSeries(goalkeeperData)}
          />
          <PercentileStatsTable players={[{ id: "self", name: playerRow.name, color: "#005B3A" }]} rows={toStatTableRows("goalkeeper", goalkeeperData)} />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <PercentileRadarChart
              title="Stats Profile (Season Total)"
              caption={`Ranked against other ${POSITION_PLURAL[playerPosition as "DEF" | "MID" | "FWD"]} who've started at least one game.`}
              players={selfSeries(statsTotalData)}
            />
            <PercentileStatsTable players={[{ id: "self", name: playerRow.name, color: "#005B3A" }]} rows={toStatTableRows("stats_total", statsTotalData)} />
          </div>
          <div className="flex flex-col gap-2">
            <PercentileRadarChart
              title="Stats Profile (Per 90)"
              caption="Same stats, adjusted for minutes played."
              players={selfSeries(statsPer90Data)}
            />
            <PercentileStatsTable players={[{ id: "self", name: playerRow.name, color: "#005B3A" }]} rows={toStatTableRows("stats_per90", statsPer90Data)} />
          </div>
        </>
      )}
    </div>
  );
  const upcoming = nextFixtures(playerRow.team, fixturesForTeam, summary.current_gameweek, teamNames, 5);

  const playedRows = decorated.filter((row) => row.games_played > 0);
  const pointsByGw = playedRows.map((row) => ({ gameweek: row.gameweek, points: row.raw_fantrax_pts }));
  const last5 = pointsByGw.slice(-5);

  const teamNamesRecord = Object.fromEntries(teamNames.entries());

  return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-brand-cream/20 bg-brand-dark p-5 text-brand-cream sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black sm:text-4xl">{playerRow.name}</h1>
                <RosterPill playerId={playerRow.id} leagueRoster={leagueRoster} />
              </div>
              <p className="mt-2 text-sm text-brand-creamDark">{teamNames.get(playerRow.team) ?? playerRow.team}</p>
            </div>
            <span className="inline-flex rounded-full bg-brand-green px-4 py-1 text-sm font-bold text-brand-cream">
              {mapPosition(playerRow.position)}
            </span>
          </div>

          {fplData && showAvailabilityCard ? (
            <article
              className={`mt-4 rounded-xl border p-4 ${
                availabilityIsRed ? "border-red-500/50 bg-red-500/10 text-red-100" : "border-amber-500/50 bg-amber-500/10 text-amber-100"
              }`}
            >
              <p className="text-sm font-bold">⚠ Availability Update</p>
              <p className="mt-2 text-sm">
                Status: <strong>{availabilityStatus}</strong>
              </p>
              {fplData.chance_of_playing_next_round != null ? (
                <p className="mt-1 text-sm">Chance of playing next round: {fplData.chance_of_playing_next_round}%</p>
              ) : null}
              {fplData.news && fplData.news.trim() ? <p className="mt-3 text-sm">&quot;{fplData.news.trim()}&quot;</p> : null}
              <p className="mt-3 text-xs text-brand-creamDark">
                {availabilityDate ? `Last updated: ${availabilityDate}` : `Data as of: ${syncedDate ?? "Unknown"}`}
              </p>
            </article>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <article className="rounded-lg border border-brand-cream/20 bg-brand-green/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-brand-creamDark">Season Points</p>
              <p className="mt-0.5 text-xl font-black">{formatFixed(summary.season_total_pts, 2)}</p>
            </article>
            <article className="rounded-lg border border-brand-cream/20 bg-brand-green/20 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-brand-creamDark">Avg Pts/GW</p>
              <p className="mt-0.5 text-xl font-black">{formatFixed(summary.avg_pts_per_gameweek)}</p>
            </article>
            <div className="rounded-lg border border-brand-cream/20 bg-brand-dark/60 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-brand-creamDark">Avg Pts/Start</p>
              <p className="mt-0.5 text-base font-bold">{formatFixed(summary.avg_pts_per_start)}</p>
            </div>
            <div className="rounded-lg border border-brand-cream/20 bg-brand-dark/60 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-brand-creamDark">Ghost Pts/Start</p>
              <p className="mt-0.5 text-base font-bold">{formatFixed(summary.avg_ghost_per_start)}</p>
            </div>
            <div className="rounded-lg border border-brand-cream/20 bg-brand-dark/60 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-brand-creamDark">Games Played / Starts</p>
              <p className="mt-0.5 text-base font-bold">
                {summary.total_games_played} / {summary.total_games_started}
              </p>
            </div>
            {playerRow.ownership_pct != null ? (
              <div className="rounded-lg border border-brand-cream/20 bg-brand-dark/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-brand-creamDark">Ownership</p>
                <p className="mt-0.5 text-base font-bold">{playerRow.ownership_pct}</p>
              </div>
            ) : null}
            {hasXgXa ? (
              <>
                <div className="rounded-lg border border-brand-cream/20 bg-brand-dark/60 px-3 py-2">
                  <p
                    className="text-[10px] uppercase tracking-wide text-brand-creamDark"
                    title="Expected goals per 90 minutes, sourced from FPL data"
                  >
                    xG/90
                  </p>
                  <p className="mt-0.5 text-base font-bold">{xgPer90.toFixed(2)}</p>
                </div>
                <div className="rounded-lg border border-brand-cream/20 bg-brand-dark/60 px-3 py-2">
                  <p
                    className="text-[10px] uppercase tracking-wide text-brand-creamDark"
                    title="Expected assists per 90 minutes, sourced from FPL data"
                  >
                    xA/90
                  </p>
                  <p className="mt-0.5 text-base font-bold">{xaPer90.toFixed(2)}</p>
                </div>
              </>
            ) : null}
          </div>

          {fplData && hasSetPieces ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs uppercase tracking-wide text-brand-creamDark">Set Pieces</p>
              <div className="flex flex-wrap gap-2">
                {fplData.penalties_order != null ? (
                  <span className="inline-flex rounded-full border border-amber-300/35 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-100">
                    Penalties #{fplData.penalties_order}
                  </span>
                ) : null}
                {fplData.corners_order != null ? (
                  <span className="inline-flex rounded-full border border-amber-300/35 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-100">
                    Corners #{fplData.corners_order}
                  </span>
                ) : null}
                {fplData.direct_freekicks_order != null ? (
                  <span className="inline-flex rounded-full border border-amber-300/35 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-100">
                    Direct FK #{fplData.direct_freekicks_order}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <PlayerDetailCharts
          pointsByGw={pointsByGw}
          last5={last5}
          radarCharts={radarCharts}
          homeAway={[
            { label: "Home", value: summary.home_avg },
            { label: "Away", value: summary.away_avg },
          ]}
          breakdown={[
            { name: "Ghost Pts", value: summary.ghost_pts_total, color: "#005B3A" },
            { name: "G/A/CS", value: summary.attack_pts, color: "#F59E0B" },
          ]}
        />

        <section className="space-y-2">
          <h2 className="text-lg font-black text-brand-dark">Next Fixtures</h2>
          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {upcoming.map((fixture) => (
              <article key={fixture.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-brand-dark">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">GW {fixture.gameweek}</p>
                <p className="mt-1 text-sm font-bold leading-tight">{fixture.opponentName}</p>
                <p className="mt-0.5 text-xs text-slate-600">{fixture.isHome ? "Home" : "Away"}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-black text-brand-dark">Full Gameweek Stats</h2>
          <PlayerGameweekTableClient
            rows={tableDecorated}
            teamNames={teamNamesRecord}
            fdrRankByTeam={fdrRankByTeam}
            season={tableSeason}
            availableSeasons={availableSeasons}
            position={playerPosition}
          />
        </section>
      </div>
  );
}
