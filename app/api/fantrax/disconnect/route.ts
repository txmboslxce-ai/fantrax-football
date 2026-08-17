import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json({ message: "SUPABASE_SERVICE_ROLE_KEY is required for Fantrax disconnect." }, { status: 500 });
  }

  const { error: rosterError } = await admin.from("league_rosters").delete().eq("profile_id", user.id);
  if (rosterError) {
    return NextResponse.json({ message: "Failed to clear Fantrax roster data." }, { status: 500 });
  }

  const { error: leaguesError } = await admin.from("user_fantrax_leagues").delete().eq("profile_id", user.id);
  if (leaguesError) {
    return NextResponse.json({ message: "Failed to clear Fantrax league data." }, { status: 500 });
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      fantrax_secret_id_encrypted: null,
      fantrax_secret_connected_at: null,
      fantrax_league_id: null,
      fantrax_team_id: null,
      fantrax_team_name: null,
    })
    .eq("id", user.id);

  if (profileError) {
    return NextResponse.json({ message: "Failed to clear Fantrax connection." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
