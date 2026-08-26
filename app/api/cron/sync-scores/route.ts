import { NextResponse } from "next/server";
import { FANTRAX_POSITIONS, getCurrentGameweek, syncFantraxScores } from "@/lib/fantrax/sync-scores";
import { getCurrentSeason } from "@/lib/season/current";
import { recomputePlayerSummaries } from "@/lib/portal/summaryRecompute";
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

    // Recompute the precomputed Players/Stats/Draft Tool/Player Detail
    // summaries for this season now that new scores have landed. This is
    // logged as its own job so a recompute failure (stale summaries) is
    // visible separately from a raw score-sync failure.
    try {
      await recomputePlayerSummaries(season);
      const recomputeNow = new Date().toISOString();
      await supabase.from("sync_log").upsert(
        {
          job: "player-summary-recompute",
          last_run_at: recomputeNow,
          last_success_at: recomputeNow,
          status: "success",
          gameweek,
          error: null,
        },
        { onConflict: "job" }
      );
    } catch (recomputeError) {
      // Raw scores synced fine — only the recompute step failed. Log and
      // report that distinctly instead of falling into the catch block
      // below, which would otherwise overwrite the "fantrax-score-sync"
      // heartbeat we just marked as successful.
      const recomputeMessage =
        recomputeError instanceof Error ? recomputeError.message : "Failed to recompute player summaries.";
      await supabase.from("sync_log").upsert(
        {
          job: "player-summary-recompute",
          last_run_at: new Date().toISOString(),
          status: "error",
          gameweek,
          error: recomputeMessage,
        },
        { onConflict: "job" }
      );

      return NextResponse.json(
        { ok: false, season, gameweek, positionsSynced, error: `Scores synced but summary recompute failed: ${recomputeMessage}` },
        { status: 500 }
      );
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
