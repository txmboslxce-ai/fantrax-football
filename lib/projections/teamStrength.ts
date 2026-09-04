import type { SupabaseClient } from "@supabase/supabase-js";
import { FIXTURES_SEASON, PRIOR_SEASON } from "@/lib/season/fixtures";

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

// Games' worth of prior belief blended into each team's own rate. Early
// season (few real matches) leans heavily on the prior; by ~PRIOR_GAMES
// matches a team's own current-season data carries as much weight as the
// prior does. Deliberately a single flat constant rather than tuned per
// stat for this first version -- revisit once there's enough of a season
// to check calibration against it. That prior is the team's own rate from
// PRIOR_SEASON when they have one -- more informative than the league
// average, and it fades out on its own as the current season accumulates
// -- falling back to the current season's league average only for teams
// with no PRIOR_SEASON row (promoted sides).
const PRIOR_GAMES = 6;

function zeroRecord(): Record<TeamStatKey, number> {
  return Object.fromEntries(TEAM_STAT_KEYS.map((key) => [key, 0])) as Record<TeamStatKey, number>;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

type TeamAccum = { gamesPlayed: number; createdSum: Record<TeamStatKey, number>; concededSum: Record<TeamStatKey, number> };

// Pairs each fixture's two team_match_stats rows and, for every team,
// accumulates both what they produced ("created") and what their opponent
// produced in that same match ("conceded"). Fixtures backfilled with only
// one side's row (shouldn't happen given the backfill job always writes
// both, but defensively checked anyway) are skipped rather than treated as
// a 0 for the missing side, which would otherwise silently understate that
// team's numbers.
function accumulateTeamStats(rows: TeamMatchStatsRow[]): { byTeam: Map<string, TeamAccum>; leagueAvgPerMatch: Record<TeamStatKey, number> } {
  const byFixture = new Map<string, TeamMatchStatsRow[]>();
  for (const row of rows) {
    const list = byFixture.get(row.fixture_id) ?? [];
    list.push(row);
    byFixture.set(row.fixture_id, list);
  }

  const byTeam = new Map<string, TeamAccum>();
  const leagueSum = zeroRecord();
  let leagueTeamMatches = 0;

  function getOrCreateTeam(teamAbbrev: string): TeamAccum {
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

  return { byTeam, leagueAvgPerMatch };
}

export type TeamStrengthResult = {
  profiles: Map<string, TeamStrengthProfile>;
  // Same baseline every factor above is relative to -- exposed so a fixture
  // projection (Phase 4) can turn two teams' factors into an absolute
  // expected-goals-against number, not just a relative multiplier. Always
  // this season's league average, not a blend -- it's meant to reflect the
  // scoring environment teams are actually playing in right now.
  leagueAvgPerMatch: Record<TeamStatKey, number>;
};

export async function computeTeamStrengthRatings(supabase: SupabaseClient): Promise<TeamStrengthResult> {
  const { data, error } = await supabase.from("team_match_stats").select(["fixture_id", "team_abbrev", "is_home", ...TEAM_STAT_KEYS].join(","));

  if (error) {
    throw new Error(`Unable to load team_match_stats: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as TeamMatchStatsRow[];

  const fixtureIds = Array.from(new Set(rows.map((row) => row.fixture_id)));
  const { data: fixtureRows, error: fixtureError } =
    fixtureIds.length === 0 ? { data: [], error: null } : await supabase.from("fixtures").select("id, season").in("id", fixtureIds);

  if (fixtureError) {
    throw new Error(`Unable to load fixtures: ${fixtureError.message}`);
  }

  const seasonByFixtureId = new Map<string, string>();
  for (const fixture of (fixtureRows ?? []) as Array<{ id: string; season: string }>) {
    seasonByFixtureId.set(fixture.id, fixture.season);
  }

  // Not every fixture_id necessarily belongs to FIXTURES_SEASON or
  // PRIOR_SEASON any more now that the backfill can cover both -- read each
  // row's actual season off the fixture rather than assuming.
  const thisSeasonRows = rows.filter((row) => seasonByFixtureId.get(row.fixture_id) === FIXTURES_SEASON);
  const priorSeasonRows = rows.filter((row) => seasonByFixtureId.get(row.fixture_id) === PRIOR_SEASON);

  const thisSeason = accumulateTeamStats(thisSeasonRows);
  const priorSeason = accumulateTeamStats(priorSeasonRows);

  const profiles = new Map<string, TeamStrengthProfile>();
  for (const [teamAbbrev, acc] of thisSeason.byTeam) {
    const createdPerMatch = zeroRecord();
    const createdFactor = zeroRecord();
    const concededPerMatch = zeroRecord();
    const concededFactor = zeroRecord();

    const priorAcc = priorSeason.byTeam.get(teamAbbrev);

    for (const key of TEAM_STAT_KEYS) {
      const leagueAvg = thisSeason.leagueAvgPerMatch[key];
      const priorCreatedMean = priorAcc && priorAcc.gamesPlayed > 0 ? priorAcc.createdSum[key] / priorAcc.gamesPlayed : leagueAvg;
      const priorConcededMean = priorAcc && priorAcc.gamesPlayed > 0 ? priorAcc.concededSum[key] / priorAcc.gamesPlayed : leagueAvg;

      const shrunkCreated = (acc.createdSum[key] + PRIOR_GAMES * priorCreatedMean) / (acc.gamesPlayed + PRIOR_GAMES);
      const shrunkConceded = (acc.concededSum[key] + PRIOR_GAMES * priorConcededMean) / (acc.gamesPlayed + PRIOR_GAMES);
      createdPerMatch[key] = round(shrunkCreated);
      concededPerMatch[key] = round(shrunkConceded);
      createdFactor[key] = leagueAvg > 0 ? round(shrunkCreated / leagueAvg) : 1;
      concededFactor[key] = leagueAvg > 0 ? round(shrunkConceded / leagueAvg) : 1;
    }

    profiles.set(teamAbbrev, { teamAbbrev, gamesPlayed: acc.gamesPlayed, createdPerMatch, createdFactor, concededPerMatch, concededFactor });
  }

  return { profiles, leagueAvgPerMatch: thisSeason.leagueAvgPerMatch };
}
