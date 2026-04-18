import Papa from "papaparse";
import { IGNORE_COLUMNS, KEEPER_COLUMN_MAP, PLAYER_COLUMN_MAP } from "@/lib/csv/columnMap";
import { calcGhostPts, coerceNumber } from "@/lib/csv/transform";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

const FANTRAX_DOWNLOAD_URL = "https://www.fantrax.com/fxpa/downloadPlayerStats";
const FPL_BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/";
const FANTRAX_SEASON = "2025-26";
const FANTRAX_LEAGUE_ID = "rll4dvajmeahdzar";
const FANTRAX_START_DATE = "2025-08-15";
const FANTRAX_END_DATE = "2026-04-07";

export const FANTRAX_POSITIONS = ["POS_701", "POS_702", "POS_703", "POS_704"] as const;
export type FantraxPositionGroup = (typeof FANTRAX_POSITIONS)[number];

const POSITION_LABELS: Record<FantraxPositionGroup, string> = {
  POS_701: "Forwards",
  POS_702: "Midfielders",
  POS_703: "Defenders",
  POS_704: "Goalkeepers",
};

type UploadType = "player" | "keeper";
type CsvRow = Record<string, string>;

type PlayerLookupRow = {
  id: string;
  fantrax_id: string;
  position: string;
};

type PlayerGameweekUpsert = {
  player_id: string;
  season: string;
  gameweek: number;
  games_played: number;
  games_started: number;
  minutes_played: number;
  raw_fantrax_pts: number;
  ghost_pts: number;
  goals: number;
  assists: number;
  clean_sheet: number;
  saves: number;
  key_passes: number;
  shots_on_target: number;
  tackles_won: number;
  interceptions: number;
  clearances: number;
  dribbles_succeeded: number;
  blocked_shots: number;
  aerials_won: number;
  accurate_crosses: number;
  penalties_drawn: number;
  penalties_missed: number;
  goals_against: number;
  goals_against_outfield: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
  subbed_on: number;
  subbed_off: number;
  penalty_saves: number;
  high_claims: number;
  smothers: number;
  corner_kicks: number;
  free_kick_shots: number;
  uploaded_at: string;
};

type SyncFantraxScoresResult = {
  gameweek: number;
  positionOrGroup: FantraxPositionGroup;
  positionLabel: string;
  playersSynced: number;
  unmatchedFantraxIds: string[];
  season: string;
};

type FplEvent = {
  id: number;
  is_current?: boolean;
  is_next?: boolean;
  finished?: boolean;
};

type FplBootstrapResponse = {
  events?: FplEvent[];
};

type NormalizedRow = {
  fantrax_id: string;
  name: string;
  team: string;
  position: string;
  gameweek: number;
  raw_fantrax_pts: number;
  games_played: number;
  games_started: number;
  minutes_played: number;
  ownership_pct: string;
  ownership_change: string;
  goals: number;
  key_passes: number;
  assists: number;
  shots_on_target: number;
  tackles_won: number;
  dispossessed: number;
  yellow_cards: number;
  red_cards: number;
  accurate_crosses: number;
  interceptions: number;
  clearances: number;
  dribbles_succeeded: number;
  blocked_shots: number;
  aerials_won: number;
  subbed_on: number;
  subbed_off: number;
  penalties_missed: number;
  penalties_drawn: number;
  own_goals: number;
  goals_against_outfield: number;
  clean_sheet: number;
  goals_against: number;
  saves: number;
  penalty_saves: number;
  high_claims: number;
  smothers: number;
  corner_kicks: number;
  free_kick_shots: number;
};

