import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { isAdminEmail } from "@/lib/admin";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type TeamRow = {
  abbrev: string;
  full_name: string | null;
  name: string | null;
};

function getCellRawValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function getCellValue(record: Record<string, unknown>, keys: string[]): string {
  const value = getCellRawValue(record, keys);
  return value === undefined ? "" : String(value).trim();
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeForMatch(value: string): string {
  return normalize(value)
    .replace(/&/g, " and ")
    .replace(/[.'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TEAM_ALIASES: Record<string, string> = {
  "man utd": "manchester united",
  "man united": "manchester united",
  "man city": "manchester city",
  spurs: "tottenham",
  wolves: "wolverhampton",
  "nottm forest": "nottingham forest",
  "nottm. forest": "nottingham forest",
  "nottm forest fc": "nottingham forest",
  "nottingham for": "nottingham forest",
  "nott'm forest": "nottingham forest",
};

function parseKickoffValue(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const kickoff = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.round(parsed.S ?? 0)));
      return Number.isNaN(kickoff.getTime()) ? null : kickoff.toISOString();
    }
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const ukDateTimeMatch = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\s*(GMT|UTC))?$/i
  );
  if (ukDateTimeMatch) {
    const [, dayRaw, monthRaw, yearRaw, hourRaw = "0", minuteRaw = "0", secondRaw = "0"] = ukDateTimeMatch;
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = Number(yearRaw);
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const second = Number(secondRaw);

    if (
      Number.isInteger(day) &&
      Number.isInteger(month) &&
      Number.isInteger(year) &&
      Number.isInteger(hour) &&
      Number.isInteger(minute) &&
      Number.isInteger(second)
    ) {
      const kickoff = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
      if (
        kickoff.getUTCFullYear() === year &&
        kickoff.getUTCMonth() === month - 1 &&
        kickoff.getUTCDate() === day &&
        kickoff.getUTCHours() === hour &&
        kickoff.getUTCMinutes() === minute &&
        kickoff.getUTCSeconds() === second
      ) {
        return kickoff.toISOString();
      }
    }
  }

  const kickoff = new Date(text);
  return Number.isNaN(kickoff.getTime()) ? null : kickoff.toISOString();
}

