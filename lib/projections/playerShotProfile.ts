import type { SupabaseClient } from "@supabase/supabase-js";
import { FIXTURES_SEASON, PRIOR_SEASON } from "@/lib/season/fixtures";

export type PlayerShotProfile = {
  fantraxId: string;
  playerName: string;
  team: string;
  position: string;
  // This-season-only raw totals, for display -- see the per-90 rates below
  // for the (blended with PRIOR_SEASON) numbers projections actually use.
  matchesWithShotData: number;
  minutesPlayed: number;
  totalShots: number;
  totalShotsOnTarget: number;
  totalGoals: number;
  totalAssists: number;
  totalXg: number;
  totalXgot: number;
  // Volume: how often they shoot, and how often it's on target. Blended
  // with the player's own PRIOR_SEASON rate (see PRIOR_MINUTES below) when
  // they have one, so a couple of games this season isn't extrapolated at
  // full weight -- fades toward this-season-only as those minutes add up.
  shotsPer90: number;
  shotsOnTargetPer90: number;
  // Quality: how good the chances they take are, independent of volume.
  xgPerShot: number;
  xgPer90: number;
  xgotPer90: number;
  // Regressed goals-per-xG multiplier (1.0 = finishing exactly as their
  // chance quality predicts). This is the actual "edge" over a model that
  // just extrapolates recent goals: a player scoring well above their xG
  // gets identified as (probably temporarily) overperforming rather than
  // having that hot streak baked straight into their projection. Finishing
  // ability is a comparatively stable trait, so PRIOR_SEASON's goals and xG
  // count in full here rather than fading with a minutes-based decay --
  // more real shot outcomes just makes for a better estimate of the same
  // underlying skill.
  finishingFactor: number;
  // xgPer90 * finishingFactor -- the single number Phase 4 combines with an
  // opponent's defensive factor to project a goal rate for a fixture.
  projectedGoalRatePer90: number;
};

type ShotStatsRow = {
  bsd_player_id: number;
  fixture_id: string;
  shots: number;
  shots_on_target: number;
  goals: number;
  assists: number;
  xg: number;
  xgot: number;
};

type PlayerRow = { id: string; name: string; team: string; position: string; bsd_id: number };
type FixtureRow = { id: string; season: string; gameweek: number };
type PlayerGameweekRow = { player_id: string; gameweek: number; minutes_played: number | null; games_played: number | null };

// Goals are noisy in small samples -- a player's raw goals/xG ratio needs a
// lot of accumulated shot quality behind it before it means anything. This
// blends each player's ratio toward 1.0 (finishing exactly as expected),
// weighted by PRIOR_XG "worth" of prior belief -- roughly a few weeks of a
// regular starter's shot volume. Same style of prior as PRIOR_GAMES in
// teamStrength.ts; a starting value to revisit once there's more of a
// season to check calibration against.
const PRIOR_XG = 8;

// Same idea, in minutes, for the volume rates (shotsPer90/xgPer90/etc):
// weight given to a player's own PRIOR_SEASON per-90 rate, fading out as
// this season's own minutes accumulate past it. See PRIOR_MINUTES in
// playerProjection.ts, which this mirrors.
const PRIOR_MINUTES = 450;

// A per-90 rate computed from a tiny minutes sample is extreme by
// construction -- one shot in a 1-minute injury-time cameo extrapolates to
// dozens of "xG per 90" despite the underlying shot being perfectly
// ordinary. Confirmed live: exactly this, from a PRIOR_SEASON row with only
// a couple of minutes attached, blew a defender's projected goal rate up to
// double digits even after PRIOR_MINUTES-weighting -- the shrinkage weight
// only controls how much the prior counts for, it doesn't cap how extreme
// the prior's own rate can be before that weighting is applied. Below this
// many minutes, a sample isn't trusted as a per-90 rate at all, prior or
// current-season.
const MIN_SAMPLE_MINUTES = 90;

type Accum = {
  player: PlayerRow;
  matches: number;
  minutes: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  assists: number;
  xg: number;
  xgot: number;
};

