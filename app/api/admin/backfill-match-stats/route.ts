import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { backfillFixtureMatchStats } from "@/lib/bsd/matchStatsBackfill";
import { FIXTURES_SEASON, PRIOR_SEASON } from "@/lib/season/fixtures";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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
  const fixtures = ((fixtureRows ?? []) as FixtureRow[]).filter((fixture) => !alreadyBackfilled.has(fixture.id));

  const summary = { backfilled: 0, not_finished: 0, missing_kickoff: 0, no_bsd_match: 0, error: 0 };
  const errors: Array<{ fixtureId: string; message?: string }> = [];

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
    }
  }

  return NextResponse.json({
    success: true,
    totalFixtures: fixtureRows?.length ?? 0,
    alreadyBackfilled: alreadyBackfilled.size,
    attempted: fixtures.length,
    summary,
    errors,
  });
}
