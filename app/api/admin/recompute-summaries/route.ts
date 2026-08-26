import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { recomputePlayerSummaries } from "@/lib/portal/summaryRecompute";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// A full, completed season can take a while to recompute (see
// lib/portal/summaryRecompute.ts) — give this route more room than the
// platform default before it gets killed. Vercel caps this to whatever
// the hosting plan allows, so it's safe to ask for more than needed.
export const maxDuration = 300;

// Manual/backfill trigger for the precomputed Players/Stats/Draft
// Tool/Player Detail summary tables. The 6-hourly score sync already
// triggers this automatically for whatever season it just synced — this
// endpoint exists for:
//   1. The one-time backfill of past seasons (their raw scores never
//      change again, so they only need to be recomputed once).
//   2. Re-running a season on demand if a recompute ever fails or a
//      correction is applied outside the normal sync flow.
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdminEmail(user.email)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { season?: string };
    const season = typeof body.season === "string" ? body.season.trim() : "";

    if (!season) {
      return NextResponse.json({ success: false, message: "A season is required, e.g. { \"season\": \"2025-26\" }." }, { status: 400 });
    }

    const result = await recomputePlayerSummaries(season);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to recompute player summaries.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
