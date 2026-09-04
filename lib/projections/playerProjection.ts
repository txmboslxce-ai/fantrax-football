import type { SupabaseClient } from "@supabase/supabase-js";
import { calcGoalsAgainstPts, calcKeeperPts, calcOutfielderPts } from "@/lib/csv/transform";
import { computePlayerShotProfiles, type PlayerShotProfile } from "@/lib/projections/playerShotProfile";
import { computeTeamStrengthRatings, type TeamStatKey, type TeamStrengthProfile } from "@/lib/projections/teamStrength";
import { FIXTURES_SEASON } from "@/lib/season/fixtures";

export type ProjectedStatLine = {
  goals: number;
  assists: number;
  // Expected value (0-1), not a realized 0/1 -- calcOutfielderPts/
  // calcKeeperPts just multiply this by a fixed weight, so a probability
  // plugs in as the correct expected-points contribution with no changes
  // to those functions needed.
  clean_sheet: number;
  key_passes: number;
  shots_on_target: number;
  tackles_won: number;
  interceptions: number;
  clearances: number;
  dribbles_succeeded: number;
  blocked_shots: number;
  accurate_crosses: number;
  penalties_drawn: number;
  aerials_won: number;
  dispossessed: number;
  yellow_cards: number;
  red_cards: number;
  penalties_missed: number;
  own_goals: number;
  saves: number;
  penalty_saves: number;
  high_claims: number;
  smothers: number;
  // Expected goals this player's own team concedes in this fixture (a
  // Poisson mean, not a projected input to the scoring formula directly --
  // see expectedGoalsAgainstPenalty below for why).
  expected_goals_against_team: number;
};

export type PlayerProjection = {
  fantraxId: string;
  playerName: string;
  team: string;
  position: "G" | "D" | "M" | "F";
  fixtureId: string;
  opponentAbbrev: string;
  isHome: boolean;
  expectedMinutes: number;
  statLine: ProjectedStatLine;
  projectedScore: number;
};

type PlayerRow = { id: string; name: string; team: string; position: "G" | "D" | "M" | "F" };
type FixtureRow = { id: string; home_team: string; away_team: string };

type HistoryTotals = {
  gamesPlayed: number;
  minutes: number;
  goals: number;
  assists: number;
  keyPasses: number;
  shotsOnTarget: number;
  tacklesWon: number;
  interceptions: number;
  clearances: number;
  dribblesSucceeded: number;
  blockedShots: number;
  accurateCrosses: number;
  penaltiesDrawn: number;
  penaltiesMissed: number;
  aerialsWon: number;
  dispossessed: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  saves: number;
  penaltySaves: number;
  highClaims: number;
  smothers: number;
  goalsAgainst: number;
  goalsAgainstOutfield: number;
};

type PlayerGameweekRow = {
  player_id: string;
  games_played: number | null;
  minutes_played: number | null;
  goals: number | null;
  assists: number | null;
  key_passes: number | null;
  shots_on_target: number | null;
  tackles_won: number | null;
  interceptions: number | null;
  clearances: number | null;
  dribbles_succeeded: number | null;
  blocked_shots: number | null;
  accurate_crosses: number | null;
  penalties_drawn: number | null;
  penalties_missed: number | null;
  aerials_won: number | null;
  dispossessed: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  own_goals: number | null;
  saves: number | null;
  penalty_saves: number | null;
  high_claims: number | null;
  smothers: number | null;
  goals_against: number | null;
  goals_against_outfield: number | null;
};

function zeroHistory(): HistoryTotals {
  return {
    gamesPlayed: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    keyPasses: 0,
    shotsOnTarget: 0,
    tacklesWon: 0,
    interceptions: 0,
    clearances: 0,
    dribblesSucceeded: 0,
    blockedShots: 0,
    accurateCrosses: 0,
    penaltiesDrawn: 0,
    penaltiesMissed: 0,
    aerialsWon: 0,
    dispossessed: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    saves: 0,
    penaltySaves: 0,
    highClaims: 0,
    smothers: 0,
    goalsAgainst: 0,
    goalsAgainstOutfield: 0,
  };
}

function num(value: number | null): number {
  return value ?? 0;
}