const ALL_STATS_KEYS: Array<keyof NormalizedRow> = [
  "raw_fantrax_pts",
  "games_played",
  "games_started",
  "minutes_played",
  "goals",
  "key_passes",
  "assists",
  "shots_on_target",
  "tackles_won",
  "dispossessed",
  "yellow_cards",
  "red_cards",
  "accurate_crosses",
  "interceptions",
  "clearances",
  "dribbles_succeeded",
  "blocked_shots",
  "aerials_won",
  "subbed_on",
  "subbed_off",
  "penalties_missed",
  "penalties_drawn",
  "own_goals",
  "goals_against_outfield",
  "clean_sheet",
  "goals_against",
  "saves",
  "penalty_saves",
  "high_claims",
  "smothers",
  "corner_kicks",
  "free_kick_shots",
];

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for Fantrax sync.`);
  }

  return value;
}

function isFantraxPositionGroup(value: string): value is FantraxPositionGroup {
  return FANTRAX_POSITIONS.includes(value as FantraxPositionGroup);
}

export function getFantraxPositionLabel(positionOrGroup: FantraxPositionGroup): string {
  return POSITION_LABELS[positionOrGroup];
}

function getUploadType(positionOrGroup: FantraxPositionGroup): UploadType {
  return positionOrGroup === "POS_704" ? "keeper" : "player";
}

function parseCsv(text: string): CsvRow[] {
  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    const formatted = parsed.errors.map((err) => `CSV parse error on row ${err.row}: ${err.message}`);
    throw new Error(formatted.join("; "));
  }

  return parsed.data;
}

function mapCsvRow(row: CsvRow, type: UploadType, fallbackGameweek: number): NormalizedRow {
  const columnMap = type === "keeper" ? KEEPER_COLUMN_MAP : PLAYER_COLUMN_MAP;
  const normalized: Record<string, unknown> = {
    gameweek: fallbackGameweek,
    fantrax_id: "",
    name: "",
    team: "",
    position: type === "keeper" ? "G" : "",
    raw_fantrax_pts: 0,
    games_played: 0,
    games_started: 0,
    minutes_played: 0,
    ownership_pct: "",
    ownership_change: "",
    goals: 0,
    key_passes: 0,
    assists: 0,
    shots_on_target: 0,
    tackles_won: 0,
    dispossessed: 0,
    yellow_cards: 0,
    red_cards: 0,
    accurate_crosses: 0,
    interceptions: 0,
    clearances: 0,
    dribbles_succeeded: 0,
    blocked_shots: 0,
    aerials_won: 0,
    subbed_on: 0,
    subbed_off: 0,
    penalties_missed: 0,
    penalties_drawn: 0,
    own_goals: 0,
    goals_against_outfield: 0,
    clean_sheet: 0,
    goals_against: 0,
    saves: 0,
    penalty_saves: 0,
    high_claims: 0,
    smothers: 0,
    corner_kicks: 0,
    free_kick_shots: 0,
  };

  for (const [csvColumn, value] of Object.entries(row)) {
    if (IGNORE_COLUMNS.includes(csvColumn as (typeof IGNORE_COLUMNS)[number])) {
      continue;
    }

    const internalColumn = columnMap[csvColumn as keyof typeof columnMap];
    if (!internalColumn) {
      continue;
    }

    if (internalColumn === "fantrax_id" || internalColumn === "name" || internalColumn === "team") {
      normalized[internalColumn] = String(value ?? "").trim();
      continue;
    }

    if (internalColumn === "position") {
      normalized.position = String(value ?? "").trim().toUpperCase();
      continue;
    }

    if (internalColumn === "ownership_pct" || internalColumn === "ownership_change") {
      normalized[internalColumn] = String(value ?? "").trim();
      continue;
    }

    normalized[internalColumn] = coerceNumber(value);
  }

  if (type === "keeper") {
    normalized.position = "G";
  }

  const derivedGameweek = Number(normalized.gameweek || fallbackGameweek);
  normalized.gameweek = Number.isFinite(derivedGameweek) ? derivedGameweek : fallbackGameweek;

  return normalized as NormalizedRow;
}

function zeroStatsForDnp(row: NormalizedRow): NormalizedRow {
  const cloned: NormalizedRow = { ...row };
  for (const key of ALL_STATS_KEYS) {
    (cloned[key] as unknown) = 0;
  }
  return cloned;
}

function buildDownloadUrl(gameweek: number, positionOrGroup: FantraxPositionGroup): string {
  const url = new URL(FANTRAX_DOWNLOAD_URL);
  url.searchParams.set("leagueId", FANTRAX_LEAGUE_ID);
  url.searchParams.set("view", "STATS");
  url.searchParams.set("positionOrGroup", positionOrGroup);
  url.searchParams.set("seasonOrProjection", "SEASON_925_BY_PERIOD");
  url.searchParams.set("timeframeTypeCode", "BY_PERIOD");
  url.searchParams.set("transactionPeriod", String(gameweek));
  url.searchParams.set("miscDisplayType", "1");
  url.searchParams.set("sortType", "SCORE");
  url.searchParams.set("maxResultsPerPage", "500");
  url.searchParams.set("statusOrTeamFilter", "ALL");
  url.searchParams.set("scoringCategoryType", "5");
  url.searchParams.set("timeStartType", "PERIOD_ONLY");
  url.searchParams.set("schedulePageAdj", "0");
  url.searchParams.set("searchName", "");
  url.searchParams.set("startDate", FANTRAX_START_DATE);
  url.searchParams.set("endDate", FANTRAX_END_DATE);
  return url.toString();
}

async function fetchFantraxCsv(gameweek: number, positionOrGroup: FantraxPositionGroup) {
  const sessionCookie = getRequiredEnv("FANTRAX_SESSION_COOKIE");
  const response = await fetch(buildDownloadUrl(gameweek, positionOrGroup), {
    method: "GET",
    cache: "no-store",
    headers: {
      cookie: sessionCookie,
    },
  });

  if (!response.ok) {
    throw new Error(`Fantrax CSV unavailable (${response.status}) for GW ${gameweek}, ${positionOrGroup}.`);
  }

  const body = await response.text();
  const trimmedBody = body.trimStart();

  if (trimmedBody.startsWith("<") || trimmedBody.includes("<!DOCTYPE")) {
    throw new Error("Fantrax session cookie has expired — update FANTRAX_SESSION_COOKIE in Vercel environment variables.");
  }

  return body;
}

function buildUpsert(
  playerId: string,
  position: string,
  gameweek: number,
  stats: NormalizedRow,
  uploadedAt: string
): PlayerGameweekUpsert {
  const row = stats.games_played <= 0 ? zeroStatsForDnp(stats) : stats;

  return {
    player_id: playerId,
    season: FANTRAX_SEASON,
    gameweek,
    games_played: Math.max(0, Math.trunc(Number(row.games_played ?? 0))),
    games_started: Math.max(0, Math.trunc(Number(row.games_started ?? 0))),
    minutes_played: Math.max(0, Math.trunc(Number(row.minutes_played ?? 0))),
    raw_fantrax_pts: Math.round(Number(row.raw_fantrax_pts ?? 0) * 100) / 100,
    ghost_pts: row.games_played > 0 ? calcGhostPts({ ...row, position }) : 0,
    goals: Math.max(0, Math.trunc(Number(row.goals ?? 0))),
    assists: Math.max(0, Math.trunc(Number(row.assists ?? 0))),
    clean_sheet: Math.max(0, Math.trunc(Number(row.clean_sheet ?? 0))),
    saves: Math.max(0, Math.trunc(Number(row.saves ?? 0))),
    key_passes: Math.max(0, Math.trunc(Number(row.key_passes ?? 0))),
    shots_on_target: Math.max(0, Math.trunc(Number(row.shots_on_target ?? 0))),
    tackles_won: Math.max(0, Math.trunc(Number(row.tackles_won ?? 0))),
    interceptions: Math.max(0, Math.trunc(Number(row.interceptions ?? 0))),
    clearances: Math.max(0, Math.trunc(Number(row.clearances ?? 0))),
    dribbles_succeeded: Math.max(0, Math.trunc(Number(row.dribbles_succeeded ?? 0))),
    blocked_shots: Math.max(0, Math.trunc(Number(row.blocked_shots ?? 0))),
    aerials_won: Math.max(0, Math.trunc(Number(row.aerials_won ?? 0))),
    accurate_crosses: Math.max(0, Math.trunc(Number(row.accurate_crosses ?? 0))),
    penalties_drawn: Math.max(0, Math.trunc(Number(row.penalties_drawn ?? 0))),
    penalties_missed: Math.max(0, Math.trunc(Number(row.penalties_missed ?? 0))),
    goals_against: Math.max(0, Math.trunc(Number(row.goals_against ?? 0))),
    goals_against_outfield: Math.max(0, Math.trunc(Number(row.goals_against_outfield ?? 0))),
    yellow_cards: Math.max(0, Math.trunc(Number(row.yellow_cards ?? 0))),
    red_cards: Math.max(0, Math.trunc(Number(row.red_cards ?? 0))),
    own_goals: Math.max(0, Math.trunc(Number(row.own_goals ?? 0))),
    subbed_on: Math.max(0, Math.trunc(Number(row.subbed_on ?? 0))),
    subbed_off: Math.max(0, Math.trunc(Number(row.subbed_off ?? 0))),
    penalty_saves: Math.max(0, Math.trunc(Number(row.penalty_saves ?? 0))),
    high_claims: Math.max(0, Math.trunc(Number(row.high_claims ?? 0))),
    smothers: Math.max(0, Math.trunc(Number(row.smothers ?? 0))),
    corner_kicks: Math.max(0, Math.trunc(Number(row.corner_kicks ?? 0))),
    free_kick_shots: Math.max(0, Math.trunc(Number(row.free_kick_shots ?? 0))),
    uploaded_at: uploadedAt,
  };
}

export async function getCurrentGameweek() {
  const response = await fetch(FPL_BOOTSTRAP_URL, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`FPL API unavailable (${response.status}) while resolving the current gameweek.`);
  }

  const payload = (await response.json()) as FplBootstrapResponse;
  const events = payload.events ?? [];
  const current = events.find((event) => event.is_current);

  if (current?.id) {
    return current.id;
  }

  const latestFinished = events.reduce((max, event) => {
    if (event.finished && Number.isFinite(event.id)) {
      return Math.max(max, event.id);
    }

    return max;
  }, 0);

  if (latestFinished > 0) {
    return latestFinished;
  }

  const next = events.find((event) => event.is_next);
  if (next?.id && next.id > 1) {
    return next.id - 1;
  }

  return 1;
}

export async function syncFantraxScores(
  gameweek: number,
  positionOrGroup: FantraxPositionGroup
): Promise<SyncFantraxScoresResult> {
  const supabase = createAdminSupabaseClient();

  if (!supabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for Fantrax sync.");
  }

  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
    throw new Error("Gameweek must be an integer between 1 and 38.");
  }

  if (!isFantraxPositionGroup(positionOrGroup)) {
    throw new Error("Invalid Fantrax position group.");
  }

  const csvText = await fetchFantraxCsv(gameweek, positionOrGroup);
  const rawRows = parseCsv(csvText);
  const uploadType = getUploadType(positionOrGroup);
  const mappedRows = rawRows
    .map((row) => mapCsvRow(row, uploadType, gameweek))
    .filter((row) => row.fantrax_id);

  const scorerIds = Array.from(new Set(mappedRows.map((row) => row.fantrax_id.trim())));
  if (scorerIds.length === 0) {
    return {
      gameweek,
      positionOrGroup,
      positionLabel: getFantraxPositionLabel(positionOrGroup),
      playersSynced: 0,
      unmatchedFantraxIds: [],
      season: FANTRAX_SEASON,
    };
  }

  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("id, fantrax_id, position")
    .in("fantrax_id", scorerIds);

  if (playersError) {
    throw new Error(playersError.message);
  }

  const players = (playersData ?? []) as PlayerLookupRow[];
  const playerByFantraxId = new Map(players.map((player) => [player.fantrax_id, player]));
  const unmatchedFantraxIds = scorerIds.filter((scorerId) => !playerByFantraxId.has(scorerId));

  const uploadedAt = new Date().toISOString();
  const upserts = mappedRows.flatMap((row) => {
    const player = playerByFantraxId.get(row.fantrax_id);
    if (!player) {
      return [];
    }

    return [buildUpsert(player.id, player.position, gameweek, row, uploadedAt)];
  });

  if (upserts.length > 0) {
    const { error: upsertError } = await supabase.from("player_gameweeks").upsert(upserts, {
      onConflict: "player_id,season,gameweek",
    });

    if (upsertError) {
      throw new Error(upsertError.message);
    }
  }

  return {
    gameweek,
    positionOrGroup,
    positionLabel: getFantraxPositionLabel(positionOrGroup),
    playersSynced: upserts.length,
    unmatchedFantraxIds,
    season: FANTRAX_SEASON,
  };
}
