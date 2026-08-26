import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { FANTRAX_POSITIONS, getCurrentGameweek, syncFantraxScores } from "@/lib/fantrax/sync-scores";
import { recomputePlayerSummaries } from "@/lib/portal/summaryRecompute";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// The recompute step this route triggers can take a while as the
// season's gameweek count grows — give this route more room than the
// platform default before it gets killed. Vercel caps this to whatever
// the hosting plan allows, so it's safe to ask for more than needed.
export const maxDuration = 300;

async function isAuthorizedAdmin() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdminEmail(user.email)) {
    return false;
  }

  return true;
}

export async function GET() {
  if (!(await isAuthorizedAdmin())) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const currentGameweek = await getCurrentGameweek();
    return NextResponse.json({ success: true, currentGameweek });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve current gameweek.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAuthorizedAdmin())) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      gameweek?: number;
      positionOrGroup?: string;
      season?: string;
      syncAllPositions?: boolean;
    };
    const gameweek = Number(body.gameweek ?? 0);
    const positionOrGroup = String(body.positionOrGroup ?? "").trim();
    const requestedSeason = typeof body.season === "string" ? body.season.trim() : "";
    const syncAllPositions = body.syncAllPositions === true;

    if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
      return NextResponse.json(
        { success: false, message: "Gameweek must be an integer between 1 and 38." },
        { status: 400 }
      );
    }

    if (!syncAllPositions && !FANTRAX_POSITIONS.includes(positionOrGroup as (typeof FANTRAX_POSITIONS)[number])) {
      return NextResponse.json({ success: false, message: "Invalid Fantrax position group." }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    if (!admin) {
      return NextResponse.json({ success: false, message: "SUPABASE_SERVICE_ROLE_KEY is required for Fantrax sync." }, { status: 500 });
    }

    const { data: seasons, error: seasonsError } = await admin.from("seasons").select("id, is_current");
    if (seasonsError) {
      throw new Error(`Unable to load seasons: ${seasonsError.message}`);
    }

    const currentSeasons = (seasons ?? []).filter((season) => season.is_current);
    if (currentSeasons.length !== 1) {
      throw new Error(`Expected exactly one current season; found ${currentSeasons.length}.`);
    }

    const originalSeason = currentSeasons[0].id;
    const targetSeason = requestedSeason || originalSeason;
    if (!(seasons ?? []).some((season) => season.id === targetSeason)) {
      return NextResponse.json({ success: false, message: `Unknown season: ${targetSeason}` }, { status: 400 });
    }

    let operationError: unknown = null;

    try {
      if (targetSeason !== originalSeason) {
        const { error: closeOriginalError } = await admin.from("seasons").update({ is_current: false }).eq("id", originalSeason);
        if (closeOriginalError) throw new Error(`Unable to close ${originalSeason}: ${closeOriginalError.message}`);

        const { error: openTargetError } = await admin.from("seasons").update({ is_current: true }).eq("id", targetSeason);
        if (openTargetError) throw new Error(`Unable to open ${targetSeason}: ${openTargetError.message}`);
      }

      const positionGroups = syncAllPositions
        ? [...FANTRAX_POSITIONS]
        : [positionOrGroup as (typeof FANTRAX_POSITIONS)[number]];
      const results = [];

      for (const positionGroup of positionGroups) {
        results.push(await syncFantraxScores(gameweek, positionGroup, requestedSeason || undefined));
      }

      await recomputePlayerSummaries(targetSeason);

      if (!syncAllPositions) {
        return NextResponse.json({ success: true, ...results[0] });
      }

      return NextResponse.json({
        success: true,
        gameweek,
        season: targetSeason,
        positionResults: results,
        playersSynced: results.reduce((total, result) => total + result.playersSynced, 0),
        unmatchedFantraxIds: Array.from(new Set(results.flatMap((result) => result.unmatchedFantraxIds))),
      });
    } catch (error) {
      operationError = error;
      throw error;
    } finally {
      if (targetSeason !== originalSeason) {
        try {
          const { error: closeTargetError } = await admin.from("seasons").update({ is_current: false }).eq("id", targetSeason);
          if (closeTargetError) throw new Error(`Unable to close ${targetSeason}: ${closeTargetError.message}`);

          const { error: restoreOriginalError } = await admin.from("seasons").update({ is_current: true }).eq("id", originalSeason);
          if (restoreOriginalError) throw new Error(`Unable to restore ${originalSeason}: ${restoreOriginalError.message}`);

          const { data: restoredCurrent, error: verifyRestoreError } = await admin
            .from("seasons")
            .select("id")
            .eq("is_current", true);
          if (verifyRestoreError || restoredCurrent?.length !== 1 || restoredCurrent[0].id !== originalSeason) {
            throw new Error("Current-season restoration verification failed.");
          }
        } catch (restoreError) {
          const restoreMessage = restoreError instanceof Error ? restoreError.message : "Unknown restoration error.";
          const operationMessage = operationError instanceof Error ? operationError.message : null;
          throw new Error(
            operationMessage
              ? `Sync failed and season restoration also failed: ${operationMessage}; ${restoreMessage}`
              : `Sync completed but season restoration failed: ${restoreMessage}`
          );
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync Fantrax scores.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
