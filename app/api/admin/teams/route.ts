import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { isAdminEmail } from "@/lib/admin";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const MAX_XLSX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_XLSX_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
  "",
]);

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
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["No team file supplied"] }, { status: 400 });
  }

  if (file.size > MAX_XLSX_BYTES) {
    return NextResponse.json(
      { success: false, rowsProcessed: 0, errors: [`File exceeds ${MAX_XLSX_BYTES / (1024 * 1024)} MB limit`] },
      { status: 413 }
    );
  }

  const lowerName = file.name.toLowerCase();
  if (!ALLOWED_XLSX_TYPES.has(file.type) && !lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
    return NextResponse.json(
      { success: false, rowsProcessed: 0, errors: [`Unsupported file type '${file.type || "unknown"}'; upload an .xlsx file`] },
      { status: 415 }
    );
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName =
    workbook.SheetNames.find((name) => name.trim().toLowerCase() === "teammap") ?? workbook.SheetNames[0];

  if (!sheetName) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["No sheets found in workbook"] }, { status: 400 });
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });

  if (rows.length === 0) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["No team rows found in sheet"] }, { status: 400 });
  }

  const upserts = rows
    .map((row) => ({
      abbrev: getCellValue(row, ["TeamAbbrev", "teamabbrev", "abbrev", "Abbrev"]).toUpperCase(),
      name: getCellValue(row, ["TeamName", "teamname", "name", "Name"]),
      full_name: getCellValue(row, ["TeamFullName", "teamfullname", "full_name", "Full Name", "FullName"]),
    }))
    .filter((row) => row.abbrev && row.name && row.full_name);

  if (upserts.length === 0) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["No valid team rows"] }, { status: 400 });
  }

  const db = createAdminSupabaseClient() ?? supabase;
  const { error } = await db.from("teams").upsert(upserts, { onConflict: "abbrev" });

  if (error) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: [error.message] }, { status: 500 });
  }

  return NextResponse.json({ success: true, rowsProcessed: upserts.length, errors: [] });
}
