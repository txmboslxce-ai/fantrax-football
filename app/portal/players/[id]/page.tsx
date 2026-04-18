import PremiumGate from "@/components/PremiumGate";
import PlayerDetailCharts from "@/components/portal/charts/PlayerDetailCharts";
import { isPremiumUser } from "@/lib/premium";
import {
  SEASON,
  decorateGameweeks,
  formatFixed,
  mapPosition,
  nextFixtures,
  summarizePlayerSeason,
  teamNameMap,
  type FixtureRow,
  type PlayerGameweekRow,
  type TeamRow,
} from "@/lib/portal/playerMetrics";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import PlayerGameweekTableClient from "./PlayerGameweekTableClient";

type PlayerDetailPageProps = {
  params: Promise<{
    id: string;
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

export default async function PlayerDetailPage({ params }: PlayerDetailPageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

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
      .eq("season", SEASON)
      .order("gameweek", { ascending: true }),
    supabase
      .from("fixtures")
      .select("id, season, gameweek, home_team, away_team")
      .eq("season", SEASON)
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

  // FDR: fetch all started rows for this season (position filtered in JS below)
  type FdrGameweekRow = {
    gameweek: number;
    raw_fantrax_pts: number | string | null;
    players: { team: string; position: string } | Array<{ team: string; position: string }> | null;
  };
  const { data: fdrGameweeks } = await supabase
    .from("player_gameweeks")
    .select("gameweek, raw_fantrax_pts, players!inner(team, position)")
    .eq("season", SEASON)
    .gte("games_started", 1)
    .gt("games_played", 0);

  // Build gameweek:team → opponents[] map from all season fixtures
  const opponentsByGwAndTeam = new Map<string, string[]>();
  for (const fixture of (teamFixtures ?? []) as FixtureRow[]) {
    const homeKey = `${fixture.gameweek}:${fixture.home_team}`;
    const awayKey = `${fixture.gameweek}:${fixture.away_team}`;
    if (!opponentsByGwAndTeam.has(homeKey)) opponentsByGwAndTeam.set(homeKey, []);
    opponentsByGwAndTeam.get(homeKey)!.push(fixture.away_team);
    if (!opponentsByGwAndTeam.has(awayKey)) opponentsByGwAndTeam.set(awayKey, []);
    opponentsByGwAndTeam.get(awayKey)!.push(fixture.home_team);
  }

  // Accumulate raw_fantrax_pts per opponent for this player's position only
  const opponentTotals = new Map<string, { pts: number; starts: number }>();
  for (const row of (fdrGameweeks ?? []) as FdrGameweekRow[]) {
    const rowPlayer = Array.isArray(row.players) ? row.players[0] : row.players;
    if (!rowPlayer || rowPlayer.position !== playerRow.position) continue;
    const pts = Number(row.raw_fantrax_pts ?? 0);
    for (const opp of opponentsByGwAndTeam.get(`${row.gameweek}:${rowPlayer.team}`) ?? []) {
      const entry = opponentTotals.get(opp) ?? { pts: 0, starts: 0 };
      entry.pts += pts;
      entry.starts += 1;
      opponentTotals.set(opp, entry);
    }
  }

  // Rank ascending: 1 = hardest (fewest pts conceded per start), 20 = easiest
  const fdrRankByTeam: Record<string, number> = {};
  [...opponentTotals.entries()]
    .map(([team, { pts, starts }]) => ({ team, avg: starts > 0 ? pts / starts : 0 }))
    .sort((a, b) => a.avg - b.avg)
    .forEach(({ team }, idx) => { fdrRankByTeam[team] = idx + 1; });

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

  const isPremium = await isPremiumUser(user?.id);
  const teamNames = teamNameMap((teams ?? []) as TeamRow[]);
  const fixturesForTeam = ((teamFixtures ?? []) as FixtureRow[]).filter(
    (fixture) => fixture.home_team === playerRow.team || fixture.away_team === playerRow.team
  );
  const decorated = decorateGameweeks((gameweeks ?? []) as PlayerGameweekRow[], playerRow.team, fixturesForTeam);
  const summary = summarizePlayerSeason(decorated);
  const upcoming = nextFixtures(playerRow.team, fixturesForTeam, summary.current_gameweek, teamNames, 5);

  const playedRows = decorated.filter((row) => row.games_played > 0);
  const pointsByGw = playedRows.map((row) => ({ gameweek: row.gameweek, points: row.raw_fantrax_pts }));
  const last5 = pointsByGw.slice(-5);

  const teamNamesRecord = Object.fromEntries(teamNames.entries());

  return (
    <PremiumGate isPremium={isPremium}>
      <div className="space-y-8">
        <section className="rounded-2xl border border-brand-cream/20 bg-brand-dark p-6 text-brand-cream sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">{playerRow.name}</h1>
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

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-brand-cream/20 bg-brand-green/20 p-5">
              <p className="text-xs uppercase tracking-wide text-brand-creamDark">Season Points</p>
              <p className="mt-2 text-4xl font-black">{formatFixed(summary.season_total_pts, 2)}</p>
            </article>
            <article className="rounded-xl border border-brand-cream/20 bg-brand-green/20 p-5">
              <p className="text-xs uppercase tracking-wide text-brand-creamDark">Avg Pts/GW</p>
              <p className="mt-2 text-4xl font-black">{formatFixed(summary.avg_pts_per_gameweek)}</p>
            </article>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-full border border-brand-cream/20 bg-brand-dark/60 px-4 py-2 text-sm">
              Avg Pts/Start: <strong>{formatFixed(summary.avg_pts_per_start)}</strong>
            </div>
            <div className="rounded-full border border-brand-cream/20 bg-brand-dark/60 px-4 py-2 text-sm">
              Ghost Pts/GW: <strong>{formatFixed(summary.avg_ghost_per_gameweek)}</strong>
            </div>
            <div className="rounded-full border border-brand-cream/20 bg-brand-dark/60 px-4 py-2 text-sm">
              Ghost Pts/Start: <strong>{formatFixed(summary.avg_ghost_per_start)}</strong>
            </div>
            <div className="rounded-full border border-brand-cream/20 bg-brand-dark/60 px-4 py-2 text-sm">
              Games Played: <strong>{summary.total_games_played}</strong>
            </div>
            <div className="rounded-full border border-brand-cream/20 bg-brand-dark/60 px-4 py-2 text-sm">
              Starts: <strong>{summary.total_games_started}</strong>
            </div>
            {playerRow.ownership_pct != null ? (
              <div className="rounded-full border border-brand-cream/20 bg-brand-dark/60 px-4 py-2 text-sm">
                Ownership: <strong>{playerRow.ownership_pct}</strong>
              </div>
            ) : null}
            {hasXgXa ? (
              <>
                <div className="rounded-full border border-brand-cream/20 bg-brand-dark/60 px-4 py-2 text-sm">
                  <span title="Expected goals and assists per 90 minutes, sourced from FPL data">xG/90 (?)</span>:{" "}
                  <strong>{xgPer90.toFixed(2)}</strong>
                </div>
                <div className="rounded-full border border-brand-cream/20 bg-brand-dark/60 px-4 py-2 text-sm">
                  <span title="Expected goals and assists per 90 minutes, sourced from FPL data">xA/90 (?)</span>:{" "}
                  <strong>{xaPer90.toFixed(2)}</strong>
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
          homeAway={[
            { label: "Home", value: summary.home_avg },
            { label: "Away", value: summary.away_avg },
          ]}
          breakdown={[
            { name: "Ghost Pts", value: summary.ghost_pts_total, color: "#2A7A3B" },
            { name: "G/A/CS", value: summary.attack_pts, color: "#E8E4D9" },
          ]}
        />

        <section className="space-y-3">
          <h2 className="text-2xl font-black text-brand-cream">Next Fixtures</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {upcoming.map((fixture) => (
              <article key={fixture.id} className="rounded-xl border border-brand-cream/20 bg-brand-greenDark p-4 text-brand-cream">
                <p className="text-xs uppercase tracking-wider text-brand-creamDark">GW {fixture.gameweek}</p>
                <p className="mt-2 font-bold">{fixture.opponentName}</p>
                <p className="mt-1 text-sm">{fixture.isHome ? "H" : "A"}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-black text-brand-cream">Full Gameweek Stats</h2>
          <PlayerGameweekTableClient
            rows={decorated}
            teamNames={teamNamesRecord}
            fdrRankByTeam={fdrRankByTeam}
          />
        </section>
      </div>
    </PremiumGate>
  );
}
