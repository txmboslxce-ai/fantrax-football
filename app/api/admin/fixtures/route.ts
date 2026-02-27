import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type FixturePayload = {
  season: string;
  gameweek: number;
  home_team: string;
  away_team: string;
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
  const season = String(body?.season ?? "").trim();
  const rows = Array.isArray(body?.rows) ? (body.rows as FixturePayload[]) : [];

  if (!season) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["Season is required"] }, { status: 400 });
  }

  if (rows.length === 0) {
    return NextResponse.json({ success: false, rowsProcessed: 0, errors: ["No fixture rows supplied"] }, { status: 400 });
  }

  const upserts = rows
    .map((row) => ({
      season,
      gameweek: Number(row.gameweek),
      home_team: String(row.home_team ?? "").trim().toUpperCase(),
      away_team: String(row.away_team ?? "").trim().toUpperCase(),
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
