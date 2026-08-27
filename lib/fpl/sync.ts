import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getCurrentSeason } from "@/lib/season/current";

const FPL_BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/";
const FPL_FIXTURES_URL = "https://fantasy.premierleague.com/api/fixtures/";

// FPL numeric team id -> our teams.abbrev, built by matching FPL's
// bootstrap-static `short_name` against existing teams.abbrev values.
// Two clubs use a different abbreviation convention between the two systems
// (confirmed same clubs, not a rename of our teams.abbrev):
//   FPL "BRE" (Brentford)     -> our abbrev "BRF"
//   FPL "NFO" (Nott'm Forest) -> our abbrev "NOT"
export const FPL_ID_TO_ABBREV: Record<number, string> = {
  1: "ARS",
  2: "AVL",
  3: "BOU",
  4: "BRF",
  5: "BHA",
  6: "CHE",
  7: "COV",
  8: "CRY",
  9: "EVE",
  10: "FUL",
  11: "HUL",
  12: "IPS",
  13: "LEE",
  14: "LIV",
  15: "MCI",
  16: "MUN",
  17: "NEW",
  18: "NOT",
  19: "TOT",
  20: "SUN",
};

type FplElement = {
  id: number;
  status: string | null;
  chance_of_playing_next_round: number | null;
  chance_of_playing_this_round: number | null;
  news: string | null;
  news_added: string | null;
  scout_news_link: string | null;
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

type FplTeam = {
  id: number;
  short_name: string;
};

type FplBootstrapTeamsResponse = {
  teams: FplTeam[];
};

type FplFixture = {
  event: number | null;
  team_h: number;
  team_a: number;
  kickoff_time: string | null;
};

type FixtureUpsert = {
  season: string;
  gameweek: number;
  home_team: string;
  away_team: string;
  kickoff_at: string | null;
};

type FplPlayerDataUpsert = {
  fpl_id: number;
  season: string;
  status: string | null;
  chance_of_playing_next_round: number | null;
  chance_of_playing_this_round: number | null;
  news: string | null;
  news_added: string | null;
  scout_news_link: string | null;
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

  const FPL_SEASON = await getCurrentSeason(supabase);

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
    chance_of_playing_this_round: element.chance_of_playing_this_round,
    news: toNullableText(element.news),
    news_added: toNullableText(element.news_added),
    scout_news_link: toNullableText(element.scout_news_link),
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

export async function syncFixtures() {
  const supabase = createAdminSupabaseClient();

  if (!supabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for FPL sync.");
  }

  const season = await getCurrentSeason(supabase);

  const [bootstrapResponse, fixturesResponse] = await Promise.all([
    fetch(FPL_BOOTSTRAP_URL, { method: "GET", cache: "no-store" }),
    fetch(FPL_FIXTURES_URL, { method: "GET", cache: "no-store" }),
  ]);

  if (!bootstrapResponse.ok) {
    throw new Error(`FPL API unavailable (${bootstrapResponse.status}).`);
  }
  if (!fixturesResponse.ok) {
    throw new Error(`FPL fixtures API unavailable (${fixturesResponse.status}).`);
  }

  const bootstrap = (await bootstrapResponse.json()) as FplBootstrapTeamsResponse;
  const fplFixtures = (await fixturesResponse.json()) as FplFixture[];

  const unmappedTeams = (bootstrap.teams ?? []).filter((team) => !FPL_ID_TO_ABBREV[team.id]);
  if (unmappedTeams.length > 0) {
    throw new Error(
      `Unmapped FPL team id(s): ${unmappedTeams
        .map((team) => `${team.id} (${team.short_name})`)
        .join(", ")}. Update FPL_ID_TO_ABBREV in lib/fpl/sync.ts.`
    );
  }

  const rows: FixtureUpsert[] = [];
  let skipped = 0;

  for (const fixture of fplFixtures) {
    if (fixture.event == null) {
      skipped += 1;
      continue;
    }

    rows.push({
      season,
      gameweek: fixture.event,
      home_team: FPL_ID_TO_ABBREV[fixture.team_h],
      away_team: FPL_ID_TO_ABBREV[fixture.team_a],
      kickoff_at: fixture.kickoff_time,
    });
  }

  if (rows.length === 0) {
    return { synced: 0, skipped, season };
  }

  // Idempotent via the table's existing unique(season, gameweek, home_team)
  // constraint — re-running (e.g. daily) upserts the same rows and picks up
  // kickoff_at changes (TV reschedules) rather than creating duplicates.
  const { error } = await supabase.from("fixtures").upsert(rows, {
    onConflict: "season,gameweek,home_team",
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    synced: rows.length,
    skipped,
    season,
  };
}
