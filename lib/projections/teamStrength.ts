import type { SupabaseClient } from "@supabase/supabase-js";

// Every flat numeric column on team_match_stats (see
// supabase/migrations/045_add_match_stats.sql) that's worth an opponent-
// adjustment factor. Computed generically rather than hand-picking a subset
// -- which stats actually matter for a given target (goals, shots on
// target, etc.) is a Phase 4 modeling decision, not something to bake in
// here.
export const TEAM_STAT_KEYS = [
  "expected_goals",
  "total_shots",
  "shots_on_target",
  "shots_inside_box",
  "shots_outside_box",
  "big_chances",
  "big_chances_scored",
  "big_chances_missed",
  "touches_in_penalty_area",
  "tackles_won",
  "interceptions",
  "clearances",
  "corner_kicks",
  "dispossessed",
  "blocked_shots",
  "ball_possession",
  "pass_accuracy_pct",
  "dangerous_attack_pct",
] as const;

export type TeamStatKey = (typeof TEAM_STAT_KEYS)[number];

export type TeamStrengthProfile = {
  teamAbbrev: string;
  gamesPlayed: number;
  // This team's own output, shrunk toward league average.
  createdPerMatch: Record<TeamStatKey, number>;
  createdFactor: Record<TeamStatKey, number>;
  // What this team's opponents have produced against them, shrunk toward
  // league average -- e.g. concededFactor.expected_goals of 1.3 means this
  // team's defense lets opponents generate 30% more xG than the league
  // average team does.
  concededPerMatch: Record<TeamStatKey, number>;
  concededFactor: Record<TeamStatKey, number>;
};

type TeamMatchStatsRow = {
  fixture_id: string;
  team_abbrev: string;
  is_home: boolean;
} & Record<TeamStatKey, number | null>;

// Games' worth of league-average prior blended into each team's own rate.
// Early season (few real matches) leans heavily on the league average; by
// ~PRIOR_GAMES matches a team's own data carries as much weight as the
// prior does. Deliberately a single flat constant rather than tuned per
// stat for this first version -- revisit once there's enough of a season
// to check calibration against it.
const PRIOR_GAMES = 6;

function zeroRecord(): Record<TeamStatKey, number> {
  return Object.fromEntries(TEAM_STAT_KEYS.map((key) => [key, 0])) as Record<TeamStatKey, number>;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// Pairs each fixture's two team_match_stats rows and, for every team,
// accumulates both what they produced ("created") and what their opponent
// produced in that same match ("conceded"), then shrinks both toward the
// league-wide per-match average before expressing them as a factor (1.0 =
// league average). Fixtures backfilled with only one side's row (shouldn't
// happen given the backfill job always writes both, but defensively
// checked anyway) are skipped rather than treated as a 0 for the missing
// side, which would otherwise silently understate that team's numbers.
export async function computeTeamStrengthRatings(supabase: SupabaseClient): Promise<Map<string, TeamStrengthProfile>> {
  const { data, error } = await supabase.from("team_match_stats").select(["fixture_id", "team_abbrev", "is_home", ...TEAM_STAT_KEYS].join(","));

  if (error) {
    throw new Error(`Unable to load team_match_stats: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as TeamMatchStatsRow[];
  const byFixture = new Map<string, TeamMatchStatsRow[]>();
  for (const row of rows) {
    const list = byFixture.get(row.fixture_id) ?? [];
    list.push(row);
    byFixture.set(row.fixture_id, list);
  }

  type Accum = { gamesPlayed: number; createdSum: Record<TeamStatKey, number>; concededSum: Record<TeamStatKey, number> };
  const byTeam = new Map<string, Accum>();
  const leagueSum = zeroRecord();
  let leagueTeamMatches = 0;

  function getOrCreateTeam(teamAbbrev: string): Accum {
    let acc = byTeam.get(teamAbbrev);
    if (!acc) {
      acc = { gamesPlayed: 0, createdSum: zeroRecord(), concededSum: zeroRecord() };
      byTeam.set(teamAbbrev, acc);
    }
    return acc;
  }

  for (const pair of byFixture.values()) {
    if (pair.length !== 2) continue;
    const [a, b] = pair;

    for (const [own, opponent] of [
      [a, b],
      [b, a],
    ] as const) {
      const acc = getOrCreateTeam(own.team_abbrev);
      acc.gamesPlayed += 1;
      leagueTeamMatches += 1;
      for (const key of TEAM_STAT_KEYS) {
        const ownValue = own[key] ?? 0;
        const opponentValue = opponent[key] ?? 0;
        acc.createdSum[key] += ownValue;
        acc.concededSum[key] += opponentValue;
        leagueSum[key] += ownValue;
      }
    }
  }

  // League-wide "created" and "conceded" per-match totals are the same
  // number in aggregate -- every created stat is someone else's conceded
  // stat -- so this one average is the baseline for both factors below.
  const leagueAvgPerMatch = zeroRecord();
  for (const key of TEAM_STAT_KEYS) {
    leagueAvgPerMatch[key] = leagueTeamMatches > 0 ? leagueSum[key] / leagueTeamMatches : 0;
  }

  const profiles = new Map<string, TeamStrengthProfile>();
  for (const [teamAbbrev, acc] of byTeam) {
    const createdPerMatch = zeroRecord();
    const createdFactor = zeroRecord();
    const concededPerMatch = zeroRecord();
    const concededFactor = zeroRecord();

    for (const key of TEAM_STAT_KEYS) {
      const leagueAvg = leagueAvgPerMatch[key];
      const shrunkCreated = (acc.createdSum[key] + PRIOR_GAMES * leagueAvg) / (acc.gamesPlayed + PRIOR_GAMES);
      const shrunkConceded = (acc.concededSum[key] + PRIOR_GAMES * leagueAvg) / (acc.gamesPlayed + PRIOR_GAMES);
      createdPerMatch[key] = round(shrunkCreated);
      concededPerMatch[key] = round(shrunkConceded);
      createdFactor[key] = leagueAvg > 0 ? round(shrunkCreated / leagueAvg) : 1;
      concededFactor[key] = leagueAvg > 0 ? round(shrunkConceded / leagueAvg) : 1;
    }

    profiles.set(teamAbbrev, { teamAbbrev, gamesPlayed: acc.gamesPlayed, createdPerMatch, createdFactor, concededPerMatch, concededFactor });
  }

  return profiles;
}
