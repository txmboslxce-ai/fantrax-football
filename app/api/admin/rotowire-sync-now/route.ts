import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { syncRotowireLineups } from "@/lib/rotowire/sync";
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
    const result = await syncRotowireLineups();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync RotoWire lineups.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
