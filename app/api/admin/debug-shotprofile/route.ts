import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { computePlayerShotProfiles } from "@/lib/projections/playerShotProfile";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// Temporary diagnostic: two shrinkage fixes to playerShotProfile.ts in a
// row barely moved Kostoulas's projection (17.55 -> 17.54), which is
// suspicious enough to want the actual live numbers rather than guess
// again whether the deploy has the latest code or the pooled-season
// baseline just isn't as low as expected. Returns his full computed shot
// profile as computePlayerShotProfiles actually produces it right now.
// Remove once resolved.
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdminEmail(user.email)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const playerName = new URL(request.url).searchParams.get("player");
  if (!playerName) {
    return NextResponse.json({ message: "Missing ?player=" }, { status: 400 });
  }

  const db = createAdminSupabaseClient() ?? supabase;

  const { profiles } = await computePlayerShotProfiles(db);
  const profile = profiles.find((p) => p.playerName === playerName);
  if (!profile) {
    return NextResponse.json({ message: `No shot profile for "${playerName}"` }, { status: 404 });
  }

  return NextResponse.json({ profile, deployedAt: new Date().toISOString() });
}
