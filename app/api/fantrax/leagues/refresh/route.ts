import { NextResponse } from "next/server";
import { decryptSecretId } from "@/lib/fantrax/secret-crypto";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type FantraxLeague = {
  leagueName?: string;
  teamName?: string;
  leagueId?: string;
  teamId?: string;
  sport?: string;
};

export async function POST() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("fantrax_secret_id_encrypted")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ message: `Failed to load Fantrax connection: ${profileError.message}` }, { status: 500 });
  }

  if (!profile?.fantrax_secret_id_encrypted) {
    return NextResponse.json({ message: "Not connected" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json({ message: "SUPABASE_SERVICE_ROLE_KEY is required for Fantrax refresh." }, { status: 500 });
  }

  try {
    const secretId = decryptSecretId(profile.fantrax_secret_id_encrypted);
    const response = await fetch(
      `https://www.fantrax.com/fxea/general/getLeagues?userSecretId=${encodeURIComponent(secretId)}`,
      { method: "GET", cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`Fantrax leagues API returned ${response.status}.`);
    }

    const payload = (await response.json()) as { leagues?: FantraxLeague[] };
    const leagues = (payload.leagues ?? []).filter(
      (league): league is FantraxLeague & { leagueId: string; leagueName: string } =>
        typeof league.leagueId === "string" && Boolean(league.leagueId.trim()) &&
        typeof league.leagueName === "string" && Boolean(league.leagueName.trim())
    );
    if (leagues.length === 0) {
      throw new Error("No leagues found for the stored Fantrax Secret ID.");
    }

    const { error: upsertError } = await admin.from("user_fantrax_leagues").upsert(
      leagues.map((league) => ({
        profile_id: user.id,
        league_id: league.leagueId.trim(),
        league_name: league.leagueName.trim(),
        team_id: typeof league.teamId === "string" && league.teamId.trim() ? league.teamId.trim() : null,
        team_name: typeof league.teamName === "string" && league.teamName.trim() ? league.teamName.trim() : null,
        sport: typeof league.sport === "string" && league.sport.trim() ? league.sport.trim() : null,
        last_synced_at: new Date().toISOString(),
      })),
      { onConflict: "profile_id,league_id" }
    );
    if (upsertError) {
      throw new Error(`Failed to save Fantrax leagues: ${upsertError.message}`);
    }

    return NextResponse.json({ leagues });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refresh Fantrax leagues.";
    return NextResponse.json({ message }, { status: 502 });
  }
}
