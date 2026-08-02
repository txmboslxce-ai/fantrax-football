import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { FPL_ID_TO_ABBREV } from "@/lib/fpl/sync";
import { getCurrentSeason } from "@/lib/season/current";

const FPL_BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/";

const POSITION_LABELS: Record<number, string> = {
  1: "GKP",
  2: "DEF",
  3: "MID",
  4: "FWD",
};

type FplElement = {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  element_type: number;
  status: string;
  chance_of_playing_next_round: number | null;
  news: string;
  news_added: string;
  expected_goals_per_90: string | null;
  expected_assists_per_90: string | null;
  clean_sheets_per_90: string | null;
  expected_goals_conceded_per_90: string | null;
  saves_per_90: string | null;
  penalties_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
  direct_freekicks_order: number | null;
  starts_per_90: string | null;
};

type FplBootstrapResponse = {
  elements: FplElement[];
};

type PlayerRow = {
  id: string;
  name: string;
  team: string;
  position: string;
  fpl_id: number | null;
};

type FplPlayerDataInsert = {
  player_id: string;
  fpl_id: number;
  season: string;
  status: string | null;
  chance_of_playing_next_round: number | null;
  news: string | null;
  news_added: string | null;
  expected_goals_per_90: number | null;
  expected_assists_per_90: number | null;
  clean_sheets_per_90: number | null;
  expected_goals_conceded_per_90: number | null;
  saves_per_90: number | null;
  penalties_order: number | null;
  corners_order: number | null;
  direct_freekicks_order: number | null;
  starts_per_90: number | null;
  synced_at: string;
  last_synced_at: string;
};

