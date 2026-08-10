import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { error: rosterError } = await supabase
    .from("league_rosters")
    .delete()
    .eq("profile_id", user.id);

  if (rosterError) {
    return NextResponse.json({ message: "Failed to clear league roster data." }, { status: 500 });
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      fantrax_league_id: null,
      fantrax_league_last_synced_at: null,
      fantrax_team_id: null,
      fantrax_team_name: null,
    })
    .eq("id", user.id);

  if (profileError) {
    return NextResponse.json({ message: "Failed to clear league connection." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
