import FixturesClient from "@/app/portal/fixtures/FixturesClient";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const SEASON = "2025-26";

type FixtureRow = {
  id: string;
  gameweek: number;
  home_team: string;
  away_team: string;
};

type TeamRow = {
  abbrev: string;
  full_name: string | null;
  name: string | null;
};

export default async function FixturesPage() {
  const supabase = await createServerSupabaseClient();

  const [{ data: fixturesData, error: fixturesError }, { data: teamsData, error: teamsError }] = await Promise.all([
    supabase.from("fixtures").select("id, gameweek, home_team, away_team").eq("season", SEASON).order("gameweek"),
    supabase.from("teams").select("abbrev, full_name, name"),
  ]);

  if (fixturesError) {
    throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
  }

  if (teamsError) {
    throw new Error(`Unable to load teams: ${teamsError.message}`);
  }

  const teamNameByAbbrev = new Map<string, string>();
  for (const team of (teamsData ?? []) as TeamRow[]) {
    teamNameByAbbrev.set(team.abbrev, team.full_name || team.name || team.abbrev);
  }

  const fixtures = ((fixturesData ?? []) as FixtureRow[]).map((fixture) => ({
    id: fixture.id,
    gameweek: fixture.gameweek,
    homeTeam: teamNameByAbbrev.get(fixture.home_team) ?? fixture.home_team,
    awayTeam: teamNameByAbbrev.get(fixture.away_team) ?? fixture.away_team,
  }));

  const latestGameweek = fixtures.reduce((max, fixture) => Math.max(max, fixture.gameweek), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Fixtures</h1>
        <p className="mt-2 text-sm text-brand-creamDark">Season {SEASON} fixtures by gameweek.</p>
      </div>
      <FixturesClient fixtures={fixtures} defaultGameweek={latestGameweek} />
    </div>
  );
}
