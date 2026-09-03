import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { backfillFixtureMatchStats } from "@/lib/bsd/matchStatsBackfill";
import { FIXTURES_SEASON } from "@/lib/season/fixtures";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type FixtureRow = { id: string; home_team: string; away_team: string; kickoff_at: string | null };

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdminEmail(user.email)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminSupabaseClient() ?? supabase;

  const { data: fixtureRows, error: fixturesError } = await db
    .from("fixtures")
    .select("id, home_team, away_team, kickoff_at")
    .eq("season", FIXTURES_SEASON);

  if (fixturesError) {
    return NextResponse.json({ success: false, message: `Unable to load fixtures: ${fixturesError.message}` }, { status: 500 });
  }

  const { data: alreadyBackfilledRows, error: alreadyBackfilledError } = await db.from("team_match_stats").select("fixture_id");

  if (alreadyBackfilledError) {
    return NextResponse.json({ success: false, message: `Unable to check existing backfill: ${alreadyBackfilledError.message}` }, { status: 500 });
  }

  const alreadyBackfilled = new Set(((alreadyBackfilledRows ?? []) as Array<{ fixture_id: string }>).map((row) => row.fixture_id));
  const fixtures = ((fixtureRows ?? []) as FixtureRow[]).filter((fixture) => !alreadyBackfilled.has(fixture.id));

  const summary = { backfilled: 0, not_finished: 0, no_bsd_match: 0, error: 0 };
  const errors: Array<{ fixtureId: string; message?: string }> = [];

  for (const fixture of fixtures) {
    const result = await backfillFixtureMatchStats(db, {
      id: fixture.id,
      homeAbbrev: fixture.home_team,
      awayAbbrev: fixture.away_team,
      kickoffAt: fixture.kickoff_at,
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
