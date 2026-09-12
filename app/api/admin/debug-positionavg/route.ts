import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin";
import { FIXTURES_SEASON, PRIOR_SEASON } from "@/lib/season/fixtures";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";

// Temporary diagnostic: playerProjection.ts's positionAvgPer90 (the
// fallback shrunkPer90 blends toward whenever a player's own prior-season
// sample isn't trusted) is built only from this season's history, the same
// shape of assumption that turned out fine for the shot-profile file's
// xG-based baseline but hasn't been checked for the counting-stat
// categories -- confirmed live, aerials_won's prior-season pattern (two
// freak-heavy games) is about to have its MIN_SAMPLE_MINUTES raised the
// same way, which means far more players will fall through to this
// fallback than do today. Before raising that bar, this reports the
// fallback baseline computed both ways (this-season-only, as it runs
// today, vs. pooled with a full prior season) for every position/stat, so
// a bad baseline doesn't get discovered the hard way again. Remove once
// resolved.
const STAT_KEYS = [
  "goals",
  "assists",
  "key_passes",
  "shots_on_target",
  "tackles_won",
  "interceptions",
  "clearances",
  "dribbles_succeeded",
  "blocked_shots",
  "accurate_crosses",
  "penalties_drawn",
  "penalties_missed",
  "aerials_won",
  "dispossessed",
  "yellow_cards",
  "red_cards",
  "own_goals",
  "saves",
  "penalty_saves",
  "high_claims",
  "smothers",
] as const;

type PlayerGameweekRow = { player_id: string; games_played: number | null; minutes_played: number | null } & {
  [K in (typeof STAT_KEYS)[number]]: number | null;
};

type PlayerRow = { id: string; position: string };

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdminEmail(user.email)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const gameweek = Number.parseInt(new URL(request.url).searchParams.get("gameweek") ?? "", 10);
  if (!Number.isInteger(gameweek) || gameweek <= 0) {
    return NextResponse.json({ message: "Missing or invalid ?gameweek=" }, { status: 400 });
  }

  const db = createAdminSupabaseClient() ?? supabase;
  const columns = ["player_id", "games_played", "minutes_played", ...STAT_KEYS].join(", ");

  const [thisSeasonRows, priorSeasonRows, { data: playerRows, error: playerError }] = await Promise.all([
    fetchAllRows<PlayerGameweekRow>(
      (from, to) =>
        db.from("player_gameweeks").select(columns).eq("season", FIXTURES_SEASON).lt("gameweek", gameweek).range(from, to) as unknown as PromiseLike<{
          data: PlayerGameweekRow[] | null;
          error: PostgrestError | null;
        }>
    ),
    fetchAllRows<PlayerGameweekRow>(
      (from, to) =>
        db.from("player_gameweeks").select(columns).eq("season", PRIOR_SEASON).range(from, to) as unknown as PromiseLike<{
          data: PlayerGameweekRow[] | null;
          error: PostgrestError | null;
        }>
    ),
    db.from("players").select("id, position"),
  ]);
  if (playerError) {
    return NextResponse.json({ message: playerError.message }, { status: 500 });
  }
  const positionByPlayerId = new Map<string, string>();
  for (const p of (playerRows ?? []) as PlayerRow[]) positionByPlayerId.set(p.id, p.position);

  function accumulate(rows: PlayerGameweekRow[], minutesByPosition: Record<string, number>, totalsByPosition: Record<string, Record<string, number>>) {
    for (const row of rows) {
      if ((row.games_played ?? 0) <= 0) continue;
      const position = positionByPlayerId.get(row.player_id);
      if (!position) continue;
      minutesByPosition[position] = (minutesByPosition[position] ?? 0) + (row.minutes_played ?? 0);
      const totals = totalsByPosition[position] ?? {};
      for (const key of STAT_KEYS) totals[key] = (totals[key] ?? 0) + (row[key] ?? 0);
      totalsByPosition[position] = totals;
    }
  }

  const thisSeasonOnlyMinutes: Record<string, number> = {};
  const thisSeasonOnlyTotals: Record<string, Record<string, number>> = {};
  accumulate(thisSeasonRows, thisSeasonOnlyMinutes, thisSeasonOnlyTotals);

  const pooledMinutes: Record<string, number> = {};
  const pooledTotals: Record<string, Record<string, number>> = {};
  accumulate(thisSeasonRows, pooledMinutes, pooledTotals);
  accumulate(priorSeasonRows, pooledMinutes, pooledTotals);

  function per90(minutes: Record<string, number>, totals: Record<string, Record<string, number>>, position: string, key: string): number {
    const m = minutes[position] ?? 0;
    return m > 0 ? Math.round(((totals[position]?.[key] ?? 0) / m) * 90 * 1000) / 1000 : 0;
  }

  const positions = ["G", "D", "M", "F"];
  const comparison: Record<string, Record<string, { thisSeasonOnly: number; pooled: number }>> = {};
  for (const position of positions) {
    comparison[position] = {};
    for (const key of STAT_KEYS) {
      comparison[position][key] = {
        thisSeasonOnly: per90(thisSeasonOnlyMinutes, thisSeasonOnlyTotals, position, key),
        pooled: per90(pooledMinutes, pooledTotals, position, key),
      };
    }
  }

  return NextResponse.json({
    gameweek,
    thisSeasonOnlyMinutesByPosition: thisSeasonOnlyMinutes,
    pooledMinutesByPosition: pooledMinutes,
    comparison,
  });
}