function aggregateShotRows(
  rows: ShotStatsRow[],
  playerByBsdId: Map<number, PlayerRow>,
  gameweekByFixtureId: Map<string, number>,
  minutesByPlayerGameweek: Map<string, number>
): Map<number, Accum> {
  const byPlayer = new Map<number, Accum>();

  for (const row of rows) {
    const player = playerByBsdId.get(row.bsd_player_id);
    if (!player) continue;

    let acc = byPlayer.get(row.bsd_player_id);
    if (!acc) {
      acc = { player, matches: 0, minutes: 0, shots: 0, shotsOnTarget: 0, goals: 0, assists: 0, xg: 0, xgot: 0 };
      byPlayer.set(row.bsd_player_id, acc);
    }

    const gameweek = gameweekByFixtureId.get(row.fixture_id);
    const minutes = gameweek != null ? (minutesByPlayerGameweek.get(`${player.id}:${gameweek}`) ?? 0) : 0;

    acc.matches += 1;
    acc.minutes += minutes;
    acc.shots += row.shots;
    acc.shotsOnTarget += row.shots_on_target;
    acc.goals += row.goals;
    acc.assists += row.assists;
    acc.xg += row.xg;
    acc.xgot += row.xgot;
  }

  return byPlayer;
}

// Weighted blend of this season's per-90 rate toward the player's own
// PRIOR_SEASON per-90 rate (when they have a trustworthy sample of minutes
// there -- see MIN_SAMPLE_MINUTES), same pattern as shrunkPer90 in
// playerProjection.ts. Falls back to the raw this-season rate, unshrunk,
// for a player with no usable prior-season data (a new signing, someone
// promoted up with their club, or a prior-season sample too thin to trust)
// -- there's no league average baked in here to fall back to further than
// that, and this season's own sample gets the same floor rather than
// extrapolating from a cameo just because there's no prior to compare it
// against.
function blendPer90(thisSeasonTotal: number, thisSeasonMinutes: number, priorSeasonTotal: number, priorSeasonMinutes: number): number {
  if (priorSeasonMinutes < MIN_SAMPLE_MINUTES) {
    return thisSeasonMinutes >= MIN_SAMPLE_MINUTES ? (thisSeasonTotal * 90) / thisSeasonMinutes : 0;
  }
  const priorPer90 = (priorSeasonTotal * 90) / priorSeasonMinutes;
  return (thisSeasonTotal * 90 + PRIOR_MINUTES * priorPer90) / (thisSeasonMinutes + PRIOR_MINUTES);
}

