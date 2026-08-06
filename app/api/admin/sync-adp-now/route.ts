import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { refreshADP } from "@/lib/fantrax/sync-adp";
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
    const result = await refreshADP();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refresh ADP.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
