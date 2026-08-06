import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { syncFixtures, syncFplPlayerData } from "@/lib/fpl/sync";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdminEmail(user.email)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [playerData, fixtures] = await Promise.all([syncFplPlayerData(), syncFixtures()]);
    return NextResponse.json({ success: true, playerData, fixtures });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync FPL data.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
