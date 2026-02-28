import TeamsClient from "@/app/portal/teams/TeamsClient";
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

type TeamPlayerRow = {
  id: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  seasonPts: number;
  avgGw: number;
  ghostGw: number;
};

type TeamCard = {
  team: string;
  teamName: string;
  totalPoints: number;
  avgPointsPerPlayerPerGame: number;
  topScorer: string;
  topScorerPts: number;
  topGhost: string;
  topGhostGw: number;
  players: TeamPlayerRow[];
};

export default async function TeamsPage() {
  const supabase = await createServerSupabaseClient();

  const [
    {
      data: { user },
    },
    { data: teams, error: teamsError },
    { data: players, error: playersError },
    { data: gameweeks, error: gameweeksError },
    { data: fixtures, error: fixturesError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("teams").select("abbrev, name, full_name").order("full_name"),
    supabase.from("players").select("id, name, team, position").order("name"),
    supabase
      .from("player_gameweeks")
      .select(
        "id, player_id, season, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, clean_sheet, goals_against, saves, key_passes, tackles_won, interceptions, clearances, aerials_won"
      )
      .eq("season", SEASON)
      .gt("games_played", 0),
    supabase.from("fixtures").select("id, season, gameweek, home_team, away_team").eq("season", SEASON),
  ]);

  if (teamsError) {
    throw new Error(`Unable to load teams: ${teamsError.message}`);
  }
  if (playersError) {
    throw new Error(`Unable to load players: ${playersError.message}`);
  }
  if (gameweeksError) {
    throw new Error(`Unable to load player gameweeks: ${gameweeksError.message}`);
  }
  if (fixturesError) {
    throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
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

  const playersByTeam = new Map<string, TeamPlayerRow[]>();
  for (const player of (players ?? []) as PlayerRow[]) {
    const playerRows = (rowsByPlayer.get(player.id) ?? []).sort((a, b) => a.gameweek - b.gameweek);
    const playerFixtures = fixturesByTeam.get(player.team) ?? [];
    const summary = summarizePlayerSeason(decorateGameweeks(playerRows, player.team, playerFixtures));

    if (!playersByTeam.has(player.team)) {
      playersByTeam.set(player.team, []);
    }

    playersByTeam.get(player.team)?.push({
      id: player.id,
      name: player.name,
      position: mapPosition(player.position),
      seasonPts: summary.season_total_pts,
      avgGw: summary.avg_pts_per_gameweek,
      ghostGw: summary.avg_ghost_per_gameweek,
    });
  }

  const teamCards: TeamCard[] = ((teams ?? []) as TeamRow[]).map((team) => {
    const teamPlayers = (playersByTeam.get(team.abbrev) ?? []).sort((a, b) => b.seasonPts - a.seasonPts);
    const totalPoints = teamPlayers.reduce((sum, player) => sum + player.seasonPts, 0);

    const teamPlayerIds = new Set(teamPlayers.map((player) => player.id));
    const totalGames = ((gameweeks ?? []) as PlayerGameweekRow[])
      .filter((row) => teamPlayerIds.has(row.player_id) && Number(row.games_played) > 0)
      .reduce((sum, row) => sum + Number(row.games_played ?? 0), 0);

    const topScorer = teamPlayers[0];
    const topGhost = [...teamPlayers].sort((a, b) => b.ghostGw - a.ghostGw)[0];

    return {
      team: team.abbrev,
      teamName: teamNames.get(team.abbrev) ?? team.abbrev,
      totalPoints,
      avgPointsPerPlayerPerGame: totalGames > 0 ? totalPoints / totalGames : 0,
      topScorer: topScorer?.name ?? "-",
      topScorerPts: topScorer?.seasonPts ?? 0,
      topGhost: topGhost?.name ?? "-",
      topGhostGw: topGhost?.ghostGw ?? 0,
      players: teamPlayers,
    };
  });

  return (
    <PremiumGate isPremium={isPremiumUserEmail(user?.email)}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Team Stats</h1>
          <p className="mt-2 text-sm text-brand-creamDark">Club-level season {SEASON} summary and top contributors.</p>
        </div>
        <TeamsClient teamCards={teamCards} />
      </div>
    </PremiumGate>
  );
}
