import type { GWOverviewFixture, GWOverviewPlayer, GWOverviewTeam } from "@/app/portal/gw-overview/GWOverviewClient";
import { SEASON } from "@/lib/portal/playerMetrics";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type PlayerRow = {
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
      }
    | Array<{
        chance_of_playing_next_round: number | null;
        status: string | null;
        news: string | null;
      }>
    | null;
};

type TeamRow = {
  abbrev: string;
};

type FixtureRow = GWOverviewFixture;

type AvailableGameweekRow = {
  gameweek: number;
};

export type GWOverviewTabData = {
  players: GWOverviewPlayer[];
  selectedGws: number[];
  teams: GWOverviewTeam[];
  allGws: number[];
  season: string;
  fixtures: GWOverviewFixture[];
};

function mapPosition(position: string): "GK" | "DEF" | "MID" | "FWD" {
  switch (position) {
    case "G":
      return "GK";
    case "D":
      return "DEF";
    case "M":
      return "MID";
    case "F":
      return "FWD";
    default:
      return "MID";
  }
}

function parseOwnership(value: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getGWOverviewData(): Promise<GWOverviewTabData> {
  const supabase = await createServerSupabaseClient();

  const [
    { data: players, error: playersError },
    { data: teams, error: teamsError },
    { data: fixtures, error: fixturesError },
    { data: availableGameweeks, error: availableGameweeksError },
  ] = await Promise.all([
    supabase
      .from("players")
      .select("id, name, team, position, ownership_pct, fpl_player_data(chance_of_playing_next_round, status, news)")
      .order("name"),
    supabase.from("teams").select("abbrev").order("abbrev"),
    supabase.from("fixtures").select("gameweek, home_team, away_team").eq("season", SEASON),
    supabase.from("player_gameweeks").select("gameweek").eq("season", SEASON).order("gameweek", { ascending: false }),
  ]);

  if (playersError) {
    throw new Error(`Unable to load players: ${playersError.message}`);
  }
  if (teamsError) {
    throw new Error(`Unable to load teams: ${teamsError.message}`);
  }
  if (fixturesError) {
    throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
  }
  if (availableGameweeksError) {
    throw new Error(`Unable to load available gameweeks: ${availableGameweeksError.message}`);
  }

  const allGws = Array.from(
    new Set(
      ((availableGameweeks ?? []) as AvailableGameweekRow[])
        .map((row) => Number(row.gameweek ?? 0))
        .filter((gameweek) => gameweek > 0)
    )
  ).sort((a, b) => b - a);

  const selectedGws = allGws.slice(0, 5).sort((a, b) => a - b);

  const normalizedPlayers: GWOverviewPlayer[] = ((players ?? []) as PlayerRow[]).map((player) => {
    const availabilityRaw = Array.isArray(player.fpl_player_data) ? player.fpl_player_data[0] : player.fpl_player_data;

    return {
      id: player.id,
      name: player.name,
      team: player.team,
      position: mapPosition(player.position),
      ownershipPct: parseOwnership(player.ownership_pct),
      chanceOfPlaying: availabilityRaw?.chance_of_playing_next_round ?? null,
      availabilityStatus: availabilityRaw?.status ?? null,
      availabilityNews: availabilityRaw?.news ?? null,
    };
  });

  const teamAbbrevs = ((teams ?? []) as TeamRow[]).map((team) => team.abbrev);
  const playerTeams = Array.from(new Set(normalizedPlayers.map((player) => player.team)));
  const normalizedTeams: GWOverviewTeam[] = Array.from(new Set([...teamAbbrevs, ...playerTeams])).sort((a, b) =>
    a.localeCompare(b)
  );

  return {
    players: normalizedPlayers,
    selectedGws,
    teams: normalizedTeams,
    allGws,
    season: SEASON,
    fixtures: (fixtures ?? []) as FixtureRow[],
  };
}
