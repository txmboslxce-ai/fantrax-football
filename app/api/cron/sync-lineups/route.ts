import { NextResponse } from "next/server";
import { syncRotowireLineups } from "@/lib/rotowire/sync";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is required for lineup sync." },
      { status: 500 }
    );
  }

  try {
    const result = await syncRotowireLineups();
    const now = new Date().toISOString();

    // Unmatched teams/players don't fail the run -- they're logged so gaps
    // in the team/player name mapping are visible without blocking the rows
    // that did resolve from also landing.
    await supabase.from("sync_log").upsert(
      {
        job: "rotowire-lineup-sync",
        last_run_at: now,
        last_success_at: now,
        status: "success",
        error:
          result.unmatchedTeams.length || result.unmatchedPlayers.length
            ? `Unmatched teams: ${result.unmatchedTeams.join(", ") || "none"}; unmatched players: ${
                result.unmatchedPlayers.join(", ") || "none"
              }`.slice(0, 2000)
            : null,
      },
      { onConflict: "job" }
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync RotoWire lineups.";

    await supabase.from("sync_log").upsert(
      { job: "rotowire-lineup-sync", last_run_at: new Date().toISOString(), status: "error", error: message },
      { onConflict: "job" }
    );

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
