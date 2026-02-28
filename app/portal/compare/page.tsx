import PremiumGate from "@/components/PremiumGate";
import CompareClient from "@/app/portal/compare/CompareClient";
import { isPremiumUserEmail } from "@/lib/premium";
import {
  SEASON,
  decorateGameweeks,
  mapPosition,
  nextFixtures,
  summarizePlayerSeason,
  teamNameMap,
  type FixtureRow,
  type PlayerGameweekRow,
  type PlayerRow,
  type TeamRow,
} from "@/lib/portal/playerMetrics";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type ComparePlayerSnapshot = {
  id: string;
  name: string;
  team: string;
  teamName: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  avgPtsPerGame: number;
  avgPtsPerStart: number;
  ghostPtsPerStart: number;
  nextOpponent: string;
  homePct: number;
  awayPct: number;
  last5: Array<{ gameweek: number; points: number }>;
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
};

export default async function ComparePage() {
  const supabase = await createServerSupabaseClient();

  const [
    {
      data: { user },
    },
    { data: players, error: playersError },
    { data: gameweeks, error: gameweeksError },
    { data: fixtures, error: fixturesError },
    { data: teams, error: teamsError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("players").select("id, name, team, position").order("name"),
    supabase
      .from("player_gameweeks")
      .select(
        "id, player_id, season, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, clean_sheet, goals_against, saves, key_passes, tackles_won, interceptions, clearances, aerials_won"
      )
      .eq("season", SEASON),
    supabase.from("fixtures").select("id, season, gameweek, home_team, away_team").eq("season", SEASON),
    supabase.from("teams").select("abbrev, name, full_name"),
  ]);

  if (playersError) {
    throw new Error(`Unable to load players: ${playersError.message}`);
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

  const rowsByPlayer = new Map<string, PlayerGameweekRow[]>();
  for (const row of (gameweeks ?? []) as PlayerGameweekRow[]) {
    if (!rowsByPlayer.has(row.player_id)) {
      rowsByPlayer.set(row.player_id, []);
    }
    rowsByPlayer.get(row.player_id)?.push(row);
  }

  const snapshots: ComparePlayerSnapshot[] = ((players ?? []) as PlayerRow[]).map((player) => {
    const playerRows = (rowsByPlayer.get(player.id) ?? []).sort((a, b) => a.gameweek - b.gameweek);
    const playerFixtures = fixturesByTeam.get(player.team) ?? [];
    const decorated = decorateGameweeks(playerRows, player.team, playerFixtures);
    const summary = summarizePlayerSeason(decorated);
    const last5 = decorated
      .filter((row) => row.games_played === 1)
      .slice(-5)
      .map((row) => ({ gameweek: row.gameweek, points: row.raw_fantrax_pts }));

    const next = nextFixtures(player.team, playerFixtures, summary.current_gameweek, teamNames, 1)[0];

    return {
      id: player.id,
      name: player.name,
      team: player.team,
      teamName: teamNames.get(player.team) ?? player.team,
      position: mapPosition(player.position),
      avgPtsPerGame: summary.avg_pts_per_game,
      avgPtsPerStart: summary.avg_pts_per_start,
      ghostPtsPerStart: summary.avg_ghost_per_start,
      nextOpponent: next ? `${next.opponentName} ${next.isHome ? "(H)" : "(A)"}` : "TBD",
      homePct: summary.home_pct,
      awayPct: summary.away_pct,
      last5,
      comparison: {
        seasonPts: summary.season_total_pts,
        avgGw: summary.avg_pts_per_game,
        avgStart: summary.avg_pts_per_start,
        ghostGw: summary.avg_ghost_per_game,
        ghostStart: summary.avg_ghost_per_start,
        goals: summary.goals,
        assists: summary.assists,
        cleanSheets: summary.clean_sheets,
        homeAvg: summary.home_avg,
        awayAvg: summary.away_avg,
      },
    };
  });

  return (
    <PremiumGate isPremium={isPremiumUserEmail(user?.email)}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Compare Players</h1>
          <p className="mt-2 text-sm text-brand-creamDark">Side-by-side premium comparison for season {SEASON}.</p>
        </div>
        <CompareClient players={snapshots} />
      </div>
    </PremiumGate>
  );
}
