import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin";

type OverrideEntry = {
  player_id: string;
  start_probability: number;
};

type RequestBody = {
  season: string;
  gameweek: number;
  overrides: OverrideEntry[];
};

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const { season, gameweek, overrides } = body;

  if (!season || !gameweek || !Array.isArray(overrides) || overrides.length === 0) {
    return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
  }

  // Upsert each override into player_predictions — updating start_probability only
  const errors: string[] = [];

  for (const entry of overrides) {
    if (!entry.player_id || typeof entry.start_probability !== "number") continue;

    const sp = Math.min(1, Math.max(0, entry.start_probability));

    const { error } = await supabase
      .from("player_predictions")
      .update({ start_probability: sp })
      .eq("player_id", entry.player_id)
      .eq("season", season)
      .eq("gameweek", gameweek);

    if (error) {
      errors.push(`${entry.player_id}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { message: `Some overrides failed: ${errors.join(", ")}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
