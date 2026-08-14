import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { syncMultiPositions } from "@/lib/fantrax/sync-players";
import { createServerSupabaseClient } from "@/lib/supabase-server";

async function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return true;
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  return !authError && Boolean(user) && isAdminEmail(user?.email);
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncMultiPositions();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync Fantrax multi-position data.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
