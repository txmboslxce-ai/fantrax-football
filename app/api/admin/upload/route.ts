import Papa from "papaparse";
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import {
  IGNORE_COLUMNS,
  KEEPER_COLUMN_MAP,
  PLAYER_COLUMN_MAP,
} from "@/lib/csv/columnMap";
import {
  calcGhostPts,
  calcKeeperPts,
  calcOutfielderPts,
  coerceNumber,
  resolveOpponentFromFixtures,
} from "@/lib/csv/transform";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type UploadType = "player" | "keeper";

type CsvRow = Record<string, string>;

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
  opponent: string | null;
  is_home: boolean | null;
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
];

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
    opponent: null,
    is_home: null,
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

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["Unauthorized"] }, { status: 401 });
  }

  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["Forbidden"] }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const typeRaw = formData.get("type");
  const seasonRaw = formData.get("season");
  const gameweekRaw = formData.get("gameweek");

  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["Missing CSV file"] }, { status: 400 });
  }

  const type = String(typeRaw ?? "").trim() as UploadType;
  const season = String(seasonRaw ?? "").trim();
  const gameweek = Number(gameweekRaw ?? 0);

  if (type !== "player" && type !== "keeper") {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["Invalid type"] }, { status: 400 });
  }

  if (!season) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["Season is required"] }, { status: 400 });
  }

  if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
    return NextResponse.json(
      { success: false, rowsProcessed: 0, errors: ["Gameweek must be an integer between 1 and 38"] },
      { status: 400 }
    );
  }

  const errors: string[] = [];

  try {
    const csvText = await file.text();
    const rawRows = parseCsv(csvText);
    const db = createAdminSupabaseClient() ?? supabase;

    const { data: fixtureRows, error: fixtureError } = await db
      .from("fixtures")
      .select("home_team, away_team, gameweek")
      .eq("season", season)
      .eq("gameweek", gameweek);

    if (fixtureError) {
      errors.push(`Could not load fixtures for GW ${gameweek}: ${fixtureError.message}`);
    }

    const mappedRows = rawRows
      .map((row) => mapCsvRow(row, type, gameweek))
      .filter((row) => row.fantrax_id && row.name && row.team);

    if (mappedRows.length === 0) {
      return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["No valid rows found in CSV"] }, { status: 400 });
    }

    const playerUpserts = mappedRows.map((row) => ({
      fantrax_id: row.fantrax_id,
      name: row.name,
      team: row.team,
      position: row.position,
      ownership_pct: row.ownership_pct,
      ownership_change: row.ownership_change,
      is_keeper: type === "keeper",
    }));

    const { data: playerRows, error: playersUpsertError } = await db
      .from("players")
      .upsert(playerUpserts, { onConflict: "fantrax_id" })
      .select("id, fantrax_id");

    if (playersUpsertError) {
      return NextResponse.json(
        { success: false, rowsProcessed: 0, errors: [`Players upsert failed: ${playersUpsertError.message}`] },
        { status: 500 }
      );
    }

    const playerIdByFantraxId = new Map(
      (playerRows ?? []).map((row: { id: string; fantrax_id: string }) => [row.fantrax_id, row.id])
    );

    const gameweekUpserts = mappedRows.flatMap((originalRow, index) => {
      const playerId = playerIdByFantraxId.get(originalRow.fantrax_id);
      if (!playerId) {
        errors.push(`Row ${index + 1}: could not resolve player_id for fantrax_id ${originalRow.fantrax_id}`);
        return [];
      }

      const resolved = resolveOpponentFromFixtures(
        (fixtureRows ?? []) as Array<{ home_team: string; away_team: string; gameweek: number }>,
        originalRow.team,
        gameweek,
        String(rawRows[index]?.["H/A"] ?? "")
      );

      const row =
        originalRow.games_played <= 0
          ? zeroStatsForDnp(originalRow)
          : {
              ...originalRow,
              ghost_pts: calcGhostPts(originalRow),
            };

      if (originalRow.games_played > 0) {
        const expectedPts = type === "keeper" ? calcKeeperPts(originalRow) : calcOutfielderPts(originalRow);
        const diff = Math.abs(expectedPts - originalRow.raw_fantrax_pts);
        if (diff > 0.01) {
          errors.push(
            `Row ${index + 1} (${originalRow.name}): FPts mismatch, expected ${expectedPts.toFixed(2)} got ${Number(
              originalRow.raw_fantrax_pts
            ).toFixed(2)}`
          );
        }
      }

      const payload = {
        player_id: playerId,
        season,
        gameweek,
        games_played: row.games_played,
        games_started: row.games_started,
        minutes_played: row.minutes_played,
        raw_fantrax_pts: row.raw_fantrax_pts,
        ghost_pts: originalRow.games_played <= 0 ? 0 : calcGhostPts(originalRow),
        goals: row.goals,
        assists: row.assists,
        clean_sheet: row.clean_sheet,
        saves: row.saves,
        key_passes: row.key_passes,
        shots_on_target: row.shots_on_target,
        tackles_won: row.tackles_won,
        interceptions: row.interceptions,
        clearances: row.clearances,
        dribbles_succeeded: row.dribbles_succeeded,
        blocked_shots: row.blocked_shots,
        aerials_won: row.aerials_won,
        accurate_crosses: row.accurate_crosses,
        penalties_drawn: row.penalties_drawn,
        penalties_missed: row.penalties_missed,
        goals_against: row.goals_against,
        goals_against_outfield: row.goals_against_outfield,
        yellow_cards: row.yellow_cards,
        red_cards: row.red_cards,
        own_goals: row.own_goals,
        subbed_on: row.subbed_on,
        subbed_off: row.subbed_off,
        penalty_saves: row.penalty_saves,
        high_claims: row.high_claims,
        smothers: row.smothers,
      };

      if (!resolved.opponent) {
        errors.push(`Row ${index + 1} (${originalRow.name}): fixture opponent not found for GW ${gameweek}`);
      }

      return [payload];
    });

    if (gameweekUpserts.length > 0) {
      const { error: gameweekUpsertError } = await db
        .from("player_gameweeks")
        .upsert(gameweekUpserts, { onConflict: "player_id,season,gameweek" });

      if (gameweekUpsertError) {
        return NextResponse.json(
          {
            success: false,
            rowsProcessed: 0,
            errors: [`player_gameweeks upsert failed: ${gameweekUpsertError.message}`, ...errors],
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, rowsProcessed: gameweekUpserts.length, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected upload error";
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: [message] }, { status: 500 });
  }
}
