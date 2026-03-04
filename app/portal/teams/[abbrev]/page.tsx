import PremiumGate from "@/components/PremiumGate";
import { SEASON, mapPosition, nextFixtures, teamNameMap, type FixtureRow, type TeamRow } from "@/lib/portal/playerMetrics";
import { isPremiumUserEmail } from "@/lib/premium";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";
import { notFound } from "next/navigation";

const TEAM_TABS = [
  { key: "overview", label: "Overview" },
  { key: "squad", label: "Squad" },
  { key: "fixtures", label: "Fixtures" },
  { key: "stats", label: "Stats" },
] as const;

type TeamTabKey = (typeof TEAM_TABS)[number]["key"];
type TeamPlayerRow = { id: string; name: string };
type TeamGameweekRow = {
  player_id: string;
  gameweek: number;
  games_played: number;
  games_started?: number;
  raw_fantrax_pts: number | string | null;
};
type OpponentGameweekJoinedRow = {
  gameweek: number;
  games_started: number;
  raw_fantrax_pts: number | string | null;
  players:
    | {
        team: string;
        position: string;
      }
    | Array<{
        team: string;
        position: string;
      }>
    | null;
};

type TeamDetailPageProps = {
  params: Promise<{
    abbrev: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
  }>;
};

function toTabKey(value: string | undefined): TeamTabKey {
  const tab = value?.toLowerCase();
  return TEAM_TABS.some((item) => item.key === tab) ? (tab as TeamTabKey) : "overview";
}

