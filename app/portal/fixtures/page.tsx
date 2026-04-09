import FixturesClient from "@/app/portal/fixtures/FixturesClient";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const SEASON = "2025-26";

type PageProps = {
  searchParams?:
    | {
        gameweek?: string | string[];
      }
    | Promise<{
        gameweek?: string | string[];
      }>;
};

type FixtureRow = {
  id: string;
  gameweek: number;
  home_team: string;
  away_team: string;
  kickoff_at: string | null;
};

type TeamRow = {
  abbrev: string;
  full_name: string | null;
  name: string | null;
};

type LatestGameweekRow = {
  gameweek: number;
};

function parseRequestedGameweek(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function FixturesPage({ searchParams }: PageProps) {
  const resolvedSearchParams =
    searchParams && typeof searchParams === "object" && "then" in searchParams ? await searchParams : searchParams;

  const supabase = await createServerSupabaseClient();

  const [{ data: fixturesData, error: fixturesError }, { data: teamsData, error: teamsError }, { data: currentGwData, error: currentGwError }] =
    await Promise.all([
      supabase.from("fixtures").select("id, gameweek, home_team, away_team, kickoff_at").eq("season", SEASON).order("gameweek"),
      supabase.from("teams").select("abbrev, full_name, name"),
      supabase.from("player_gameweeks").select("gameweek").eq("season", SEASON).order("gameweek", { ascending: false }).limit(1),
    ]);

  if (fixturesError) {
    throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
  }

  if (teamsError) {
    throw new Error(`Unable to load teams: ${teamsError.message}`);
  }

  if (currentGwError) {
    throw new Error(`Unable to load current gameweek: ${currentGwError.message}`);
  }

  const teamNameByAbbrev = new Map<string, string>();
  for (const team of (teamsData ?? []) as TeamRow[]) {
    teamNameByAbbrev.set(team.abbrev, team.full_name || team.name || team.abbrev);
  }

  const fixtures = ((fixturesData ?? []) as FixtureRow[]).map((fixture) => ({
    id: fixture.id,
    gameweek: fixture.gameweek,
    homeAbbrev: fixture.home_team,
    awayAbbrev: fixture.away_team,
    homeTeam: teamNameByAbbrev.get(fixture.home_team) ?? fixture.home_team,
    awayTeam: teamNameByAbbrev.get(fixture.away_team) ?? fixture.away_team,
    kickoffAt: fixture.kickoff_at,
  }));

  const gameweeks = Array.from(new Set(fixtures.map((fixture) => fixture.gameweek))).sort((a, b) => a - b);
  const currentGameweek = Number(((currentGwData ?? []) as LatestGameweekRow[])[0]?.gameweek ?? gameweeks[0] ?? 1);
  const requestedGameweek = parseRequestedGameweek(resolvedSearchParams?.gameweek);
  const pastOrCurrentGameweeks = gameweeks.filter((gameweek) => gameweek <= currentGameweek);
  const nearestAvailableGameweek =
    gameweeks.includes(currentGameweek)
      ? currentGameweek
      : pastOrCurrentGameweeks.length > 0
        ? pastOrCurrentGameweeks[pastOrCurrentGameweeks.length - 1]
        : gameweeks[0] ?? 1;
  const defaultGameweek = requestedGameweek && gameweeks.includes(requestedGameweek) ? requestedGameweek : nearestAvailableGameweek;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Fixtures</h1>
        <p className="mt-2 text-sm text-brand-creamDark">Season {SEASON} fixtures by gameweek. Click a fixture to see player outputs.</p>
      </div>
      <FixturesClient fixtures={fixtures} defaultGameweek={defaultGameweek} />
    </div>
  );
}
