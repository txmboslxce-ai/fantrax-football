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
        "id, name, team, position, fpl_player_data(expected_goals_per_90, expected_assists_per_90, penalties_order, corners_order, direct_freekicks_order, status, chance_of_playing_next_round, news, news_added, last_synced_at, synced_at)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("player_gameweeks")
      .select(
        "id, player_id, season, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, clean_sheet, goals_against, saves, key_passes, tackles_won, interceptions, clearances, aerials_won"
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

  const primaryColumns =
    mapPosition(playerRow.position) === "GK"
      ? [
          { key: "saves", label: "Saves" },
          { key: "goals_against", label: "GA" },
          { key: "key_passes", label: "KP" },
        ]
      : [
          { key: "tackles_won", label: "Tackles" },
          { key: "interceptions", label: "Interceptions" },
          { key: "clearances", label: "Clearances" },
          { key: "aerials_won", label: "Aerials" },
          { key: "key_passes", label: "Key Passes" },
        ];

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
          <div className="overflow-x-auto rounded-xl border border-brand-cream/20">
            <table className="min-w-full text-left text-sm text-brand-cream">
              <thead className="bg-brand-dark text-brand-creamDark">
                <tr>
                  <th className="px-3 py-3">GW</th>
                  <th className="px-3 py-3">Opponent</th>
                  <th className="px-3 py-3">H/A</th>
                  <th className="px-3 py-3">Min</th>
                  <th className="px-3 py-3">Pts</th>
                  <th className="px-3 py-3">Goals</th>
                  <th className="px-3 py-3">Assists</th>
                  <th className="px-3 py-3">CS</th>
                  <th className="px-3 py-3">Ghost Pts</th>
                  {primaryColumns.map((column) => (
                    <th key={column.key} className="px-3 py-3">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {decorated.slice().reverse().map((row, index) => (
                  <tr key={row.id} className={index % 2 === 0 ? "bg-brand-dark/70" : "bg-brand-dark/90"}>
                    <td className="px-3 py-3">{row.gameweek}</td>
                    <td className="px-3 py-3">
                      {row.opponents.length === 2
                        ? row.opponents.map((opponent) => teamNames.get(opponent) ?? opponent).join(" / ")
                        : row.opponent
                          ? teamNames.get(row.opponent) ?? row.opponent
                          : "-"}
                    </td>
                    <td className="px-3 py-3">
                      {row.isHomeAll.length === 2
                        ? row.isHomeAll.map((isHome) => (isHome ? "H" : "A")).join(" / ")
                        : row.isHome == null
                          ? "-"
                          : row.isHome
                            ? "H"
                            : "A"}
                    </td>
                    <td className="px-3 py-3">{row.minutes_played}</td>
                    <td className="px-3 py-3">{formatFixed(row.raw_fantrax_pts, 2)}</td>
                    <td className="px-3 py-3">{row.goals}</td>
                    <td className="px-3 py-3">{row.assists}</td>
                    <td className="px-3 py-3">{row.clean_sheet}</td>
                    <td className="px-3 py-3">{formatFixed(row.ghost_pts, 2)}</td>
                    {primaryColumns.map((column) => (
                      <td key={`${row.id}-${column.key}`} className="px-3 py-3">
                        {String((row as Record<string, unknown>)[column.key] ?? "-")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PremiumGate>
  );
}
