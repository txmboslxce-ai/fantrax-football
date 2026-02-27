import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type TeamPayload = {
  abbrev: string;
  name: string;
  full_name: string;
};

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

  const body = await request.json();
  const rows = Array.isArray(body?.rows) ? (body.rows as TeamPayload[]) : [];

  if (rows.length === 0) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["No team rows supplied"] }, { status: 400 });
  }

  const upserts = rows
    .map((row) => ({
      abbrev: String(row.abbrev ?? "").trim().toUpperCase(),
      name: String(row.name ?? "").trim(),
      full_name: String(row.full_name ?? "").trim(),
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
