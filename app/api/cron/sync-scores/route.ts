import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FANTRAX_POSITIONS, getCurrentGameweek, syncFantraxScores } from "@/lib/fantrax/sync-scores";
import { getCurrentSeason } from "@/lib/season/current";
import { FIXTURES_SEASON } from "@/lib/season/fixtures";
import { recomputePlayerSummaries } from "@/lib/portal/summaryRecompute";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

// The recompute step at the end of this route can take a while as the
// season's gameweek count grows — give this route more room than the
// platform default before it gets killed. Vercel caps this to whatever
// the hosting plan allows, so it's safe to ask for more than needed.
export const maxDuration = 300;

// A match is treated as "live" from kickoff through this long after —
// covers 90 minutes plus stoppage time and halftime with some buffer.
const LIVE_WINDOW_MS = (2 * 60 + 15) * 60 * 1000;

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

// Only the tight `?mode=poll` cron tick (every 2 minutes) needs this check —
// the baseline 6-hourly cron always runs regardless. Fails open (treats it
// as live) if the fixtures lookup errors, so a Supabase hiccup can't silently
// starve the sync of a real match window.
async function isMatchLikelyLive(supabase: SupabaseClient, gameweek: number): Promise<boolean> {
  const { data, error } = await supabase
    .from("fixtures")
    .select("kickoff_at")
    .eq("season", FIXTURES_SEASON)
    .eq("gameweek", gameweek)
    .not("kickoff_at", "is", null);

  if (error) {
    console.error(`[cron/sync-scores] Failed to load fixtures for live-match check: ${error.message}`);
    return true;
  }

  const now = Date.now();
  return (data ?? []).some((row) => {
    const kickoff = row.kickoff_at ? new Date(row.kickoff_at as string).getTime() : NaN;
    return Number.isFinite(kickoff) && now >= kickoff && now <= kickoff + LIVE_WINDOW_MS;
  });
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

  const isPollTick = new URL(request.url).searchParams.get("mode") === "poll";

  let season: string | null = null;
  let gameweek: number | null = null;
  let positionsSynced = 0;

  try {
    [season, gameweek] = await Promise.all([getCurrentSeason(supabase), getCurrentGameweek()]);

    if (isPollTick && !(await isMatchLikelyLive(supabase, gameweek))) {
      return NextResponse.json({ ok: true, season, gameweek, positionsSynced: 0, error: null, skipped: "no-live-match" });
    }

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
