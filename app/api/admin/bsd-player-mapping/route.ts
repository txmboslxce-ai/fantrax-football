import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { matchCurrentPremierLeaguePlayers } from "@/lib/bsd/matchPlayers";
import type { BsdPlayer } from "@/lib/bsd/players";
import { resolveUnmappedShotPlayers } from "@/lib/bsd/resolveUnmappedShotPlayers";

// matchCurrentPremierLeaguePlayers only offers candidates off BSD's live
// current-team roster fetch, which misses anyone that roster hasn't caught
// up on yet (a very recent transfer) even though they already have real
// shot data on file (see resolveUnmappedShotPlayers). Merged in here so
// they're still reachable for manual mapping instead of just missing.
async function withShotDerivedCandidates(db: SupabaseClient, unmatchedBsdPlayers: BsdPlayer[]): Promise<BsdPlayer[]> {
  const shotDerived = await resolveUnmappedShotPlayers(db).catch(() => [] as BsdPlayer[]);
  const seen = new Set(unmatchedBsdPlayers.map((player) => player.id));
  return [...unmatchedBsdPlayers, ...shotDerived.filter((player) => !seen.has(player.id))];
}

async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdminEmail(user.email)) {
    return { ok: false as const };
  }

  return { ok: true as const, supabase };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminSupabaseClient() ?? auth.supabase;

  try {
    const { matches, unmatchedBsdPlayers, unmatchedFantraxPlayers } = await matchCurrentPremierLeaguePlayers(db);
    const allUnmatchedBsdPlayers = await withShotDerivedCandidates(db, unmatchedBsdPlayers);
    return NextResponse.json({ pendingAutoMatches: matches.length, unmatchedBsdPlayers: allUnmatchedBsdPlayers, unmatchedFantraxPlayers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compute BSD player matches";
    return NextResponse.json({ message }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminSupabaseClient() ?? auth.supabase;

  let body: { action?: unknown; playerId?: unknown; bsdId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  if (body.action === "auto") {
    let result: Awaited<ReturnType<typeof matchCurrentPremierLeaguePlayers>>;
    try {
      result = await matchCurrentPremierLeaguePlayers(db);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to compute BSD player matches";
      return NextResponse.json({ message }, { status: 502 });
    }

    let updatedCount = 0;
    for (const match of result.matches) {
      const { error } = await db.from("players").update({ bsd_id: match.bsdId }).eq("id", match.playerId);
      if (error) {
        return NextResponse.json(
          { message: `Auto-match wrote ${updatedCount} of ${result.matches.length} matches, then failed on ${match.playerName}: ${error.message}` },
          { status: 500 }
        );
      }
      updatedCount += 1;
    }

    const allUnmatchedBsdPlayers = await withShotDerivedCandidates(db, result.unmatchedBsdPlayers);

    return NextResponse.json({
      updatedCount,
      unmatchedBsdPlayers: allUnmatchedBsdPlayers,
      unmatchedFantraxPlayers: result.unmatchedFantraxPlayers,
    });
  }

  const playerId = body.playerId;
  const bsdId = body.bsdId;

  if (typeof playerId !== "string" || !playerId || typeof bsdId !== "number" || !Number.isInteger(bsdId)) {
    return NextResponse.json({ message: "Missing or invalid playerId/bsdId" }, { status: 400 });
  }

  const { data: existingForBsdId, error: existingError } = await db.from("players").select("id, name").eq("bsd_id", bsdId).maybeSingle();

  if (existingError) {
    return NextResponse.json({ message: existingError.message }, { status: 500 });
  }

  if (existingForBsdId) {
    return NextResponse.json({ message: `bsd_id ${bsdId} is already mapped to ${existingForBsdId.name}` }, { status: 409 });
  }

  const { error: updateError } = await db.from("players").update({ bsd_id: bsdId }).eq("id", playerId);

  if (updateError) {
    return NextResponse.json({ message: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