function resolveTeamAbbrev(teamNameRaw: string, teams: TeamRow[]): { abbrev: string | null; reason?: string } {
  const teamName = normalize(teamNameRaw);
  const normalizedTeamName = normalizeForMatch(teamNameRaw);
  const aliasExpanded = TEAM_ALIASES[normalizedTeamName];
  const candidateNames = Array.from(new Set([teamName, normalizedTeamName, aliasExpanded].filter((value): value is string => Boolean(value))));

  if (!teamName) {
    return { abbrev: null, reason: "empty team name" };
  }

  const exactFullName = teams.find((team) => candidateNames.includes(normalize(team.full_name ?? "")) || candidateNames.includes(normalizeForMatch(team.full_name ?? "")));
  if (exactFullName) {
    return { abbrev: exactFullName.abbrev };
  }

  const exactName = teams.find((team) => candidateNames.includes(normalize(team.name ?? "")) || candidateNames.includes(normalizeForMatch(team.name ?? "")));
  if (exactName) {
    return { abbrev: exactName.abbrev };
  }

  const partialMatches = teams.filter((team) => {
    const fullName = normalizeForMatch(team.full_name ?? "");
    const shortName = normalizeForMatch(team.name ?? "");

    return candidateNames.some(
      (candidate) => (fullName && (fullName.includes(candidate) || candidate.includes(fullName))) || (shortName && (shortName.includes(candidate) || candidate.includes(shortName)))
    );
  });

  if (partialMatches.length === 1) {
    return { abbrev: partialMatches[0].abbrev };
  }

  if (partialMatches.length > 1) {
    const candidates = partialMatches.map((team) => team.full_name || team.name || team.abbrev).join(", ");
    return { abbrev: null, reason: `ambiguous match (${candidates})` };
  }

  return { abbrev: null, reason: "no match found" };
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["Unauthorized"] }, { status: 401 });
  }

  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["Forbidden"] }, { status: 403 });
  }

  const formData = await request.formData();
  const season = String(formData.get("season") ?? "").trim();
  const file = formData.get("file");

  if (!season) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["Season is required"] }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["No fixture file supplied"] }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName =
    workbook.SheetNames.find((name) => name.trim().toLowerCase() === "fixturekey") ?? workbook.SheetNames[0];

  if (!sheetName) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["No sheets found in workbook"] }, { status: 400 });
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });

  if (rows.length === 0) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["No fixture rows found in sheet"] }, { status: 400 });
  }

  const db = createAdminSupabaseClient() ?? supabase;

  const { data: teamsData, error: teamsError } = await db.from("teams").select("abbrev, full_name, name");
  if (teamsError) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: [teamsError.message] }, { status: 500 });
  }

  const teams = (teamsData ?? []) as TeamRow[];
  if (teams.length === 0) {
    return NextResponse.json(
      { success: false, rowsProcessed: 0, errors: ["No teams found. Upload team map before fixtures."] },
      { status: 400 }
    );
  }

  const errors: string[] = [];
  const upserts: Array<{ season: string; gameweek: number; home_team: string; away_team: string; kickoff_at: string | null }> = [];

  rows.forEach((row, index) => {
    const gameweekRaw = getCellValue(row, ["Gameweek", "gameweek", "Round Number", "round number", "Round", "round"]);
    const homeRaw = getCellValue(row, ["Home", "home", "Home Team", "home team"]);
    const awayRaw = getCellValue(row, ["Away", "away", "Away Team", "away team"]);
    const kickoffRaw = getCellRawValue(row, [
      "Kickoff",
      "kickoff",
      "Kickoff Time",
      "kickoff_time",
      "Kick Off",
      "kick off",
      "Datetime",
      "datetime",
      "Date",
      "date",
    ]);

    const gameweek = Number(gameweekRaw);
    if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
      errors.push(`Row ${index + 2}: invalid gameweek '${gameweekRaw}'`);
      return;
    }

    if (!homeRaw || !awayRaw) {
      errors.push(`Row ${index + 2}: missing Home or Away value`);
      return;
    }

    const homeResult = resolveTeamAbbrev(homeRaw, teams);
    if (!homeResult.abbrev) {
      errors.push(`Row ${index + 2}: could not match Home '${homeRaw}' (${homeResult.reason})`);
      return;
    }

    const awayResult = resolveTeamAbbrev(awayRaw, teams);
    if (!awayResult.abbrev) {
      errors.push(`Row ${index + 2}: could not match Away '${awayRaw}' (${awayResult.reason})`);
      return;
    }

    const kickoffAt = parseKickoffValue(kickoffRaw);
    if (kickoffRaw !== undefined && kickoffRaw !== null && String(kickoffRaw).trim() !== "" && !kickoffAt) {
      errors.push(`Row ${index + 2}: invalid kickoff '${String(kickoffRaw).trim()}'`);
      return;
    }

    upserts.push({
      season,
      gameweek,
      home_team: homeResult.abbrev.toUpperCase(),
      away_team: awayResult.abbrev.toUpperCase(),
      kickoff_at: kickoffAt,
    });
  });

  if (upserts.length === 0) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: errors.length ? errors : ["No valid fixture rows"] }, { status: 400 });
  }

  let error =
    (
      await db.from("fixtures").upsert(upserts, {
        onConflict: "season,gameweek,home_team",
      })
    ).error;

  if (error?.message.includes("kickoff_at")) {
    const fallbackUpserts = upserts.map(({ kickoff_at: _kickoffAt, ...fixture }) => fixture);
    error = (
      await db.from("fixtures").upsert(fallbackUpserts, {
        onConflict: "season,gameweek,home_team",
      })
    ).error;
  }

  if (error) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: [error.message, ...errors] }, { status: 500 });
  }

  return NextResponse.json({ success: true, rowsProcessed: upserts.length, errors });
}
