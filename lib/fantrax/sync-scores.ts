import { createAdminSupabaseClient } from "@/lib/supabase-admin";

const FANTRAX_API_URL = "https://www.fantrax.com/fxpa/req?leagueId=rll4dvajmeahdzar";
const FPL_BOOTSTRAP_URL = "https://fantasy.premierleague.com/api/bootstrap-static/";
const FANTRAX_SEASON = "2025-26";
const FANTRAX_POSITIONS = ["POS_701", "POS_702", "POS_703", "POS_704"] as const;

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
  uploaded_at: string;
};

type StatField = Exclude<keyof PlayerGameweekUpsert, "player_id" | "season" | "gameweek" | "uploaded_at">;

type SyncFantraxScoresResult = {
  gameweek: number;
  playersSynced: number;
  unmatchedFantraxIds: string[];
  season: string;
};

type FantraxTableBundle = {
  headerCells: unknown[];
  rows: unknown[];
  paginatedResultSet?: Record<string, unknown>;
};

type FantraxResponseEnvelope = {
  responses?: Array<{
    data?: {
      statsTable?: unknown;
      tableHeader?: {
        cells?: unknown[];
      };
      paginatedResultSet?: Record<string, unknown>;
    };
  }>;
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

const HEADER_FIELD_MAP: Record<string, StatField> = {
  ACCURATECROSSES: "accurate_crosses",
  ACNC: "accurate_crosses",
  AERIALSWON: "aerials_won",
  AER: "aerials_won",
  ASSISTS: "assists",
  AT: "assists",
  BLOCKEDSHOTS: "blocked_shots",
  BS: "blocked_shots",
  CLEANSHEET: "clean_sheet",
  CLEANSHEETS: "clean_sheet",
  CS: "clean_sheet",
  CLEARANCES: "clearances",
  CLR: "clearances",
  COSS: "dribbles_succeeded",
  DRIBBLESSUCCEEDED: "dribbles_succeeded",
  FP: "raw_fantrax_pts",
  FPTS: "raw_fantrax_pts",
  FANTASYPTS: "raw_fantrax_pts",
  G: "goals",
  GA: "goals_against",
  GAO: "goals_against_outfield",
  GAMESPLAYED: "games_played",
  GAMESSTARTED: "games_started",
  GOALS: "goals",
  GOALSAGAINST: "goals_against",
  GOALSAGAINSTOUTFIELD: "goals_against_outfield",
  GP: "games_played",
  GS: "games_started",
  HCS: "high_claims",
  HIGHCLAIMS: "high_claims",
  INT: "interceptions",
  INTERCEPTIONS: "interceptions",
  KEYPASSES: "key_passes",
  KP: "key_passes",
  MIN: "minutes_played",
  MINUTES: "minutes_played",
  MINUTESPLAYED: "minutes_played",
  OG: "own_goals",
  OWNGOALS: "own_goals",
  PENALTIESDRAWN: "penalties_drawn",
  PENALTIESMISSED: "penalties_missed",
  PENALTYSAVES: "penalty_saves",
  PKD: "penalties_drawn",
  PKM: "penalties_missed",
  PKS: "penalty_saves",
  RC: "red_cards",
  REDCARDS: "red_cards",
  SAVES: "saves",
  SBOF: "subbed_off",
  SBON: "subbed_on",
  SHOTSONTARGET: "shots_on_target",
  SM: "smothers",
  SMOTHERS: "smothers",
  SOT: "shots_on_target",
  SUBBEDOFF: "subbed_off",
  SUBBEDON: "subbed_on",
  SV: "saves",
  TACKLESWON: "tackles_won",
  TKW: "tackles_won",
  YC: "yellow_cards",
  YELLOWCARDS: "yellow_cards",
};

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for Fantrax sync.`);
  }

  return value;
}

function normalizeHeaderLabel(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function extractString(value: unknown): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractString(item)).find(Boolean) ?? "";
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = [
      "content",
      "text",
      "label",
      "title",
      "shortName",
      "shortLabel",
      "name",
      "value",
      "display",
      "formattedValue",
      "result",
      "abbrev",
      "headerLabel",
      "columnName",
    ];

    for (const key of preferredKeys) {
      const candidate = extractString(record[key]);
      if (candidate) {
        return candidate;
      }
    }
  }

  return "";
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = extractString(value).replace(/,/g, "");
  if (!raw) {
    return 0;
  }

  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getStatsTableRows(statsTable: unknown): unknown[] | null {
  if (Array.isArray(statsTable)) {
    return statsTable;
  }

  if (!isRecord(statsTable)) {
    return null;
  }

  if (Array.isArray(statsTable.rows)) {
    return statsTable.rows;
  }

  return null;
}

function findFantraxTable(response: unknown): FantraxTableBundle | null {
  const envelope = response as FantraxResponseEnvelope;
  const data = envelope.responses?.[0]?.data;
  const headerCells = data?.tableHeader?.cells;
  const rows = getStatsTableRows(data?.statsTable);

  if (!headerCells || !rows) {
    return null;
  }

  return {
    headerCells,
    rows,
    paginatedResultSet: data?.paginatedResultSet,
  };
}

function extractScorerId(row: unknown): string | null {
  if (!isRecord(row)) {
    return null;
  }

  const direct = extractString(row.scorerId);
  if (direct) {
    return `*${direct.trim()}*`;
  }

  if (isRecord(row.scorer)) {
    const nested = extractString(row.scorer.scorerId ?? row.scorer.id);
    return nested ? `*${nested.trim()}*` : null;
  }

  return null;
}

function buildHeaderIndex(headerCells: unknown[]): string[] {
  return headerCells.map((cell, index) => {
    const record = isRecord(cell) ? cell : null;
    const label =
      extractString(record?.content) ||
      extractString(record?.abbrev) ||
      extractString(record?.shortName) ||
      extractString(record?.name) ||
      extractString(record?.text) ||
      extractString(record?.title);

    return label || `COL_${index + 1}`;
  });
}

function buildRowStats(row: unknown, headers: string[]): Partial<PlayerGameweekUpsert> {
  if (!isRecord(row) || !Array.isArray(row.cells)) {
    return {};
  }

  const stats: Partial<PlayerGameweekUpsert> = {};

  row.cells.forEach((cell, index) => {
    const header = headers[index];
    if (!header) {
      return;
    }

    const field = HEADER_FIELD_MAP[normalizeHeaderLabel(header)];
    if (!field) {
      return;
    }

    (stats as Partial<Record<StatField, number>>)[field] = parseNumber(cell);
  });

  return stats;
}

async function fetchFantraxPage(gameweek: number, positionOrGroup: string, pageNumber: number) {
  const sessionCookie = getRequiredEnv("FANTRAX_SESSION_COOKIE");

  const response = await fetch(FANTRAX_API_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      cookie: sessionCookie,
    },
    body: JSON.stringify({
      msgs: [
        {
          method: "getPlayerStats",
          data: {
            leagueId: "rll4dvajmeahdzar",
            seasonOrProjection: "SEASON_925_BY_PERIOD",
            timeframeTypeCode: "BY_PERIOD",
            transactionPeriod: gameweek,
            positionOrGroup,
            pageNumber,
          },
        },
      ],
      uiv: 3,
      at: 0,
      dt: 2,
      tz: "America/Edmonton",
      v: "181.1.1",
    }),
  });

  if (!response.ok) {
    throw new Error(`Fantrax API unavailable (${response.status}) for GW ${gameweek}, ${positionOrGroup}, page ${pageNumber}.`);
  }

  return (await response.json()) as unknown;
}

async function fetchFantraxRowsForPosition(gameweek: number, positionOrGroup: string) {
  const firstPayload = await fetchFantraxPage(gameweek, positionOrGroup, 1);
  console.log(JSON.stringify(firstPayload).slice(0, 2000));
  const firstTable = findFantraxTable(firstPayload);

  if (!firstTable) {
    throw new Error(`Unable to parse Fantrax response for ${positionOrGroup} in GW ${gameweek}.`);
  }

  const totalPages = Math.max(1, Number(firstTable.paginatedResultSet?.totalNumPages ?? 1));
  const rows = [...firstTable.rows];
  const headers = buildHeaderIndex(firstTable.headerCells);

  for (let pageNumber = 2; pageNumber <= totalPages; pageNumber += 1) {
    const payload = await fetchFantraxPage(gameweek, positionOrGroup, pageNumber);
    const table = findFantraxTable(payload);

    if (!table) {
      throw new Error(`Unable to parse Fantrax page ${pageNumber} for ${positionOrGroup} in GW ${gameweek}.`);
    }

    rows.push(...table.rows);
  }

  return { headers, rows };
}

function calculateGhostPoints(stats: Partial<PlayerGameweekUpsert>, position: string): number {
  const rawPoints = Number(stats.raw_fantrax_pts ?? 0);
  const goals = Number(stats.goals ?? 0);
  const assists = Number(stats.assists ?? 0);
  const cleanSheet = Number(stats.clean_sheet ?? 0);
  const normalizedPosition = position.toUpperCase();
  const goalWeight = normalizedPosition === "D" || normalizedPosition === "G" ? 10 : 9;
  const assistWeight = normalizedPosition === "D" || normalizedPosition === "G" ? 7 : 6;
  const cleanSheetWeight = normalizedPosition === "D" || normalizedPosition === "G" ? 6 : normalizedPosition === "M" ? 1 : 0;
  const derived = rawPoints - goals * goalWeight - assists * assistWeight - cleanSheet * cleanSheetWeight;
  return roundTo2(Math.max(0, derived));
}

function buildUpsert(
  playerId: string,
  position: string,
  gameweek: number,
  stats: Partial<PlayerGameweekUpsert>,
  uploadedAt: string
): PlayerGameweekUpsert {
  const gamesPlayed = Math.trunc(Number(stats.games_played ?? 0));
  const base: PlayerGameweekUpsert = {
    player_id: playerId,
    season: FANTRAX_SEASON,
    gameweek,
    games_played: Math.max(0, gamesPlayed),
    games_started: Math.max(0, Math.trunc(Number(stats.games_started ?? 0))),
    minutes_played: Math.max(0, Math.trunc(Number(stats.minutes_played ?? 0))),
    raw_fantrax_pts: roundTo2(Number(stats.raw_fantrax_pts ?? 0)),
    ghost_pts: gamesPlayed > 0 ? calculateGhostPoints(stats, position) : 0,
    goals: Math.max(0, Math.trunc(Number(stats.goals ?? 0))),
    assists: Math.max(0, Math.trunc(Number(stats.assists ?? 0))),
    clean_sheet: Math.max(0, Math.trunc(Number(stats.clean_sheet ?? 0))),
    saves: Math.max(0, Math.trunc(Number(stats.saves ?? 0))),
    key_passes: Math.max(0, Math.trunc(Number(stats.key_passes ?? 0))),
    shots_on_target: Math.max(0, Math.trunc(Number(stats.shots_on_target ?? 0))),
    tackles_won: Math.max(0, Math.trunc(Number(stats.tackles_won ?? 0))),
    interceptions: Math.max(0, Math.trunc(Number(stats.interceptions ?? 0))),
    clearances: Math.max(0, Math.trunc(Number(stats.clearances ?? 0))),
    dribbles_succeeded: Math.max(0, Math.trunc(Number(stats.dribbles_succeeded ?? 0))),
    blocked_shots: Math.max(0, Math.trunc(Number(stats.blocked_shots ?? 0))),
    aerials_won: Math.max(0, Math.trunc(Number(stats.aerials_won ?? 0))),
    accurate_crosses: Math.max(0, Math.trunc(Number(stats.accurate_crosses ?? 0))),
    penalties_drawn: Math.max(0, Math.trunc(Number(stats.penalties_drawn ?? 0))),
    penalties_missed: Math.max(0, Math.trunc(Number(stats.penalties_missed ?? 0))),
    goals_against: Math.max(0, Math.trunc(Number(stats.goals_against ?? 0))),
    goals_against_outfield: Math.max(0, Math.trunc(Number(stats.goals_against_outfield ?? 0))),
    yellow_cards: Math.max(0, Math.trunc(Number(stats.yellow_cards ?? 0))),
    red_cards: Math.max(0, Math.trunc(Number(stats.red_cards ?? 0))),
    own_goals: Math.max(0, Math.trunc(Number(stats.own_goals ?? 0))),
    subbed_on: Math.max(0, Math.trunc(Number(stats.subbed_on ?? 0))),
    subbed_off: Math.max(0, Math.trunc(Number(stats.subbed_off ?? 0))),
    penalty_saves: Math.max(0, Math.trunc(Number(stats.penalty_saves ?? 0))),
    high_claims: Math.max(0, Math.trunc(Number(stats.high_claims ?? 0))),
    smothers: Math.max(0, Math.trunc(Number(stats.smothers ?? 0))),
    uploaded_at: uploadedAt,
  };

  if (base.games_played <= 0) {
    return {
      ...base,
      games_started: 0,
      minutes_played: 0,
      raw_fantrax_pts: 0,
      ghost_pts: 0,
      goals: 0,
      assists: 0,
      clean_sheet: 0,
      saves: 0,
      key_passes: 0,
      shots_on_target: 0,
      tackles_won: 0,
      interceptions: 0,
      clearances: 0,
      dribbles_succeeded: 0,
      blocked_shots: 0,
      aerials_won: 0,
      accurate_crosses: 0,
      penalties_drawn: 0,
      penalties_missed: 0,
      goals_against: 0,
      goals_against_outfield: 0,
      yellow_cards: 0,
      red_cards: 0,
      own_goals: 0,
      subbed_on: 0,
      subbed_off: 0,
      penalty_saves: 0,
      high_claims: 0,
      smothers: 0,
    };
  }

  return base;
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

export async function syncFantraxScores(gameweek: number): Promise<SyncFantraxScoresResult> {
  const supabase = createAdminSupabaseClient();

  if (!supabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for Fantrax sync.");
  }

  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
    throw new Error("Gameweek must be an integer between 1 and 38.");
  }

  getRequiredEnv("FANTRAX_SESSION_COOKIE");

  const allRows: Array<{ scorerId: string; stats: Partial<PlayerGameweekUpsert> }> = [];

  for (const positionOrGroup of FANTRAX_POSITIONS) {
    const { headers, rows } = await fetchFantraxRowsForPosition(gameweek, positionOrGroup);

    for (const row of rows) {
      const scorerId = extractScorerId(row);
      if (!scorerId) {
        continue;
      }

      allRows.push({
        scorerId,
        stats: buildRowStats(row, headers),
      });
    }
  }

  const scorerIds = Array.from(new Set(allRows.map((row) => row.scorerId)));
  if (scorerIds.length === 0) {
    return {
      gameweek,
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

  unmatchedFantraxIds.forEach((scorerId) => {
    console.warn(`Fantrax sync unmatched scorerId: ${scorerId}`);
  });

  const uploadedAt = new Date().toISOString();
  const upserts = allRows.flatMap((row) => {
    const player = playerByFantraxId.get(row.scorerId);
    if (!player) {
      return [];
    }

    return [buildUpsert(player.id, player.position, gameweek, row.stats, uploadedAt)];
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
    playersSynced: upserts.length,
    unmatchedFantraxIds,
    season: FANTRAX_SEASON,
  };
}
