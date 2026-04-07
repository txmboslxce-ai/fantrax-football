import { createAdminSupabaseClient } from "@/lib/supabase-admin";

const FPL_BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/";
const FPL_SEASON = "2025-26";

type FplElement = {
  id: number;
  status: string | null;
  chance_of_playing_next_round: number | null;
  news: string | null;
  news_added: string | null;
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

type FplPlayerDataUpsert = {
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

function toNullableText(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export async function syncFplPlayerData() {
  const supabase = createAdminSupabaseClient();

  if (!supabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for FPL sync.");
  }

  const response = await fetch(FPL_BOOTSTRAP_URL, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FPL API unavailable (${response.status}).`);
  }

  const bootstrap = (await response.json()) as FplBootstrapResponse;
  const syncedAt = new Date().toISOString();
  const rows: FplPlayerDataUpsert[] = (bootstrap.elements ?? []).map((element) => ({
    fpl_id: element.id,
    season: FPL_SEASON,
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
    synced_at: syncedAt,
    last_synced_at: syncedAt,
  }));

  if (rows.length === 0) {
    return { synced: 0, season: FPL_SEASON, syncedAt };
  }

  const { error } = await supabase.from("fpl_player_data").upsert(rows, {
    onConflict: "fpl_id",
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    synced: rows.length,
    season: FPL_SEASON,
    syncedAt,
  };
}
