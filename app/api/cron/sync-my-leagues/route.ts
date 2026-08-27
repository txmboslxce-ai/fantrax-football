import { NextResponse } from "next/server";
import { syncLeagueRosterById } from "@/lib/fantrax/sync-rosters-by-id";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

// Fans out over every user-connected Fantrax league, so give it room to run
// through a large batch before the platform kills it.
export const maxDuration = 300;

// Cap how many leagues we sync concurrently so we don't hammer Fantrax's
// API or the DB with an unbounded Promise.all when the user base grows.
const CONCURRENCY = 5;

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

type UserLeagueRow = {
  profile_id: string;
  league_id: string;
};

async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, synced: 0, failed: 0, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, synced: 0, failed: 0, error: "SUPABASE_SERVICE_ROLE_KEY is required for Fantrax sync." },
      { status: 500 }
    );
  }

  const { data: rows, error: rowsError } = await supabase
    .from("user_fantrax_leagues")
    .select("profile_id, league_id");

  if (rowsError) {
    const message = `Failed to load connected leagues: ${rowsError.message}`;
    await supabase.from("sync_log").upsert(
      { job: "my-league-roster-sync", last_run_at: new Date().toISOString(), status: "error", error: message },
      { onConflict: "job" }
    );
    return NextResponse.json({ ok: false, synced: 0, failed: 0, error: message }, { status: 500 });
  }

  const leagueRows = (rows ?? []) as UserLeagueRow[];
  const failures: string[] = [];
  let synced = 0;

  await runWithConcurrency(leagueRows, CONCURRENCY, async (row) => {
    try {
      await syncLeagueRosterById(supabase, row.profile_id, row.league_id);
      const now = new Date().toISOString();

      await supabase.from("user_fantrax_leagues").update({ last_synced_at: now }).eq("profile_id", row.profile_id).eq("league_id", row.league_id);

      await supabase
        .from("profiles")
        .update({ fantrax_league_last_synced_at: now })
        .eq("id", row.profile_id)
        .eq("fantrax_league_id", row.league_id);

      synced += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sync league roster.";
      failures.push(`${row.profile_id}/${row.league_id}: ${message}`);
    }
  });

  const now = new Date().toISOString();
  const status = failures.length === 0 ? "success" : "error";
  await supabase.from("sync_log").upsert(
    {
      job: "my-league-roster-sync",
      last_run_at: now,
      ...(synced > 0 ? { last_success_at: now } : {}),
      status,
      error: failures.length ? failures.join("; ").slice(0, 2000) : null,
    },
    { onConflict: "job" }
  );

  return NextResponse.json({ ok: failures.length === 0, synced, failed: failures.length, errors: failures });
}
