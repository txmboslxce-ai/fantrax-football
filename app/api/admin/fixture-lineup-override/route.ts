import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { findBsdEventId } from "@/lib/bsd/events";
import { fetchBsdMatchLineup, type BsdTeamLineup } from "@/lib/bsd/lineups";
import { getFixtureLineupOverrides } from "@/lib/portal/lineupOverrides";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

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

type FixtureRow = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string | null;
};

async function loadFixtureLineup(db: SupabaseClient, fixtureId: string) {
  const { data: fixture, error } = await db
    .from("fixtures")
    .select("id, home_team, away_team, kickoff_at")
    .eq("id", fixtureId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load fixture: ${error.message}`);
  }
  if (!fixture) {
    return null;
  }

  const fixtureRow = fixture as FixtureRow;
  if (!fixtureRow.kickoff_at) {
    return { fixture: fixtureRow, bsdEventId: null, lineup: null };
  }

  const bsdEventId = await findBsdEventId({
    homeAbbrev: fixtureRow.home_team,
    awayAbbrev: fixtureRow.away_team,
    kickoffAt: fixtureRow.kickoff_at,
  });

  if (!bsdEventId) {
    return { fixture: fixtureRow, bsdEventId: null, lineup: null };
  }

  const lineup = await fetchBsdMatchLineup(bsdEventId);
  return { fixture: fixtureRow, bsdEventId, lineup };
}

function teamPayload(team: BsdTeamLineup) {
  return {
    teamName: team.teamName,
    formation: team.formation,
    starters: team.starters,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const fixtureId = new URL(request.url).searchParams.get("fixtureId");
  if (!fixtureId) {
    return NextResponse.json({ message: "Missing fixtureId" }, { status: 400 });
  }

  const db = createAdminSupabaseClient() ?? auth.supabase;

  try {
    const result = await loadFixtureLineup(db, fixtureId);
    if (!result) {
      return NextResponse.json({ message: "Fixture not found" }, { status: 404 });
    }
    if (!result.lineup?.home || !result.lineup?.away) {
      return NextResponse.json({ message: "BSD lineup isn't available for this fixture yet -- try again closer to kickoff." }, { status: 409 });
    }

    const overrides = await getFixtureLineupOverrides(db, fixtureId);

    return NextResponse.json({
      homeTeamAbbrev: result.fixture.home_team,
      awayTeamAbbrev: result.fixture.away_team,
      home: teamPayload(result.lineup.home),
      away: teamPayload(result.lineup.away),
      overrides,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load fixture lineup";
    return NextResponse.json({ message }, { status: 502 });
  }
}

function parseFormationSlotCount(formation: string): number | null {
  const parts = formation.split("-").map((part) => Number.parseInt(part, 10));
  if (parts.some((size) => !Number.isFinite(size) || size <= 0)) {
    return null;
  }
  return 1 + parts.reduce((sum, size) => sum + size, 0);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { fixtureId?: unknown; isHome?: unknown; formation?: unknown; starterBsdIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const { fixtureId, isHome, formation, starterBsdIds } = body;

  if (
    typeof fixtureId !== "string" ||
    !fixtureId ||
    typeof isHome !== "boolean" ||
    typeof formation !== "string" ||
    !formation ||
    !Array.isArray(starterBsdIds) ||
    starterBsdIds.some((id) => typeof id !== "number" || !Number.isInteger(id))
  ) {
    return NextResponse.json({ message: "Missing or invalid fixtureId/isHome/formation/starterBsdIds" }, { status: 400 });
  }

  const expectedCount = parseFormationSlotCount(formation);
  if (expectedCount === null) {
    return NextResponse.json({ message: `Couldn't parse formation "${formation}" -- expected something like "4-2-3-1"` }, { status: 400 });
  }
  if (starterBsdIds.length !== expectedCount || new Set(starterBsdIds).size !== starterBsdIds.length) {
    return NextResponse.json({ message: `Formation "${formation}" needs ${expectedCount} unique starters, got ${starterBsdIds.length}` }, { status: 400 });
  }

  const db = createAdminSupabaseClient() ?? auth.supabase;

  try {
    const result = await loadFixtureLineup(db, fixtureId);
    if (!result || !result.lineup?.home || !result.lineup?.away) {
      return NextResponse.json({ message: "Fixture or BSD lineup not found" }, { status: 404 });
    }

    const side = isHome ? result.lineup.home : result.lineup.away;
    const validIds = new Set(side.starters.map((player) => player.id));
    const unknownId = starterBsdIds.find((id) => !validIds.has(id));
    if (unknownId !== undefined) {
      return NextResponse.json({ message: `Player id ${unknownId} isn't one of this side's current starters` }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to validate against BSD's lineup";
    return NextResponse.json({ message }, { status: 502 });
  }

  const { error: upsertError } = await db
    .from("fixture_lineup_overrides")
    .upsert({ fixture_id: fixtureId, is_home: isHome, formation, starter_bsd_ids: starterBsdIds, updated_at: new Date().toISOString() }, { onConflict: "fixture_id,is_home" });

  if (upsertError) {
    return NextResponse.json({ message: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const fixtureId = url.searchParams.get("fixtureId");
  const isHomeParam = url.searchParams.get("isHome");
  if (!fixtureId || (isHomeParam !== "true" && isHomeParam !== "false")) {
    return NextResponse.json({ message: "Missing or invalid fixtureId/isHome" }, { status: 400 });
  }

  const db = createAdminSupabaseClient() ?? auth.supabase;
  const { error } = await db
    .from("fixture_lineup_overrides")
    .delete()
    .eq("fixture_id", fixtureId)
    .eq("is_home", isHomeParam === "true");

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
