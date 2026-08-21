import { NextResponse } from "next/server";
import { FANTRAX_POSITIONS, getCurrentGameweek, syncFantraxScores } from "@/lib/fantrax/sync-scores";
import { getCurrentSeason } from "@/lib/season/current";
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
    return NextResponse.json(
      { ok: false, season: null, gameweek: null, positionsSynced: 0, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        season: null,
        gameweek: null,
        positionsSynced: 0,
        error: "SUPABASE_SERVICE_ROLE_KEY is required for Fantrax sync.",
      },
      { status: 500 }
    );
  }

  let season: string | null = null;
  let gameweek: number | null = null;
  let positionsSynced = 0;

  try {
    [season, gameweek] = await Promise.all([getCurrentSeason(supabase), getCurrentGameweek()]);

    for (const positionGroup of FANTRAX_POSITIONS) {
      await syncFantraxScores(gameweek, positionGroup, season);
      positionsSynced += 1;
    }

    const now = new Date().toISOString();
    const { error: heartbeatError } = await supabase.from("sync_log").upsert(
      {
        job: "fantrax-score-sync",
        last_run_at: now,
        last_success_at: now,
        status: "success",
        gameweek,
        error: null,
      },
      { onConflict: "job" }
    );

    if (heartbeatError) {
      throw new Error(`Unable to write score-sync heartbeat: ${heartbeatError.message}`);
    }

    return NextResponse.json({ ok: true, season, gameweek, positionsSynced, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync Fantrax scores.";
    const { error: heartbeatError } = await supabase.from("sync_log").upsert(
      {
        job: "fantrax-score-sync",
        last_run_at: new Date().toISOString(),
        status: "error",
        gameweek,
        error: message,
      },
      { onConflict: "job" }
    );

    if (heartbeatError) {
      console.error(`[cron/sync-scores] Failed to write error heartbeat: ${heartbeatError.message}`);
    }

    return NextResponse.json({ ok: false, season, gameweek, positionsSynced, error: message }, { status: 500 });
  }
}
