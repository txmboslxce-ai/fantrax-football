import type { SupabaseClient } from "@supabase/supabase-js";
import { FIXTURES_SEASON } from "@/lib/season/fixtures";

export type PlayerShotProfile = {
  fantraxId: string;
  playerName: string;
  team: string;
  position: string;
  matchesWithShotData: number;
  minutesPlayed: number;
  totalShots: number;
  totalShotsOnTarget: number;
  totalGoals: number;
  totalAssists: number;
  totalXg: number;
  totalXgot: number;
  // Volume: how often they shoot.
  shotsPer90: number;
  // Quality: how good the chances they take are, independent of volume.
  xgPerShot: number;
  xgPer90: number;
  xgotPer90: number;
  // Regressed goals-per-xG multiplier (1.0 = finishing exactly as their
  // chance quality predicts). This is the actual "edge" over a model that
  // just extrapolates recent goals: a player scoring well above their xG
  // gets identified as (probably temporarily) overperforming rather than
  // having that hot streak baked straight into their projection.
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
type FixtureRow = { id: string; gameweek: number };
type PlayerGameweekRow = { player_id: string; gameweek: number; minutes_played: number | null; games_played: number | null };

// Goals are noisy in small samples -- a player's raw goals/xG ratio needs a
// lot of accumulated shot quality behind it before it means anything. This
// blends each player's ratio toward 1.0 (finishing exactly as expected),
// weighted by PRIOR_XG "worth" of prior belief -- roughly a few weeks of a
// regular starter's shot volume. Same style of prior as PRIOR_GAMES in
// teamStrength.ts; a starting value to revisit once there's more of a
// season to check calibration against.
const PRIOR_XG = 8;

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
    supabase.from("fixtures").select("id, gameweek").eq("season", FIXTURES_SEASON).in("id", fixtureIds),
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

  const gameweekByFixtureId = new Map<string, number>();
  for (const fixture of (fixtureRows ?? []) as FixtureRow[]) {
    gameweekByFixtureId.set(fixture.id, fixture.gameweek);
  }

  const gameweeks = Array.from(new Set(gameweekByFixtureId.values()));

  // Not filtered by player_id: that list only grows as more matches get
  // backfilled through the season, and an .in() filter that long risks the
  // same URL-length "Bad Request" hit in the projection engine's own
  // player_gameweeks query (see the comment there) -- filtering by
  // season/gameweek alone and keeping what's needed in memory sidesteps it
  // for a trivial extra row count.
  const { data: pgRows, error: pgError } =
    gameweeks.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("player_gameweeks")
          .select("player_id, gameweek, minutes_played, games_played")
          .eq("season", FIXTURES_SEASON)
          .in("gameweek", gameweeks)
          .limit(50000);

  if (pgError) {
    throw new Error(`Unable to load player_gameweeks: ${pgError.message}`);
  }

  const minutesByPlayerGameweek = new Map<string, number>();
  for (const row of (pgRows ?? []) as PlayerGameweekRow[]) {
    if ((row.games_played ?? 0) > 0) {
      minutesByPlayerGameweek.set(`${row.player_id}:${row.gameweek}`, row.minutes_played ?? 0);
    }
  }

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

  const byPlayer = new Map<number, Accum>();
  const unmappedBsdPlayerIds = new Set<number>();

  for (const row of rows) {
    const player = playerByBsdId.get(row.bsd_player_id);
    if (!player) {
      unmappedBsdPlayerIds.add(row.bsd_player_id);
      continue;
    }

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

  const profiles: PlayerShotProfile[] = [];
  for (const acc of byPlayer.values()) {
    const per90Scale = acc.minutes > 0 ? 90 / acc.minutes : 0;
    const xgPer90 = acc.xg * per90Scale;
    const finishingFactor = round((acc.goals + PRIOR_XG) / (acc.xg + PRIOR_XG));

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
      shotsPer90: round(acc.shots * per90Scale),
      xgPerShot: acc.shots > 0 ? round(acc.xg / acc.shots) : 0,
      xgPer90: round(xgPer90),
      xgotPer90: round(acc.xgot * per90Scale),
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
