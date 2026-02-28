import StatsTableClient from "@/app/portal/stats/StatsTableClient";
import PremiumGate from "@/components/PremiumGate";
import { isPremiumUserEmail } from "@/lib/premium";
import {
  SEASON,
  decorateGameweeks,
  mapPosition,
  summarizePlayerSeason,
  teamNameMap,
  type FixtureRow,
  type PlayerGameweekRow,
  type PlayerRow,
  type TeamRow,
} from "@/lib/portal/playerMetrics";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type StatsRow = {
  id: string;
  player: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  seasonPts: number;
  avgGw: number;
  ghostGw: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  saves: number;
  tackles: number;
  interceptions: number;
  clearances: number;
  aerials: number;
  keyPasses: number;
  gamesPlayed: number;
};

export default async function StatsPage() {
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

  const statsRows: StatsRow[] = ((players ?? []) as PlayerRow[]).map((player) => {
    const playerRows = (rowsByPlayer.get(player.id) ?? []).sort((a, b) => a.gameweek - b.gameweek);
    const playerFixtures = fixturesByTeam.get(player.team) ?? [];
    const summary = summarizePlayerSeason(decorateGameweeks(playerRows, player.team, playerFixtures));

    return {
      id: player.id,
      player: player.name,
      team: teamNames.get(player.team) ?? player.team,
      position: mapPosition(player.position),
      seasonPts: summary.season_total_pts,
      avgGw: summary.avg_pts_per_game,
      ghostGw: summary.avg_ghost_per_game,
      goals: summary.goals,
      assists: summary.assists,
      cleanSheets: summary.clean_sheets,
      saves: summary.saves,
      tackles: summary.tackles,
      interceptions: summary.interceptions,
      clearances: summary.clearances,
      aerials: summary.aerials,
      keyPasses: summary.key_passes,
      gamesPlayed: summary.games_played,
    };
  });

  return (
    <PremiumGate isPremium={isPremiumUserEmail(user?.email)}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Player Stats</h1>
          <p className="mt-2 text-sm text-brand-creamDark">Filterable and sortable season {SEASON} player output.</p>
        </div>
        <StatsTableClient rows={statsRows} />
      </div>
    </PremiumGate>
  );
}
