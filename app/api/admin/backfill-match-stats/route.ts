import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { backfillFixtureMatchStats } from "@/lib/bsd/matchStatsBackfill";
import { FIXTURES_SEASON, PRIOR_SEASON } from "@/lib/season/fixtures";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// A force re-backfill of a full season is ~380 fixtures, each needing its
// own BSD round-trip (event search, stats, incidents) -- comfortably past
// any serverless function's execution limit as one request (confirmed
// live: the client's fetch was killed mid-request with no response at all,
// not a clean error). Processed in bounded batches instead (see
// BATCH_SIZE/offset below) so no single request's duration depends on how
// large the season or the force flag makes the job; this ceiling is just a
// safety margin on top of that, not what actually keeps requests fast.
export const maxDuration = 300;

const BATCH_SIZE = 40;

type FixtureRow = { id: string; home_team: string; away_team: string; kickoff_at: string | null };

// Backfilling PRIOR_SEASON is what lets the projection engine use a
// player's/team's own established rate from last season as a prior instead
// of a generic league/position average -- see playerShotProfile.ts and
// teamStrength.ts. Restricted to these two rather than an arbitrary string
// since backfillFixtureMatchStats resolves BSD events by date, which only
// makes sense for a season this app actually has fixtures (with kickoffs)
// for.
const BACKFILLABLE_SEASONS = [FIXTURES_SEASON, PRIOR_SEASON];

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdminEmail(user.email)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const season = typeof body?.season === "string" && body.season ? body.season : FIXTURES_SEASON;
  const force = body?.force === true;
  const offset = Number.isInteger(body?.offset) && body.offset >= 0 ? body.offset : 0;

  if (!BACKFILLABLE_SEASONS.includes(season)) {
    return NextResponse.json({ success: false, message: `Unsupported season '${season}'` }, { status: 400 });
  }

  const db = createAdminSupabaseClient() ?? supabase;

  const { data: fixtureRows, error: fixturesError } = await db
    .from("fixtures")
    .select("id, home_team, away_team, kickoff_at")
    .eq("season", season);

  if (fixturesError) {
    return NextResponse.json({ success: false, message: `Unable to load fixtures: ${fixturesError.message}` }, { status: 500 });
  }

  const { data: alreadyBackfilledRows, error: alreadyBackfilledError } = await db.from("team_match_stats").select("fixture_id");

  if (alreadyBackfilledError) {
    return NextResponse.json({ success: false, message: `Unable to check existing backfill: ${alreadyBackfilledError.message}` }, { status: 500 });
  }

  const alreadyBackfilled = new Set(((alreadyBackfilledRows ?? []) as Array<{ fixture_id: string }>).map((row) => row.fixture_id));
  // force re-processes every fixture regardless of alreadyBackfilled --
  // both writes are upserts keyed on (fixture_id, ...), so this is just
  // overwriting with freshly recomputed values (needed after a
  // data-quality fix like the out-of-range xg guard in
  // matchStatsBackfill.ts, since the bad values are already persisted from
  // the first run and won't self-correct otherwise).
  const allFixtures = (fixtureRows ?? []) as FixtureRow[];
  // force re-processes every fixture regardless of alreadyBackfilled --
  // both writes are upserts keyed on (fixture_id, ...), so this is just
  // overwriting with freshly recomputed values (needed after a
  // data-quality fix like the out-of-range xg guard in
  // matchStatsBackfill.ts, since the bad values are already persisted from
  // the first run and won't self-correct otherwise).
  const toAttempt = force ? allFixtures : allFixtures.filter((fixture) => !alreadyBackfilled.has(fixture.id));
  const fixtures = toAttempt.slice(offset, offset + BATCH_SIZE);

  const summary = { backfilled: 0, not_finished: 0, missing_kickoff: 0, no_bsd_match: 0, error: 0 };
  const errors: Array<{ fixtureId: string; message?: string }> = [];
  // Distinct non-error messages (missing_kickoff/no_bsd_match), counted --
  // there are only ever a handful of these in practice (one per unmapped
  // team, say), so a count per message is far more useful than a
  // fixture-by-fixture dump of the same reason repeated over a third of a
  // season's worth of rows.
  const noteCounts = new Map<string, number>();

  for (const fixture of fixtures) {
    const result = await backfillFixtureMatchStats(db, {
      id: fixture.id,
      homeAbbrev: fixture.home_team,
      awayAbbrev: fixture.away_team,
      kickoffAt: fixture.kickoff_at,
      season,
    });
    summary[result.status] += 1;
    if (result.status === "error") {
      errors.push({ fixtureId: result.fixtureId, message: result.message });
    } else if (result.message) {
      noteCounts.set(result.message, (noteCounts.get(result.message) ?? 0) + 1);
    }
  }

  const notes = Array.from(noteCounts.entries())
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count);

  const nextOffset = offset + fixtures.length < toAttempt.length ? offset + fixtures.length : null;

  return NextResponse.json({
    success: true,
    totalFixtures: fixtureRows?.length ?? 0,
    alreadyBackfilled: alreadyBackfilled.size,
    totalToAttempt: toAttempt.length,
    attempted: fixtures.length,
    nextOffset,
    summary,
    notes,
    errors,
  });
}
