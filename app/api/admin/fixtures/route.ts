import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { isAdminEmail } from "@/lib/admin";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

function getCellValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return String(record[key]).trim();
    }
  }
  return "";
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

  const upserts = rows
    .map((row) => ({
      season,
      gameweek: Number(getCellValue(row, ["Gameweek", "gameweek"])),
      home_team: getCellValue(row, ["HomeAbbrev", "homeabbrev"]).toUpperCase(),
      away_team: getCellValue(row, ["AwayAbbrev", "awayabbrev"]).toUpperCase(),
    }))
    .filter((row) => row.gameweek >= 1 && row.gameweek <= 38 && row.home_team && row.away_team);

  if (upserts.length === 0) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["No valid fixture rows"] }, { status: 400 });
  }

  const db = createAdminSupabaseClient() ?? supabase;
  const { error } = await db.from("fixtures").upsert(upserts, { onConflict: "season,gameweek,home_team" });

  if (error) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: [error.message] }, { status: 500 });
  }

  return NextResponse.json({ success: true, rowsProcessed: upserts.length, errors: [] });
}
