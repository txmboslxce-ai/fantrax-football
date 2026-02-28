import PremiumGate from "@/components/PremiumGate";
import PlayerDetailCharts from "@/components/portal/charts/PlayerDetailCharts";
import { isPremiumUserEmail } from "@/lib/premium";
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
    supabase.from("players").select("id, name, team, position").eq("id", id).maybeSingle(),
    supabase
      .from("player_gameweeks")
      .select(
        "id, player_id, season, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, clean_sheet, goals_against, saves, key_passes, tackles_won, interceptions, clearances, aerials_won"
      )
      .eq("player_id", id)
      .eq("season", SEASON)
      .order("gameweek"),
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

  const isPremium = isPremiumUserEmail(user?.email);
  const teamNames = teamNameMap((teams ?? []) as TeamRow[]);
  const fixturesForTeam = ((teamFixtures ?? []) as FixtureRow[]).filter(
    (fixture) => fixture.home_team === player.team || fixture.away_team === player.team
  );
  const decorated = decorateGameweeks((gameweeks ?? []) as PlayerGameweekRow[], player.team, fixturesForTeam);
  const summary = summarizePlayerSeason(decorated);
  const upcoming = nextFixtures(player.team, fixturesForTeam, summary.current_gameweek, teamNames, 5);

  const playedRows = decorated.filter((row) => row.games_played === 1);
  const pointsByGw = playedRows.map((row) => ({ gameweek: row.gameweek, points: row.raw_fantrax_pts }));
  const last5 = pointsByGw.slice(-5);

  const primaryColumns =
    mapPosition(player.position) === "GK"
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
              <h1 className="text-3xl font-black sm:text-5xl">{player.name}</h1>
              <p className="mt-2 text-sm text-brand-creamDark">{teamNames.get(player.team) ?? player.team}</p>
            </div>
            <span className="inline-flex rounded-full bg-brand-green px-4 py-1 text-sm font-bold text-brand-cream">
              {mapPosition(player.position)}
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-brand-cream/20 bg-brand-green/20 p-5">
              <p className="text-xs uppercase tracking-wide text-brand-creamDark">Season Points</p>
              <p className="mt-2 text-4xl font-black">{formatFixed(summary.season_total_pts, 1)}</p>
            </article>
            <article className="rounded-xl border border-brand-cream/20 bg-brand-green/20 p-5">
              <p className="text-xs uppercase tracking-wide text-brand-creamDark">Avg Pts/GW</p>
              <p className="mt-2 text-4xl font-black">{formatFixed(summary.avg_pts_per_game)}</p>
            </article>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-full border border-brand-cream/20 bg-brand-dark/60 px-4 py-2 text-sm">
              Avg Pts/Start: <strong>{formatFixed(summary.avg_pts_per_start)}</strong>
            </div>
            <div className="rounded-full border border-brand-cream/20 bg-brand-dark/60 px-4 py-2 text-sm">
              Ghost Pts/GW: <strong>{formatFixed(summary.avg_ghost_per_game)}</strong>
            </div>
            <div className="rounded-full border border-brand-cream/20 bg-brand-dark/60 px-4 py-2 text-sm">
              Ghost Pts/Start: <strong>{formatFixed(summary.avg_ghost_per_start)}</strong>
            </div>
            <div className="rounded-full border border-brand-cream/20 bg-brand-dark/60 px-4 py-2 text-sm">
              Games Played: <strong>{summary.games_played}</strong>
            </div>
          </div>
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
            { name: "Attack Pts", value: summary.attack_pts, color: "#E8E4D9" },
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
                {decorated.map((row, index) => (
                  <tr key={row.id} className={index % 2 === 0 ? "bg-brand-dark/70" : "bg-brand-dark/90"}>
                    <td className="px-3 py-3">{row.gameweek}</td>
                    <td className="px-3 py-3">{row.opponent ? teamNames.get(row.opponent) ?? row.opponent : "-"}</td>
                    <td className="px-3 py-3">{row.isHome == null ? "-" : row.isHome ? "H" : "A"}</td>
                    <td className="px-3 py-3">{row.minutes_played}</td>
                    <td className="px-3 py-3">{formatFixed(row.raw_fantrax_pts, 1)}</td>
                    <td className="px-3 py-3">{row.goals}</td>
                    <td className="px-3 py-3">{row.assists}</td>
                    <td className="px-3 py-3">{row.clean_sheet}</td>
                    <td className="px-3 py-3">{formatFixed(row.ghost_pts, 1)}</td>
                    {primaryColumns.map((column) => (
                      <td key={`${row.id}-${column.key}`} className="px-3 py-3">
                        {String((row as Record<string, number | string | boolean | null>)[column.key] ?? "-")}
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