export async function computePlayerShotProfiles(supabase: SupabaseClient): Promise<{ profiles: PlayerShotProfile[]; unmappedBsdPlayerIds: number[] }> {
  const { data: shotRows, error: shotError } = await supabase
    .from("player_match_shot_stats")
    .select("bsd_player_id, fixture_id, shots, shots_on_target, goals, assists, xg, xgot");

  if (shotError) {
    throw new Error(`Unable to load player_match_shot_stats: ${shotError.message}`);
  }

  const rows = (shotRows ?? []) as ShotStatsRow[];
  if (rows.length === 0) {
    return { profiles: [], unmappedBsdPlayerIds: [] };
  }

  const bsdPlayerIds = Array.from(new Set(rows.map((row) => row.bsd_player_id)));
  const fixtureIds = Array.from(new Set(rows.map((row) => row.fixture_id)));

  const [{ data: playerRows, error: playerError }, { data: fixtureRows, error: fixtureError }] = await Promise.all([
    supabase.from("players").select("id, name, team, position, bsd_id").in("bsd_id", bsdPlayerIds),
    // Not filtered to FIXTURES_SEASON -- the backfill can cover both
    // FIXTURES_SEASON and PRIOR_SEASON now, and season is read off each row
    // below to split them apart before aggregating.
    supabase.from("fixtures").select("id, season, gameweek").in("id", fixtureIds),
  ]);

  if (playerError) {
    throw new Error(`Unable to load players: ${playerError.message}`);
  }
  if (fixtureError) {
    throw new Error(`Unable to load fixtures: ${fixtureError.message}`);
  }

  const playerByBsdId = new Map<number, PlayerRow>();
  for (const player of (playerRows ?? []) as PlayerRow[]) {
    playerByBsdId.set(player.bsd_id, player);
  }

  const unmappedBsdPlayerIds = new Set<number>();
  for (const row of rows) {
    if (!playerByBsdId.has(row.bsd_player_id)) unmappedBsdPlayerIds.add(row.bsd_player_id);
  }

  const seasonByFixtureId = new Map<string, string>();
  const gameweekByFixtureId = new Map<string, number>();
  const gameweeksBySeason = new Map<string, Set<number>>();
  for (const fixture of (fixtureRows ?? []) as FixtureRow[]) {
    seasonByFixtureId.set(fixture.id, fixture.season);
    gameweekByFixtureId.set(fixture.id, fixture.gameweek);
    const set = gameweeksBySeason.get(fixture.season) ?? new Set<number>();
    set.add(fixture.gameweek);
    gameweeksBySeason.set(fixture.season, set);
  }

  const thisSeasonRows = rows.filter((row) => seasonByFixtureId.get(row.fixture_id) === FIXTURES_SEASON);
  const priorSeasonRows = rows.filter((row) => seasonByFixtureId.get(row.fixture_id) === PRIOR_SEASON);

  // Not filtered by player_id: that list only grows as more matches get
  // backfilled through the season, and an .in() filter that long risks the
  // same URL-length "Bad Request" hit in the projection engine's own
  // player_gameweeks query (see the comment there) -- filtering by
  // season/gameweek alone and keeping what's needed in memory sidesteps it
  // for a trivial extra row count.
  async function fetchMinutes(season: string): Promise<Map<string, number>> {
    const gameweeks = Array.from(gameweeksBySeason.get(season) ?? []);
    if (gameweeks.length === 0) return new Map();

    const { data, error } = await supabase
      .from("player_gameweeks")
      .select("player_id, gameweek, minutes_played, games_played")
      .eq("season", season)
      .in("gameweek", gameweeks)
      .limit(50000);

    if (error) {
      throw new Error(`Unable to load player_gameweeks (${season}): ${error.message}`);
    }

    const minutesByPlayerGameweek = new Map<string, number>();
    for (const row of (data ?? []) as PlayerGameweekRow[]) {
      if ((row.games_played ?? 0) > 0) {
        minutesByPlayerGameweek.set(`${row.player_id}:${row.gameweek}`, row.minutes_played ?? 0);
      }
    }
    return minutesByPlayerGameweek;
  }

  const [minutesThisSeason, minutesPriorSeason] = await Promise.all([fetchMinutes(FIXTURES_SEASON), fetchMinutes(PRIOR_SEASON)]);

  const byPlayerThisSeason = aggregateShotRows(thisSeasonRows, playerByBsdId, gameweekByFixtureId, minutesThisSeason);
  const byPlayerPriorSeason = aggregateShotRows(priorSeasonRows, playerByBsdId, gameweekByFixtureId, minutesPriorSeason);

  const profiles: PlayerShotProfile[] = [];
  for (const acc of byPlayerThisSeason.values()) {
    const prior = byPlayerPriorSeason.get(acc.player.bsd_id);

    const xgPer90 = blendPer90(acc.xg, acc.minutes, prior?.xg ?? 0, prior?.minutes ?? 0);
    const shotsPer90 = blendPer90(acc.shots, acc.minutes, prior?.shots ?? 0, prior?.minutes ?? 0);
    const shotsOnTargetPer90 = blendPer90(acc.shotsOnTarget, acc.minutes, prior?.shotsOnTarget ?? 0, prior?.minutes ?? 0);
    const xgotPer90 = blendPer90(acc.xgot, acc.minutes, prior?.xgot ?? 0, prior?.minutes ?? 0);

    const combinedGoals = acc.goals + (prior?.goals ?? 0);
    const combinedXg = acc.xg + (prior?.xg ?? 0);
    const finishingFactor = round((combinedGoals + PRIOR_XG) / (combinedXg + PRIOR_XG));

    profiles.push({
      fantraxId: acc.player.id,
      playerName: acc.player.name,
      team: acc.player.team,
      position: acc.player.position,
      matchesWithShotData: acc.matches,
      minutesPlayed: acc.minutes,
      totalShots: acc.shots,
      totalShotsOnTarget: acc.shotsOnTarget,
      totalGoals: acc.goals,
      totalAssists: acc.assists,
      totalXg: round(acc.xg),
      totalXgot: round(acc.xgot),
      shotsPer90: round(shotsPer90),
      shotsOnTargetPer90: round(shotsOnTargetPer90),
      xgPerShot: acc.shots > 0 ? round(acc.xg / acc.shots) : 0,
      xgPer90: round(xgPer90),
      xgotPer90: round(xgotPer90),
      finishingFactor,
      projectedGoalRatePer90: round(xgPer90 * finishingFactor),
    });
  }

  profiles.sort((a, b) => b.totalXg - a.totalXg);

  return { profiles, unmappedBsdPlayerIds: Array.from(unmappedBsdPlayerIds) };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
