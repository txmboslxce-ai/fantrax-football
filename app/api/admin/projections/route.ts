import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { computeGameweekProjections } from "@/lib/projections/playerProjection";
import { FIXTURES_SEASON } from "@/lib/season/fixtures";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdminEmail(user.email)) {
    return { ok: false as const };
  }

  return { ok: true as const, supabase };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const gameweek = Number.parseInt(new URL(request.url).searchParams.get("gameweek") ?? "", 10);
  if (!Number.isInteger(gameweek) || gameweek <= 0) {
    return NextResponse.json({ message: "Missing or invalid gameweek" }, { status: 400 });
  }

  const db = createAdminSupabaseClient() ?? auth.supabase;

  const { data, error } = await db
    .from("player_projections")
    .select("player_id, opponent_abbrev, is_home, expected_minutes, projected_score, stat_line, computed_at, players(name, team, position)")
    .eq("season", FIXTURES_SEASON)
    .eq("gameweek", gameweek)
    .order("projected_score", { ascending: false });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ projections: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { gameweek?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const gameweek = body.gameweek;
  if (typeof gameweek !== "number" || !Number.isInteger(gameweek) || gameweek <= 0) {
    return NextResponse.json({ message: "Missing or invalid gameweek" }, { status: 400 });
  }

  const db = createAdminSupabaseClient() ?? auth.supabase;

  let projections: Awaited<ReturnType<typeof computeGameweekProjections>>;
  try {
    projections = await computeGameweekProjections(db, gameweek);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compute projections";
    return NextResponse.json({ message }, { status: 500 });
  }

  if (projections.length === 0) {
    return NextResponse.json({ message: `No fixtures found for gameweek ${gameweek}, or no players have enough history to project.` }, { status: 404 });
  }

  const rows = projections.map((projection) => ({
    player_id: projection.fantraxId,
    fixture_id: projection.fixtureId,
    season: FIXTURES_SEASON,
    gameweek,
    opponent_abbrev: projection.opponentAbbrev,
    is_home: projection.isHome,
    expected_minutes: projection.expectedMinutes,
    projected_score: projection.projectedScore,
    stat_line: projection.statLine,
    computed_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await db.from("player_projections").upsert(rows, { onConflict: "player_id,season,gameweek" });

  if (upsertError) {
    return NextResponse.json({ message: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: rows.length });
}
