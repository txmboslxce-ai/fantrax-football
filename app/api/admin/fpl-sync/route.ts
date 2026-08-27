import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { FPL_ID_TO_ABBREV } from "@/lib/fpl/sync";
import { getCurrentSeason } from "@/lib/season/current";

type PlayerRow = {
  id: string;
  name: string;
  team: string;
  fpl_id: number | null;
};

type FplElement = {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  status: string;
  chance_of_playing_next_round: number | null;
  chance_of_playing_this_round: number | null;
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

type PlayerFplUpdate = {
  id: string;
  fpl_id: number;
};

type FplDataUpsert = {
  player_id: string;
  fpl_id: number;
  season: string;
  status: string | null;
  chance_of_playing_next_round: number | null;
  chance_of_playing_this_round: number | null;
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
};

function normalizeName(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
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

// Team is a hard gate: only ever returns a candidate whose team exactly
// matches. No team info, zero on-team candidates, or more than one
// (ambiguous even after team filtering) all resolve to "leave unmatched"
// rather than guessing -- there is no off-team or arbitrary fallback.
function pickByTeam(candidates: PlayerRow[], teamAbbrev: string | null): PlayerRow | null {
  if (candidates.length === 0 || !teamAbbrev) {
    return null;
  }

  const onTeam = candidates.filter((player) => player.team === teamAbbrev);
  return onTeam.length === 1 ? onTeam[0] : null;
}

// Tokenizes a name for fuzzy comparison: NFD-normalized (existing accent
// stripping), periods/hyphens treated as separators, single-letter initials
// (and empty strings) dropped as too weak to carry any signal.
function significantTokens(value: string): string[] {
  return normalizeName(value)
    .replace(/[.\-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

// A name is only considered a fuzzy match if the SHORTER side has at least
// two significant tokens (a single common surname/initial alone is never
// enough signal -- this is what refuses a bare "Fernandes") AND every one
// of the shorter side's tokens appears in the longer side (strict: all
// tokens must match, not just most).
function tokenOverlapMatch(nameA: string, nameB: string): boolean {
  const tokensA = significantTokens(nameA);
  const tokensB = significantTokens(nameB);
  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];

  if (shorter.length < 2) {
    return false;
  }

  const longerSet = new Set(longer);
  return shorter.every((token) => longerSet.has(token));
}

function findFuzzyMatch(players: PlayerRow[], fullName: string, webName: string, teamAbbrev: string | null): PlayerRow | null {
  const candidates = players.filter((player) => {
    if (!player.name) {
      return false;
    }

    return tokenOverlapMatch(fullName, player.name) || tokenOverlapMatch(webName, player.name);
  });

  return pickByTeam(candidates, teamAbbrev);
}

function toNullableText(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export async function POST() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdminEmail(user.email)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
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

  const season = await getCurrentSeason(db);
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

  const nowIso = new Date().toISOString();

  let matched = 0;
  let unmatched = 0;
  const playerFplUpdates: PlayerFplUpdate[] = [];
  const fplDataUpserts: FplDataUpsert[] = [];
  const seenPlayerIds = new Set<string>();

  for (const element of bootstrap.elements ?? []) {
    const fplName = `${element.first_name} ${element.second_name}`.trim();
    const teamAbbrev = FPL_ID_TO_ABBREV[element.team] ?? null;

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
        season,
        status: toNullableText(element.status),
        chance_of_playing_next_round: element.chance_of_playing_next_round,
        chance_of_playing_this_round: element.chance_of_playing_this_round,
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
      });
      matched += 1;
    }
  }

  if (playerFplUpdates.length > 0) {
    const playerUpdateResults = await Promise.all(
      playerFplUpdates.map((item) => db.from("players").update({ fpl_id: item.fpl_id }).eq("id", item.id))
    );
    const failedPlayerUpdate = playerUpdateResults.find((result) => result.error);
    if (failedPlayerUpdate?.error) {
      return NextResponse.json({ success: false, message: failedPlayerUpdate.error.message }, { status: 500 });
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
