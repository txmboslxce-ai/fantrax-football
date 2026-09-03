import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { computeTeamStrengthRatings } from "@/lib/projections/teamStrength";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdminEmail(user.email)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminSupabaseClient() ?? supabase;

  try {
    const ratings = await computeTeamStrengthRatings(db);
    const teams = Array.from(ratings.values()).sort((a, b) => a.teamAbbrev.localeCompare(b.teamAbbrev));
    return NextResponse.json({ teams });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compute team strength ratings";
    return NextResponse.json({ message }, { status: 500 });
  }
}
