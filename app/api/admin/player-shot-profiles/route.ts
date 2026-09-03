import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { computePlayerShotProfiles } from "@/lib/projections/playerShotProfile";
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
    const { profiles, unmappedBsdPlayerIds } = await computePlayerShotProfiles(db);
    return NextResponse.json({ profiles, unmappedBsdPlayerIds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compute player shot profiles";
    return NextResponse.json({ message }, { status: 500 });
  }
}
