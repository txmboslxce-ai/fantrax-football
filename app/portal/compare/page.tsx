import CompareClient from "@/app/portal/compare/CompareClient";
import { mapPosition, nextFixtures, teamNameMap, type FixtureRow, type TeamRow } from "@/lib/portal/playerMetrics";
import {
  fetchPlayerRadarProfilesBySeason,
  fetchPlayerWindowStatsBySeason,
  emptyWindowStatsRow,
  type RadarDatum,
  type RadarProfileKey,
} from "@/lib/portal/summaryAdapters";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { resolvePortalSeason } from "@/lib/season/portal-season";
import { getUserLeagueRoster } from "@/lib/portal/leagueRoster";

export type ComparePlayerSnapshot = {
  id: string;
  name: string;
  team: string;
  teamName: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
  avgPtsPerGame: number;
  avgPtsPerStart: number;
  ghostPtsPerStart: number;
  nextOpponent: string;
  homePct: number;
  awayPct: number;
  comparison: {
    seasonPts: number;
    avgGw: number;
    avgStart: number;
    ghostGw: number;
    ghostStart: number;
    goals: number;
    assists: number;
    cleanSheets: number;
    homeAvg: number;
    awayAvg: number;
  };
  radarProfiles: Partial<Record<RadarProfileKey, RadarDatum[]>>;
};

type ComparePageProps = {
  searchParams?: Promise<{ season?: string | string[] }> | { season?: string | string[] };
};

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const supabase = await createServerSupabaseClient();
  const resolvedSearchParams =
    searchParams && typeof searchParams === "object" && "then" in searchParams ? await searchParams : searchParams;
  const requestedSeason = Array.isArray(resolvedSearchParams?.season) ? resolvedSearchParams.season[0] : resolvedSearchParams?.season;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: profile }, { availableSeasons, season: SEASON }] = await Promise.all([
    user ? supabase.from("profiles").select("fantrax_league_id").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    resolvePortalSeason(supabase, requestedSeason),
  ]);

  // None of these four depend on each other's result.
  const [
    { data: poolRows, error: poolError },
    windowRowByPlayer,
    radarProfilesByPlayer,
    { data: fixtures, error: fixturesError },
    { data: teams, error: teamsError },
  ] = await Promise.all([
    supabase.from("season_player_pool").select("fantrax_id").eq("season", SEASON),
    fetchPlayerWindowStatsBySeason(SEASON, "season"),
    fetchPlayerRadarProfilesBySeason(SEASON),
    supabase.from("fixtures").select("id, season, gameweek, home_team, away_team").eq("season", SEASON),
    supabase.from("teams").select("abbrev, name, full_name"),
  ]);

  if (poolError) {
    throw new Error(`Unable to load the ${SEASON} player pool: ${poolError.message}`);
  }
  if (fixturesError) {
    throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
  }
  if (teamsError) {
    throw new Error(`Unable to load teams: ${teamsError.message}`);
  }

  const poolFantraxIds = (poolRows ?? []).map((row) => row.fantrax_id as string);

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, name, team, position, fpl_player_data(chance_of_playing_next_round, status, news)")
    .in("fantrax_id", poolFantraxIds)
    .order("name")
    .range(0, 40000);

  if (playersError) {
    throw new Error(`Unable to load players: ${playersError.message}`);
  }

  const teamNames = teamNameMap((teams ?? []) as TeamRow[]);
  const fixturesByTeam = new Map<string, FixtureRow[]>();
  for (const fixture of (fixtures ?? []) as FixtureRow[]) {
    if (!fixturesByTeam.has(fixture.home_team)) {
      fixturesByTeam.set(fixture.home_team, []);
    }
    if (!fixturesByTeam.has(fixture.away_team)) {
      fixturesByTeam.set(fixture.away_team, []);
    }
    fixturesByTeam.get(fixture.home_team)?.push(fixture);
    fixturesByTeam.get(fixture.away_team)?.push(fixture);
  }

  const snapshots: ComparePlayerSnapshot[] = ((players ?? []) as Array<{
    id: string;
    name: string;
    team: string;
    position: string;
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
  }>).map((player) => {
    const windowRow = windowRowByPlayer.get(player.id) ?? emptyWindowStatsRow(player.id, SEASON, "season");
    const playerFixtures = fixturesByTeam.get(player.team) ?? [];
    const next = nextFixtures(player.team, playerFixtures, windowRow.current_gameweek, teamNames, 1)[0];
    const availabilityRaw = Array.isArray(player.fpl_player_data) ? player.fpl_player_data[0] : player.fpl_player_data;

    return {
      id: player.id,
      name: player.name,
      team: player.team,
      teamName: teamNames.get(player.team) ?? player.team,
      position: mapPosition(player.position),
      chanceOfPlaying: availabilityRaw?.chance_of_playing_next_round ?? null,
      availabilityStatus: availabilityRaw?.status ?? null,
      availabilityNews: availabilityRaw?.news ?? null,
      avgPtsPerGame: windowRow.avg_pts_per_game,
      avgPtsPerStart: windowRow.season_avg_pts_per_start,
      ghostPtsPerStart: windowRow.season_avg_ghost_per_start,
      nextOpponent: next ? `${next.opponentName} ${next.isHome ? "(H)" : "(A)"}` : "TBD",
      homePct: windowRow.home_pct,
      awayPct: windowRow.away_pct,
      comparison: {
        seasonPts: windowRow.season_pts,
        avgGw: windowRow.avg_pts_per_gameweek,
        avgStart: windowRow.season_avg_pts_per_start,
        ghostGw: windowRow.avg_ghost_per_gameweek,
        ghostStart: windowRow.season_avg_ghost_per_start,
        goals: windowRow.goals,
        assists: windowRow.assists,
        cleanSheets: windowRow.clean_sheets,
        homeAvg: windowRow.home_avg,
        awayAvg: windowRow.away_avg,
      },
      radarProfiles: radarProfilesByPlayer.get(player.id) ?? {},
    };
  });
  const leagueRoster = user
    ? await getUserLeagueRoster(user.id, profile?.fantrax_league_id ?? null)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">Compare Players</h1>
        <p className="mt-2 text-sm text-brand-dark/70">Side-by-side comparison for season {SEASON}.</p>
      </div>
      <CompareClient players={snapshots} leagueRoster={leagueRoster} season={SEASON} availableSeasons={availableSeasons} />
    </div>
  );
}
