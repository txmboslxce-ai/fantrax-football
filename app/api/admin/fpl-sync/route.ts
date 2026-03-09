import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type PlayerRow = {
  id: string;
  name: string;
  team: string;
  fpl_id: number | null;
};

type FplTeam = {
  id: number;
  short_name: string;
};

type FplElement = {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  status: string;
  chance_of_playing_next_round: number | null;
  news: string;
  news_added: string;
  expected_goals_per_90: string | null;
  expected_assists_per_90: string | null;
  penalties_order: number | null;
  corners_and_indirect_freekicks_order: number | null;
  direct_freekicks_order: number | null;
  starts_per_90: string | null;
};

type FplBootstrapResponse = {
  elements: FplElement[];
  teams: FplTeam[];
};

type PlayerFplUpdate = {
  id: string;
  fpl_id: number;
};

type FplDataUpsert = {
  player_id: string;
  fpl_id: number;
  status: string | null;
  chance_of_playing_next_round: number | null;
  news: string | null;
  news_added: string | null;
  expected_goals_per_90: number | null;
  expected_assists_per_90: number | null;
  penalties_order: number | null;
  corners_order: number | null;
  direct_freekicks_order: number | null;
  starts_per_90: number | null;
  synced_at: string;
};

function normalizeName(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function pickByTeam(candidates: PlayerRow[], teamAbbrev: string | null): PlayerRow | null {
  if (candidates.length === 0) {
    return null;
  }

  if (!teamAbbrev) {
    return candidates[0];
  }

  const exactTeam = candidates.find((player) => player.team === teamAbbrev);
  return exactTeam ?? candidates[0];
}

function findFuzzyMatch(players: PlayerRow[], fullName: string, webName: string, teamAbbrev: string | null): PlayerRow | null {
  const normalizedFull = normalizeName(fullName);
  const normalizedWeb = normalizeName(webName);

  const candidates = players.filter((player) => {
    const normalizedPlayer = normalizeName(player.name);
    if (!normalizedPlayer) {
      return false;
    }

    return (
      normalizedFull.includes(normalizedPlayer) ||
      normalizedPlayer.includes(normalizedFull) ||
      normalizedWeb.includes(normalizedPlayer) ||
      normalizedPlayer.includes(normalizedWeb)
    );
  });

  return pickByTeam(candidates, teamAbbrev);
}

function toNullableText(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export async function POST(request: Request) {
  const isCronInvocation = request.headers.get("x-vercel-cron") === "1";
  const supabase = await createServerSupabaseClient();

  if (!isCronInvocation) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || !isAdminEmail(user.email)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
  }

  let bootstrap: FplBootstrapResponse;
  try {
    const response = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: `FPL API unavailable (${response.status})` },
        { status: 503 }
      );
    }

    bootstrap = (await response.json()) as FplBootstrapResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch FPL API";
    return NextResponse.json({ success: false, message }, { status: 503 });
  }

  const db = createAdminSupabaseClient() ?? supabase;
  const { data: playersData, error: playersError } = await db.from("players").select("id, name, team, fpl_id");

  if (playersError) {
    return NextResponse.json({ success: false, message: playersError.message }, { status: 500 });
  }

  const players = (playersData ?? []) as PlayerRow[];
  const byFplId = new Map<number, PlayerRow>();
  const byName = new Map<string, PlayerRow[]>();

  for (const player of players) {
    if (player.fpl_id != null) {
      byFplId.set(player.fpl_id, player);
    }

    const key = normalizeName(player.name);
    if (!key) {
      continue;
    }

    const existing = byName.get(key) ?? [];
    existing.push(player);
    byName.set(key, existing);
  }

  const teamById = new Map<number, string>((bootstrap.teams ?? []).map((team) => [team.id, team.short_name]));
  const nowIso = new Date().toISOString();

  let matched = 0;
  let unmatched = 0;
  const playerFplUpdates: PlayerFplUpdate[] = [];
  const fplDataUpserts: FplDataUpsert[] = [];
  const seenPlayerIds = new Set<string>();

  for (const element of bootstrap.elements ?? []) {
    const fplName = `${element.first_name} ${element.second_name}`.trim();
    const teamAbbrev = teamById.get(element.team) ?? null;

    let matchedPlayer: PlayerRow | null = byFplId.get(element.id) ?? null;

    if (!matchedPlayer) {
      const knownNameKey = normalizeName(fplName);
      const webNameKey = normalizeName(element.web_name);

      matchedPlayer = pickByTeam(byName.get(knownNameKey) ?? [], teamAbbrev);
      if (!matchedPlayer) {
        matchedPlayer = pickByTeam(byName.get(webNameKey) ?? [], teamAbbrev);
      }
      if (!matchedPlayer) {
        matchedPlayer = findFuzzyMatch(players, fplName, element.web_name, teamAbbrev);
      }
    }

    if (!matchedPlayer) {
      unmatched += 1;
      console.log(`FPL sync unmatched: ${fplName} (${element.web_name})`);
      continue;
    }

    if (!seenPlayerIds.has(matchedPlayer.id)) {
      seenPlayerIds.add(matchedPlayer.id);
      playerFplUpdates.push({
        id: matchedPlayer.id,
        fpl_id: element.id,
      });
      fplDataUpserts.push({
        player_id: matchedPlayer.id,
        fpl_id: element.id,
        status: toNullableText(element.status),
        chance_of_playing_next_round: element.chance_of_playing_next_round,
        news: toNullableText(element.news),
        news_added: toNullableText(element.news_added),
        expected_goals_per_90: parseNullableNumber(element.expected_goals_per_90),
        expected_assists_per_90: parseNullableNumber(element.expected_assists_per_90),
        penalties_order: element.penalties_order,
        corners_order: element.corners_and_indirect_freekicks_order,
        direct_freekicks_order: element.direct_freekicks_order,
        starts_per_90: parseNullableNumber(element.starts_per_90),
        synced_at: nowIso,
      });
      matched += 1;
    }
  }

  if (playerFplUpdates.length > 0) {
    const { error: playersUpsertError } = await db.from("players").upsert(playerFplUpdates, { onConflict: "id" });
    if (playersUpsertError) {
      return NextResponse.json({ success: false, message: playersUpsertError.message }, { status: 500 });
    }

    const { error: fplDataUpsertError } = await db.from("fpl_player_data").upsert(fplDataUpserts, { onConflict: "player_id" });
    if (fplDataUpsertError) {
      return NextResponse.json({ success: false, message: fplDataUpsertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    matched,
    unmatched,
    total: (bootstrap.elements ?? []).length,
  });
}