function toNullableText(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function parseNullableNumber(value: string | number | null | undefined): number | null {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let bootstrap: FplBootstrapResponse;
  try {
    const response = await fetch(FPL_BOOTSTRAP_URL, { method: "GET", cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ message: `FPL API unavailable (${response.status})` }, { status: 502 });
    }
    bootstrap = (await response.json()) as FplBootstrapResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach FPL API";
    return NextResponse.json({ message }, { status: 502 });
  }

  const db = createAdminSupabaseClient() ?? auth.supabase;
  const { data: playersData, error: playersError } = await db
    .from("players")
    .select("id, name, team, position, fpl_id");

  if (playersError) {
    return NextResponse.json({ message: playersError.message }, { status: 500 });
  }

  const players = (playersData ?? []) as PlayerRow[];
  const mappedFplIds = new Set(players.filter((p) => p.fpl_id != null).map((p) => p.fpl_id as number));

  const unmappedFplPlayers = (bootstrap.elements ?? [])
    .filter((element) => !mappedFplIds.has(element.id) && POSITION_LABELS[element.element_type])
    .map((element) => ({
      fplId: element.id,
      name: `${element.first_name} ${element.second_name}`.trim(),
      webName: element.web_name,
      team: FPL_ID_TO_ABBREV[element.team] ?? null,
      position: POSITION_LABELS[element.element_type],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const unmappedPlayers = players
    .filter((p) => p.fpl_id == null)
    .map((p) => ({ id: p.id, name: p.name, team: p.team, position: p.position }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ unmappedFplPlayers, unmappedPlayers });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { playerId?: unknown; fplId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const playerId = body.playerId;
  const fplId = body.fplId;

  if (typeof playerId !== "string" || !playerId || typeof fplId !== "number" || !Number.isInteger(fplId)) {
    return NextResponse.json({ message: "Missing or invalid playerId/fplId" }, { status: 400 });
  }

  const db = createAdminSupabaseClient() ?? auth.supabase;

  // Guard against creating a duplicate mapping even before the DB-level
  // unique index (migration 016) is applied.
  const { data: existingForFplId, error: existingError } = await db
    .from("players")
    .select("id, name")
    .eq("fpl_id", fplId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ message: existingError.message }, { status: 500 });
  }

  if (existingForFplId) {
    return NextResponse.json(
      { message: `fpl_id ${fplId} is already mapped to ${existingForFplId.name}` },
      { status: 409 }
    );
  }

  const { data: targetPlayer, error: targetError } = await db
    .from("players")
    .select("id, fpl_id")
    .eq("id", playerId)
    .maybeSingle();

  if (targetError) {
    return NextResponse.json({ message: targetError.message }, { status: 500 });
  }

  if (!targetPlayer) {
    return NextResponse.json({ message: "Player not found" }, { status: 404 });
  }

  if (targetPlayer.fpl_id != null) {
    return NextResponse.json({ message: "Selected player already has an fpl_id set" }, { status: 409 });
  }

  // Fetch live FPL data for this player -- needed to populate fpl_player_data
  // and to confirm the fplId is still real before writing anything.
  let element: FplElement | undefined;
  try {
    const response = await fetch(FPL_BOOTSTRAP_URL, { method: "GET", cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ message: `FPL API unavailable (${response.status})` }, { status: 502 });
    }
    const bootstrap = (await response.json()) as FplBootstrapResponse;
    element = (bootstrap.elements ?? []).find((candidate) => candidate.id === fplId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach FPL API";
    return NextResponse.json({ message }, { status: 502 });
  }

  if (!element) {
    return NextResponse.json({ message: `fpl_id ${fplId} not found in current FPL data` }, { status: 404 });
  }

  // Check for a pre-existing fpl_player_data row for this fpl_id before
  // writing anything. A row already linked to a *different* player is a
  // genuine conflict -- flag it for manual review rather than overwriting.
  const { data: existingFplData, error: existingFplDataError } = await db
    .from("fpl_player_data")
    .select("id, player_id")
    .eq("fpl_id", fplId)
    .maybeSingle();

  if (existingFplDataError) {
    return NextResponse.json({ message: existingFplDataError.message }, { status: 500 });
  }

  if (existingFplData && existingFplData.player_id && existingFplData.player_id !== playerId) {
    const { data: conflictingPlayer } = await db
      .from("players")
      .select("name")
      .eq("id", existingFplData.player_id)
      .maybeSingle();

    return NextResponse.json(
      {
        message: `fpl_player_data for fpl_id ${fplId} is already linked to a different player (${
          conflictingPlayer?.name ?? existingFplData.player_id
        }). Resolve this manually before mapping.`,
      },
      { status: 409 }
    );
  }

  const { error: updateError } = await db.from("players").update({ fpl_id: fplId }).eq("id", playerId);

  if (updateError) {
    return NextResponse.json({ message: updateError.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  let linkedExistingRow = false;

  if (existingFplData) {
    // A fpl_player_data row for this fpl_id already exists with player_id
    // null -- almost certainly written by the daily cron, which upserts by
    // fpl_id but never links player_id. Just link it; leave season/stats
    // alone since the cron already keeps those fresh and correct.
    linkedExistingRow = true;
    const { error: linkError } = await db
      .from("fpl_player_data")
      .update({ player_id: playerId })
      .eq("id", existingFplData.id);

    if (linkError) {
      return NextResponse.json(
        {
          message: `players.fpl_id was set, but linking the existing fpl_player_data row failed: ${linkError.message}`,
        },
        { status: 500 }
      );
    }
  } else {
    const season = await getCurrentSeason(db);

    const insertRow: FplPlayerDataInsert = {
      player_id: playerId,
      fpl_id: fplId,
      season,
      status: toNullableText(element.status),
      chance_of_playing_next_round: element.chance_of_playing_next_round,
      news: toNullableText(element.news),
      news_added: toNullableText(element.news_added),
      expected_goals_per_90: parseNullableNumber(element.expected_goals_per_90),
      expected_assists_per_90: parseNullableNumber(element.expected_assists_per_90),
      clean_sheets_per_90: parseNullableNumber(element.clean_sheets_per_90),
      expected_goals_conceded_per_90: parseNullableNumber(element.expected_goals_conceded_per_90),
      saves_per_90: parseNullableNumber(element.saves_per_90),
      penalties_order: element.penalties_order,
      corners_order: element.corners_and_indirect_freekicks_order,
      direct_freekicks_order: element.direct_freekicks_order,
      starts_per_90: parseNullableNumber(element.starts_per_90),
      synced_at: nowIso,
      last_synced_at: nowIso,
    };

    const { error: insertError } = await db.from("fpl_player_data").insert(insertRow);

    if (insertError) {
      return NextResponse.json(
        {
          message: `players.fpl_id was set, but creating the fpl_player_data row failed: ${insertError.message}`,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ success: true, linkedExistingRow });
}