export default async function TeamDetailPage({ params, searchParams }: TeamDetailPageProps) {
  const [{ abbrev }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const teamAbbrev = abbrev.toUpperCase().trim();
  const activeTab = toTabKey(resolvedSearchParams?.tab);

  const supabase = await createServerSupabaseClient();
  const [
    {
      data: { user },
    },
    { data: teams, error: teamsError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("teams").select("abbrev, name, full_name").order("full_name"),
  ]);

  if (teamsError) {
    throw new Error(`Unable to load teams: ${teamsError.message}`);
  }
  const team = ((teams ?? []) as TeamRow[]).find((item) => item.abbrev === teamAbbrev);
  if (!team) {
    notFound();
  }
  const teamNames = teamNameMap((teams ?? []) as TeamRow[]);

  let overviewData:
    | {
        totalTeamPoints: number;
      topScorers: Array<{ id: string; name: string; points: number }>;
      concededByPosition: Record<"GK" | "DEF" | "MID" | "FWD", { perGame: number; perStart: number }>;
      upcoming: ReturnType<typeof nextFixtures>;
    }
    | undefined;

  if (activeTab === "overview") {
    const { data: teamPlayers, error: playersError } = await supabase
      .from("players")
      .select("id, name")
      .eq("team", teamAbbrev)
      .order("name");
    if (playersError) {
      throw new Error(`Unable to load team players: ${playersError.message}`);
    }

    const playerRows = (teamPlayers ?? []) as TeamPlayerRow[];
    const playerIds = playerRows.map((player) => player.id);

    const [{ data: gameweeks, error: gameweeksError }, { data: fixtures, error: fixturesError }] = await Promise.all([
      playerIds.length
        ? supabase
            .from("player_gameweeks")
            .select("player_id, gameweek, games_played, raw_fantrax_pts")
            .eq("season", SEASON)
            .in("player_id", playerIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("fixtures").select("id, season, gameweek, home_team, away_team").eq("season", SEASON),
    ]);

    if (gameweeksError) {
      throw new Error(`Unable to load player gameweeks: ${gameweeksError.message}`);
    }
    if (fixturesError) {
      throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
    }

    const pointsByPlayer = new Map(playerRows.map((player) => [player.id, 0]));
    let totalTeamPoints = 0;
    let currentGameweek = 0;

    for (const row of (gameweeks ?? []) as TeamGameweekRow[]) {
      if (Number(row.games_played ?? 0) <= 0) {
        continue;
      }

      const rowPoints = Number(row.raw_fantrax_pts ?? 0);
      totalTeamPoints += rowPoints;
      currentGameweek = Math.max(currentGameweek, Number(row.gameweek ?? 0));
      pointsByPlayer.set(row.player_id, (pointsByPlayer.get(row.player_id) ?? 0) + rowPoints);
    }

    const topScorers = playerRows
      .map((player) => ({
        id: player.id,
        name: player.name,
        points: pointsByPlayer.get(player.id) ?? 0,
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 3);

    const fixturesForTeamPlayed = ((fixtures ?? []) as FixtureRow[]).filter(
      (fixture) => fixture.gameweek <= currentGameweek && (fixture.home_team === teamAbbrev || fixture.away_team === teamAbbrev)
    );

    let concededByPosition: Record<"GK" | "DEF" | "MID" | "FWD", { perGame: number; perStart: number }> = {
      GK: { perGame: 0, perStart: 0 },
      DEF: { perGame: 0, perStart: 0 },
      MID: { perGame: 0, perStart: 0 },
      FWD: { perGame: 0, perStart: 0 },
    };

    const playedGameweeks = Array.from(new Set(fixturesForTeamPlayed.map((fixture) => fixture.gameweek)));
    if (playedGameweeks.length > 0) {
      const { data: opponentGameweeks, error: opponentGameweeksError } = await supabase
        .from("player_gameweeks")
        .select("gameweek, games_started, raw_fantrax_pts, players!inner(team, position)")
        .eq("season", SEASON)
        .gt("games_played", 0)
        .in("gameweek", playedGameweeks);
      if (opponentGameweeksError) {
        throw new Error(`Unable to load opponent player gameweeks: ${opponentGameweeksError.message}`);
      }

      const totalsByPosition: Record<"GK" | "DEF" | "MID" | "FWD", number> = {
        GK: 0,
        DEF: 0,
        MID: 0,
        FWD: 0,
      };
      const startedTotalsByPosition: Record<"GK" | "DEF" | "MID" | "FWD", number> = {
        GK: 0,
        DEF: 0,
        MID: 0,
        FWD: 0,
      };
      const startedCountByPosition: Record<"GK" | "DEF" | "MID" | "FWD", number> = {
        GK: 0,
        DEF: 0,
        MID: 0,
        FWD: 0,
      };

      for (const row of (opponentGameweeks ?? []) as OpponentGameweekJoinedRow[]) {
        const player = Array.isArray(row.players) ? row.players[0] : row.players;
        if (!player || player.team === teamAbbrev) {
          continue;
        }

        const matchesFixtureJoin = fixturesForTeamPlayed.some(
          (fixture) =>
            fixture.gameweek === Number(row.gameweek ?? 0) &&
            ((fixture.home_team === teamAbbrev && fixture.away_team === player.team) ||
              (fixture.away_team === teamAbbrev && fixture.home_team === player.team))
        );
        if (!matchesFixtureJoin) {
          continue;
        }

        const position = mapPosition(player.position);
        const rowPoints = Number(row.raw_fantrax_pts ?? 0);
        totalsByPosition[position] += rowPoints;
        if (Number(row.games_started ?? 0) >= 1) {
          startedTotalsByPosition[position] += rowPoints;
          startedCountByPosition[position] += 1;
        }
      }

      const distinctGameweeks = new Set(fixturesForTeamPlayed.map((fixture) => fixture.gameweek)).size;
      concededByPosition = {
        GK: {
          perGame: distinctGameweeks > 0 ? totalsByPosition.GK / distinctGameweeks : 0,
          perStart: startedCountByPosition.GK > 0 ? startedTotalsByPosition.GK / startedCountByPosition.GK : 0,
        },
        DEF: {
          perGame: distinctGameweeks > 0 ? totalsByPosition.DEF / distinctGameweeks : 0,
          perStart: startedCountByPosition.DEF > 0 ? startedTotalsByPosition.DEF / startedCountByPosition.DEF : 0,
        },
        MID: {
          perGame: distinctGameweeks > 0 ? totalsByPosition.MID / distinctGameweeks : 0,
          perStart: startedCountByPosition.MID > 0 ? startedTotalsByPosition.MID / startedCountByPosition.MID : 0,
        },
        FWD: {
          perGame: distinctGameweeks > 0 ? totalsByPosition.FWD / distinctGameweeks : 0,
          perStart: startedCountByPosition.FWD > 0 ? startedTotalsByPosition.FWD / startedCountByPosition.FWD : 0,
        },
      };
    }

    const upcoming = nextFixtures(teamAbbrev, (fixtures ?? []) as FixtureRow[], currentGameweek, teamNames, 5);
    overviewData = { totalTeamPoints, topScorers, concededByPosition, upcoming };
  }

  const panelContent: Record<Exclude<TeamTabKey, "overview">, { title: string; description: string }> = {
    squad: {
      title: "Squad",
      description: "Squad depth, player roles, and position breakdowns will appear here.",
    },
    fixtures: {
      title: "Fixtures",
      description: "Upcoming fixture runs and difficulty views will appear here.",
    },
    stats: {
      title: "Stats",
      description: "Team-level performance metrics and splits will appear here.",
    },
  };

  return (
    <PremiumGate isPremium={isPremiumUserEmail(user?.email)}>
      <div className="space-y-6">
        <header className="rounded-xl border border-brand-cream/20 bg-brand-dark px-5 py-4">
          <p className="text-xs uppercase tracking-widest text-brand-creamDark">{team.abbrev}</p>
          <h1 className="mt-1 text-3xl font-black text-brand-cream sm:text-4xl">{team.full_name}</h1>
        </header>

        <nav className="flex flex-wrap gap-2">
          {TEAM_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/portal/teams/${encodeURIComponent(team.abbrev.toLowerCase())}?tab=${tab.key}`}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? "border-brand-greenLight bg-brand-green text-brand-cream"
                  : "border-brand-cream/35 bg-brand-dark text-brand-cream hover:bg-brand-greenDark"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <section className="rounded-xl border border-brand-cream/20 bg-brand-dark/70 p-6 text-brand-cream">
          {activeTab === "overview" ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <article className="rounded-xl border border-brand-cream/20 bg-brand-green/20 p-5">
                  <p className="text-xs uppercase tracking-wide text-brand-creamDark">Team Total Points</p>
                  <p className="mt-2 text-3xl font-black">{(overviewData?.totalTeamPoints ?? 0).toFixed(2)}</p>
                  <p className="mt-1 text-xs text-brand-creamDark">Season {SEASON}</p>
                </article>

                {(overviewData?.topScorers ?? []).map((player, index) => (
                  <article key={player.id} className="rounded-xl border border-brand-cream/20 bg-brand-dark p-5">
                    <p className="text-xs uppercase tracking-wide text-brand-creamDark">Top Scorer #{index + 1}</p>
                    <p className="mt-2 text-lg font-black">{player.name}</p>
                    <p className="mt-1 text-sm text-brand-creamDark">{player.points.toFixed(2)} pts</p>
                  </article>
                ))}
              </div>

              <div className="space-y-3">
                <h2 className="text-2xl font-black">Points Conceded by Position</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {(["GK", "DEF", "MID", "FWD"] as const).map((position) => (
                    <article key={position} className="rounded-xl border border-brand-cream/20 bg-brand-dark p-4">
                      <p className="text-xs uppercase tracking-wider text-brand-creamDark">{position}</p>
                      <p className="mt-2 text-2xl font-black">{(overviewData?.concededByPosition[position].perGame ?? 0).toFixed(2)}</p>
                      <p className="mt-1 text-xs text-brand-creamDark">Avg pts conceded / game</p>
                      <p className="mt-3 text-xl font-black">{(overviewData?.concededByPosition[position].perStart ?? 0).toFixed(2)}</p>
                      <p className="mt-1 text-xs text-brand-creamDark">Avg pts conceded / start</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-2xl font-black">Next 5 Fixtures</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {(overviewData?.upcoming ?? []).map((fixture) => (
                    <article key={fixture.id} className="rounded-xl border border-brand-cream/20 bg-brand-greenDark p-4 text-brand-cream">
                      <p className="text-xs uppercase tracking-wider text-brand-creamDark">GW {fixture.gameweek}</p>
                      <p className="mt-2 font-bold">{fixture.opponentName}</p>
                      <p className="mt-1 text-sm">{fixture.isHome ? "H" : "A"}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-black">{panelContent[activeTab].title}</h2>
              <p className="mt-2 text-sm text-brand-creamDark">{panelContent[activeTab].description}</p>
            </>
          )}
        </section>
      </div>
    </PremiumGate>
  );
}
