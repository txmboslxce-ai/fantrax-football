import TeamsTableClient from "@/components/portal/TeamsTableClient";
import PremiumGate from "@/components/PremiumGate";
import { isPremiumUser } from "@/lib/premium";
import { SEASON, mapPosition, teamNameMap, type FixtureRow, type TeamRow } from "@/lib/portal/playerMetrics";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type PlayerRow = {
  id: string;
  team: string;
  position: string;
};

type PlayerGameweekRow = {
  player_id: string;
  gameweek: number;
  games_played: number;
  games_started: number;
  raw_fantrax_pts: number | string | null;
};

type PositionKey = "GK" | "DEF" | "MID" | "FWD";

type TeamTableRow = {
  abbrev: string;
  teamName: string;
  scoredTotal: number;
  scoredFwd: number;
  scoredMid: number;
  scoredDef: number;
  scoredGk: number;
  concededTotal: number;
  concededFwd: number;
  concededMid: number;
  concededDef: number;
  concededGk: number;
};

type TeamAccumulator = {
  scoredTotal: number;
  concededTotal: number;
  scoredByPosition: Record<
    PositionKey,
    {
      points: number;
      starts: number;
    }
  >;
  concededByPosition: Record<
    PositionKey,
    {
      points: number;
      starts: number;
    }
  >;
};

function emptyPositionAccumulator(): Record<PositionKey, { points: number; starts: number }> {
  return {
    GK: { points: 0, starts: 0 },
    DEF: { points: 0, starts: 0 },
    MID: { points: 0, starts: 0 },
    FWD: { points: 0, starts: 0 },
  };
}

function avgPerStart(points: number, starts: number): number {
  return starts > 0 ? points / starts : 0;
}

export default async function TeamsPage() {
  const supabase = await createServerSupabaseClient();

  const [
    {
      data: { user },
    },
    { data: teams, error: teamsError },
    { data: players, error: playersError },
    { data: gameweeks, error: gameweeksError },
    { data: fixtures, error: fixturesError }
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("teams").select("abbrev, name, full_name").order("full_name"),
    supabase.from("players").select("id, team, position"),
    supabase.from("player_gameweeks").select("player_id, gameweek, games_played, games_started, raw_fantrax_pts").eq("season", SEASON).gt("games_played", 0),
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
  const playersById = new Map(
    ((players ?? []) as PlayerRow[]).map((player) => [player.id, { team: player.team, position: mapPosition(player.position) }])
  );

  const opponentsByGwAndTeam = new Map<string, Set<string>>();
  for (const fixture of (fixtures ?? []) as FixtureRow[]) {
    const homeKey = `${fixture.gameweek}:${fixture.home_team}`;
    if (!opponentsByGwAndTeam.has(homeKey)) {
      opponentsByGwAndTeam.set(homeKey, new Set());
    }
    opponentsByGwAndTeam.get(homeKey)?.add(fixture.away_team);

    const awayKey = `${fixture.gameweek}:${fixture.away_team}`;
    if (!opponentsByGwAndTeam.has(awayKey)) {
      opponentsByGwAndTeam.set(awayKey, new Set());
    }
    opponentsByGwAndTeam.get(awayKey)?.add(fixture.home_team);
  }

  const statsByTeam = new Map<string, TeamAccumulator>();
  for (const team of (teams ?? []) as TeamRow[]) {
    statsByTeam.set(team.abbrev, {
      scoredTotal: 0,
      concededTotal: 0,
      scoredByPosition: emptyPositionAccumulator(),
      concededByPosition: emptyPositionAccumulator(),
    });
  }

  for (const row of (gameweeks ?? []) as PlayerGameweekRow[]) {
    const player = playersById.get(row.player_id);
    if (!player) {
      continue;
    }
    const points = Number(row.raw_fantrax_pts ?? 0);
    const started = Number(row.games_started ?? 0) >= 1;
    const playerTeamStats = statsByTeam.get(player.team);
    if (!playerTeamStats) {
      continue;
    }

    playerTeamStats.scoredTotal += points;
    if (started) {
      playerTeamStats.scoredByPosition[player.position].points += points;
      playerTeamStats.scoredByPosition[player.position].starts += 1;
    }

    const opponents = opponentsByGwAndTeam.get(`${row.gameweek}:${player.team}`) ?? new Set<string>();
    for (const opponentTeam of opponents) {
      const concededStats = statsByTeam.get(opponentTeam);
      if (!concededStats) {
        continue;
      }

      concededStats.concededTotal += points;
      if (started) {
        concededStats.concededByPosition[player.position].points += points;
        concededStats.concededByPosition[player.position].starts += 1;
      }
    }
  }

  const rows: TeamTableRow[] = ((teams ?? []) as TeamRow[]).map((team) => {
    const stats = statsByTeam.get(team.abbrev);
    return {
      abbrev: team.abbrev,
      teamName: teamNames.get(team.abbrev) ?? team.abbrev,
      scoredTotal: stats?.scoredTotal ?? 0,
      scoredFwd: avgPerStart(stats?.scoredByPosition.FWD.points ?? 0, stats?.scoredByPosition.FWD.starts ?? 0),
      scoredMid: avgPerStart(stats?.scoredByPosition.MID.points ?? 0, stats?.scoredByPosition.MID.starts ?? 0),
      scoredDef: avgPerStart(stats?.scoredByPosition.DEF.points ?? 0, stats?.scoredByPosition.DEF.starts ?? 0),
      scoredGk: avgPerStart(stats?.scoredByPosition.GK.points ?? 0, stats?.scoredByPosition.GK.starts ?? 0),
      concededTotal: stats?.concededTotal ?? 0,
      concededFwd: avgPerStart(stats?.concededByPosition.FWD.points ?? 0, stats?.concededByPosition.FWD.starts ?? 0),
      concededMid: avgPerStart(stats?.concededByPosition.MID.points ?? 0, stats?.concededByPosition.MID.starts ?? 0),
      concededDef: avgPerStart(stats?.concededByPosition.DEF.points ?? 0, stats?.concededByPosition.DEF.starts ?? 0),
      concededGk: avgPerStart(stats?.concededByPosition.GK.points ?? 0, stats?.concededByPosition.GK.starts ?? 0),
    };
  });
  const hasPremiumAccess = await isPremiumUser(user?.id);

  return (
    <PremiumGate isPremium={hasPremiumAccess}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Team Stats</h1>
          <p className="mt-2 text-sm text-brand-creamDark">Club-level season {SEASON} scoring and concession profile.</p>
        </div>
        <TeamsTableClient rows={rows} />
      </div>
    </PremiumGate>
  );
}
