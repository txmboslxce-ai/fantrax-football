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

function getCellValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return String(record[key]).trim();
    }
  }
  return "";
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function resolveTeamAbbrev(teamNameRaw: string, teams: TeamRow[]): { abbrev: string | null; reason?: string } {
  const teamName = normalize(teamNameRaw);
  if (!teamName) {
    return { abbrev: null, reason: "empty team name" };
  }

  const exactFullName = teams.find((team) => normalize(team.full_name ?? "") === teamName);
  if (exactFullName) {
    return { abbrev: exactFullName.abbrev };
  }

  const exactName = teams.find((team) => normalize(team.name ?? "") === teamName);
  if (exactName) {
    return { abbrev: exactName.abbrev };
  }

  const partialMatches = teams.filter((team) => {
    const fullName = normalize(team.full_name ?? "");
    const shortName = normalize(team.name ?? "");

    return (
      (fullName && (fullName.includes(teamName) || teamName.includes(fullName))) ||
      (shortName && (shortName.includes(teamName) || teamName.includes(shortName)))
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
  const upserts: Array<{ season: string; gameweek: number; home_team: string; away_team: string }> = [];

  rows.forEach((row, index) => {
    const gameweekRaw = getCellValue(row, ["Gameweek", "gameweek"]);
    const homeRaw = getCellValue(row, ["Home", "home"]);
    const awayRaw = getCellValue(row, ["Away", "away"]);

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

    upserts.push({
      season,
      gameweek,
      home_team: homeResult.abbrev.toUpperCase(),
      away_team: awayResult.abbrev.toUpperCase(),
    });
  });

  if (upserts.length === 0) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: errors.length ? errors : ["No valid fixture rows"] }, { status: 400 });
  }

  const { error } = await db.from("fixtures").upsert(upserts, { onConflict: "season,gameweek,home_team" });

  if (error) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: [error.message, ...errors] }, { status: 500 });
  }

  return NextResponse.json({ success: true, rowsProcessed: upserts.length, errors });
}
