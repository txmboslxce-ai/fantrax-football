import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getCurrentGameweek, syncFantraxScores } from "@/lib/fantrax/sync-scores";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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
    const body = (await request.json().catch(() => ({}))) as { gameweek?: number };
    const gameweek = Number(body.gameweek ?? 0);

    if (!Number.isInteger(gameweek) || gameweek < 1 || gameweek > 38) {
      return NextResponse.json(
        { success: false, message: "Gameweek must be an integer between 1 and 38." },
        { status: 400 }
      );
    }

    const result = await syncFantraxScores(gameweek);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync Fantrax scores.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
