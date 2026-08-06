import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { syncFantraxPlayers } from "@/lib/fantrax/sync-players";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

async function isAuthorizedAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  return !authError && Boolean(user) && isAdminEmail(user?.email);
}

export async function POST(request: Request) {
  if (!(await isAuthorizedAdmin())) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { season?: unknown };
    const season = typeof body.season === "string" ? body.season.trim() : "";
    if (!season) {
      return NextResponse.json({ success: false, message: "Season is required." }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    if (!admin) {
      return NextResponse.json({ success: false, message: "SUPABASE_SERVICE_ROLE_KEY is required for Fantrax sync." }, { status: 500 });
    }

    const { data: seasonRow, error: seasonError } = await admin.from("seasons").select("id").eq("id", season).maybeSingle();
    if (seasonError) throw new Error(`Unable to load seasons: ${seasonError.message}`);
    if (!seasonRow) {
      return NextResponse.json({ success: false, message: `Unknown season: ${season}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...(await syncFantraxPlayers(season)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync Fantrax players.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