// A handful of the ~20 scoring categories get a defensible opponent
// adjustment from team_match_stats (see the opponentFactor(...) calls
// below: shots on target, key passes via big chances conceded, crosses via
// box touches conceded, assists via expected goals conceded); the rest
// (dribbles, aerials, dispossessed, cards, penalties) are small/rare-event
// stats where a team-level BSD signal would be noise dressed up as
// precision, so they're projected from the player's own history only
// (no factor applied). Documented here rather than silently applied so the
// gap is visible, not hidden.

function poissonPmf(k: number, lambda: number): number {
  let logPmf = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logPmf -= Math.log(i);
  return Math.exp(logPmf);
}

// E[calcGoalsAgainstPts(goals conceded)] under a Poisson(lambda) model,
// computed by summing over the actual outcome distribution rather than
// plugging the mean into the (nonlinear -- no penalty for 0 or 1, then -2
// per goal beyond that) formula directly. The two aren't the same number:
// naively substituting the mean understates the true expected penalty,
// since bad blowout-loss scenarios contribute a disproportionate share of
// it. Truncated at 12 goals; the Poisson tail beyond that is negligible
// for any realistic single-match lambda.
function expectedGoalsAgainstPenalty(lambda: number): number {
  let expected = 0;
  for (let goals = 0; goals <= 12; goals++) {
    expected += poissonPmf(goals, lambda) * calcGoalsAgainstPts(goals);
  }
  return expected;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function computeGameweekProjections(supabase: SupabaseClient, gameweek: number): Promise<PlayerProjection[]> {
  const { data: fixtureRows, error: fixtureError } = await supabase
    .from("fixtures")
    .select("id, home_team, away_team")
    .eq("season", FIXTURES_SEASON)
    .eq("gameweek", gameweek);

  if (fixtureError) {
    throw new Error(`Unable to load fixtures: ${fixtureError.message}`);
  }

  const fixtures = (fixtureRows ?? []) as FixtureRow[];
  if (fixtures.length === 0) {
    return [];
  }

  const teamAbbrevs = Array.from(new Set(fixtures.flatMap((fixture) => [fixture.home_team, fixture.away_team])));

  const [{ profiles: teamStrength, leagueAvgPerMatch }, { profiles: shotProfiles }, { data: playerRows, error: playerError }] = await Promise.all([
    computeTeamStrengthRatings(supabase),
    computePlayerShotProfiles(supabase),
    supabase.from("players").select("id, name, team, position").in("team", teamAbbrevs),
  ]);

  if (playerError) {
    throw new Error(`Unable to load players: ${playerError.message}`);
  }

  const players = (playerRows ?? []) as PlayerRow[];
  const playerIds = players.map((player) => player.id);

  const { data: pgRows, error: pgError } =
    playerIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("player_gameweeks")
          .select(
            "player_id, games_played, minutes_played, goals, assists, key_passes, shots_on_target, tackles_won, interceptions, clearances, dribbles_succeeded, blocked_shots, accurate_crosses, penalties_drawn, penalties_missed, aerials_won, dispossessed, yellow_cards, red_cards, own_goals, saves, penalty_saves, high_claims, smothers, goals_against, goals_against_outfield"
          )
          .eq("season", FIXTURES_SEASON)
          .lt("gameweek", gameweek)
          .in("player_id", playerIds);

  if (pgError) {
    throw new Error(`Unable to load player_gameweeks: ${pgError.message}`);
  }

  const historyByPlayer = new Map<string, HistoryTotals>();
  for (const row of (pgRows ?? []) as PlayerGameweekRow[]) {
    if (num(row.games_played) <= 0) continue;

    let totals = historyByPlayer.get(row.player_id);
    if (!totals) {
      totals = zeroHistory();
      historyByPlayer.set(row.player_id, totals);
    }

    totals.gamesPlayed += 1;
    totals.minutes += num(row.minutes_played);
    totals.goals += num(row.goals);
    totals.assists += num(row.assists);
    totals.keyPasses += num(row.key_passes);
    totals.shotsOnTarget += num(row.shots_on_target);
    totals.tacklesWon += num(row.tackles_won);
    totals.interceptions += num(row.interceptions);
    totals.clearances += num(row.clearances);
    totals.dribblesSucceeded += num(row.dribbles_succeeded);
    totals.blockedShots += num(row.blocked_shots);
    totals.accurateCrosses += num(row.accurate_crosses);
    totals.penaltiesDrawn += num(row.penalties_drawn);
    totals.penaltiesMissed += num(row.penalties_missed);
    totals.aerialsWon += num(row.aerials_won);
    totals.dispossessed += num(row.dispossessed);
    totals.yellowCards += num(row.yellow_cards);
    totals.redCards += num(row.red_cards);
    totals.ownGoals += num(row.own_goals);
    totals.saves += num(row.saves);
    totals.penaltySaves += num(row.penalty_saves);
    totals.highClaims += num(row.high_claims);
    totals.smothers += num(row.smothers);
    totals.goalsAgainst += num(row.goals_against);
    totals.goalsAgainstOutfield += num(row.goals_against_outfield);
  }

  const shotProfileByFantraxId = new Map<string, PlayerShotProfile>();
  for (const profile of shotProfiles) {
    shotProfileByFantraxId.set(profile.fantraxId, profile);
  }

  function opponentFactor(team: TeamStrengthProfile | undefined, key: TeamStatKey): number {
    return team?.concededFactor[key] ?? 1;
  }
  function attackFactor(team: TeamStrengthProfile | undefined, key: TeamStatKey): number {
    return team?.createdFactor[key] ?? 1;
  }

  const projections: PlayerProjection[] = [];

  for (const fixture of fixtures) {
    for (const [teamAbbrev, opponentAbbrev, isHome] of [
      [fixture.home_team, fixture.away_team, true],
      [fixture.away_team, fixture.home_team, false],
    ] as const) {
      const ownTeamStrength = teamStrength.get(teamAbbrev);
      const opponentStrength = teamStrength.get(opponentAbbrev);

      const expectedGoalsAgainstTeam =
        leagueAvgPerMatch.expected_goals * opponentFactor(ownTeamStrength, "expected_goals") * attackFactor(opponentStrength, "expected_goals");
      const cleanSheetProbability = Math.exp(-expectedGoalsAgainstTeam);
      const goalsAgainstPenalty = expectedGoalsAgainstPenalty(expectedGoalsAgainstTeam);

      for (const player of players.filter((p) => p.team === teamAbbrev)) {
        const history = historyByPlayer.get(player.id);
        if (!history || history.gamesPlayed === 0 || history.minutes === 0) continue;

        const expectedMinutes = history.minutes / history.gamesPlayed;
        const minutesScale = expectedMinutes / 90;
        const per90 = 90 / history.minutes;

        const shotProfile = shotProfileByFantraxId.get(player.id);
        const goalsRatePer90 = shotProfile ? shotProfile.projectedGoalRatePer90 : history.goals * per90;
        const shotsOnTargetRatePer90 = shotProfile ? shotProfile.totalShotsOnTarget * per90 : history.shotsOnTarget * per90;

        const projectedGoals = goalsRatePer90 * opponentFactor(opponentStrength, "expected_goals") * minutesScale;
        const projectedShotsOnTarget = shotsOnTargetRatePer90 * opponentFactor(opponentStrength, "shots_on_target") * minutesScale;
        const projectedKeyPasses = history.keyPasses * per90 * opponentFactor(opponentStrength, "big_chances") * minutesScale;
        const projectedCrosses = history.accurateCrosses * per90 * opponentFactor(opponentStrength, "touches_in_penalty_area") * minutesScale;
        const projectedAssists = history.assists * per90 * opponentFactor(opponentStrength, "expected_goals") * minutesScale;

        // No defensible opponent signal for these (see OPPONENT_FACTOR_KEY
        // comment) -- projected from the player's own rate only.
        const projectedTacklesWon = history.tacklesWon * per90 * minutesScale;
        const projectedInterceptions = history.interceptions * per90 * minutesScale;
        const projectedClearances = history.clearances * per90 * minutesScale;
        const projectedDribbles = history.dribblesSucceeded * per90 * minutesScale;
        const projectedBlockedShots = history.blockedShots * per90 * minutesScale;
        const projectedPenaltiesDrawn = history.penaltiesDrawn * per90 * minutesScale;
        const projectedPenaltiesMissed = history.penaltiesMissed * per90 * minutesScale;
        const projectedAerials = history.aerialsWon * per90 * minutesScale;
        const projectedDispossessed = history.dispossessed * per90 * minutesScale;
        const projectedYellows = history.yellowCards * per90 * minutesScale;
        const projectedReds = history.redCards * per90 * minutesScale;
        const projectedOwnGoals = history.ownGoals * per90 * minutesScale;

        // Shots faced (and so saves) scale with how much the opponent
        // attacks; goals_against/goals_against_outfield use the same
        // Poisson expectation computed once per team above.
        const projectedSaves = history.saves * per90 * attackFactor(opponentStrength, "shots_on_target") * minutesScale;
        const projectedPenaltySaves = history.penaltySaves * per90 * minutesScale;
        const projectedHighClaims = history.highClaims * per90 * minutesScale;
        const projectedSmothers = history.smothers * per90 * minutesScale;

        const statLine: ProjectedStatLine = {
          goals: round(projectedGoals),
          assists: round(projectedAssists),
          clean_sheet: round(cleanSheetProbability),
          key_passes: round(projectedKeyPasses),
          shots_on_target: round(projectedShotsOnTarget),
          tackles_won: round(projectedTacklesWon),
          interceptions: round(projectedInterceptions),
          clearances: round(projectedClearances),
          dribbles_succeeded: round(projectedDribbles),
          blocked_shots: round(projectedBlockedShots),
          accurate_crosses: round(projectedCrosses),
          penalties_drawn: round(projectedPenaltiesDrawn),
          aerials_won: round(projectedAerials),
          dispossessed: round(projectedDispossessed),
          yellow_cards: round(projectedYellows),
          red_cards: round(projectedReds),
          penalties_missed: round(projectedPenaltiesMissed),
          own_goals: round(projectedOwnGoals),
          saves: round(projectedSaves),
          penalty_saves: round(projectedPenaltySaves),
          high_claims: round(projectedHighClaims),
          smothers: round(projectedSmothers),
          expected_goals_against_team: round(expectedGoalsAgainstTeam),
        };

        // goals_against/goals_against_outfield are deliberately passed as 0
        // here -- calcGoalsAgainstPts(0) is 0, so this cleanly removes that
        // one component from the formula's own (mean-based) calculation,
        // and the properly Poisson-averaged value is added back afterward.
        const formulaRow = {
          position: player.position,
          goals: statLine.goals,
          assists: statLine.assists,
          clean_sheet: statLine.clean_sheet,
          key_passes: statLine.key_passes,
          shots_on_target: statLine.shots_on_target,
          tackles_won: statLine.tackles_won,
          interceptions: statLine.interceptions,
          clearances: statLine.clearances,
          dribbles_succeeded: statLine.dribbles_succeeded,
          blocked_shots: statLine.blocked_shots,
          accurate_crosses: statLine.accurate_crosses,
          penalties_drawn: statLine.penalties_drawn,
          aerials_won: statLine.aerials_won,
          dispossessed: statLine.dispossessed,
          yellow_cards: statLine.yellow_cards,
          red_cards: statLine.red_cards,
          penalties_missed: statLine.penalties_missed,
          own_goals: statLine.own_goals,
          goals_against_outfield: 0,
          goals_against: 0,
          saves: statLine.saves,
          penalty_saves: statLine.penalty_saves,
          high_claims: statLine.high_claims,
          smothers: statLine.smothers,
        };

        const baseScore = player.position === "G" ? calcKeeperPts(formulaRow) : calcOutfielderPts(formulaRow);
        const projectedScore = round(baseScore + goalsAgainstPenalty);

        projections.push({
          fantraxId: player.id,
          playerName: player.name,
          team: player.team,
          position: player.position,
          fixtureId: fixture.id,
          opponentAbbrev,
          isHome,
          expectedMinutes: round(expectedMinutes),
          statLine,
          projectedScore,
        });
      }
    }
  }

  projections.sort((a, b) => b.projectedScore - a.projectedScore);
  return projections;
}
