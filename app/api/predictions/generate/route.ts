import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { generatePredictionsForGameweek } from "@/lib/predictions/prediction-engine";
import { upsertPlayerPredictions } from "@/lib/predictions/upsert";
import { SEASON } from "@/lib/portal/playerMetrics";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type GeneratePredictionsBody = {
  season?: string;
  currentGw?: number;
};

type LatestGwRow = {
  gameweek: number;
};

function parseGameweek(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

export async function POST(request: Request) {
  const isCronInvocation = request.headers.get("x-vercel-cron") === "1";
  const supabase = await createServerSupabaseClient();

  if (!isCronInvocation) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user || !isAdminEmail(user.email)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
  }

  let body: GeneratePredictionsBody = {};
  try {
    body = (await request.json()) as GeneratePredictionsBody;
  } catch {
    body = {};
  }

  const season = String(body.season ?? SEASON).trim() || SEASON;
  const db = createAdminSupabaseClient() ?? supabase;

  let currentGw = parseGameweek(body.currentGw);

  if (currentGw == null) {
    const { data: latestGwData, error: latestGwError } = await db
      .from("player_gameweeks")
      .select("gameweek")
      .eq("season", season)
      .order("gameweek", { ascending: false })
      .limit(1);

    if (latestGwError) {
      return NextResponse.json({ success: false, message: latestGwError.message }, { status: 500 });
    }

    currentGw = ((latestGwData ?? []) as LatestGwRow[])[0]?.gameweek ?? null;
  }

  if (currentGw == null) {
    return NextResponse.json({ success: false, message: "No uploaded gameweek found for this season." }, { status: 400 });
  }

  let predictionsGenerated = 0;

  for (let gw = currentGw + 1; gw <= currentGw + 5; gw += 1) {
    try {
      const predictions = await generatePredictionsForGameweek(db, season, gw, {
        useLineupAdjustments: true,
      });
      predictionsGenerated += await upsertPlayerPredictions(db, predictions);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate predictions";
      return NextResponse.json({ success: false, message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, predictionsGenerated });
}
