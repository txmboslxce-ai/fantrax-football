import { NextResponse } from "next/server";
import { encryptSecretId } from "@/lib/fantrax/secret-crypto";
import { syncLeagueRosterById } from "@/lib/fantrax/sync-rosters-by-id";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type FantraxLeague = {
  leagueName?: string;
  teamName?: string;
  leagueId?: string;
  teamId?: string;
  sport?: string;
};

type GetLeaguesResponse = {
  leagues?: FantraxLeague[];
};

type ValidatedFantraxLeague = FantraxLeague & {
  leagueId: string;
  leagueName: string;
};

async function getLeagues(secretId: string): Promise<ValidatedFantraxLeague[]> {
  const response = await fetch(
    `https://www.fantrax.com/fxea/general/getLeagues?userSecretId=${encodeURIComponent(secretId)}`,
    { method: "GET", cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`Fantrax leagues API returned ${response.status}.`);
  }

  const payload = (await response.json()) as GetLeaguesResponse;
  const leagues = (payload.leagues ?? []).filter(
    (league): league is ValidatedFantraxLeague =>
      typeof league.leagueId === "string" && Boolean(league.leagueId.trim()) &&
      typeof league.leagueName === "string" && Boolean(league.leagueName.trim())
  );

  if (leagues.length === 0) {
    throw new Error("No leagues found for this Fantrax Secret ID.");
  }

  return leagues;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let secretId: string;
  try {
    const body = (await request.json()) as { secretId?: unknown };
    if (typeof body.secretId !== "string" || !body.secretId.trim()) {
      return NextResponse.json({ message: "Missing or invalid secretId" }, { status: 400 });
    }
    secretId = body.secretId.trim();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json({ message: "SUPABASE_SERVICE_ROLE_KEY is required for Fantrax connection." }, { status: 500 });
  }

  try {
    const leagues = await getLeagues(secretId);
    const { error: profileError } = await admin
      .from("profiles")
      .update({
        fantrax_secret_id_encrypted: encryptSecretId(secretId),
        fantrax_secret_connected_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileError) {
      throw new Error(`Failed to store Fantrax connection: ${profileError.message}`);
    }

    const now = new Date().toISOString();
    const { error: upsertError } = await admin.from("user_fantrax_leagues").upsert(
      leagues.map((league) => ({
        profile_id: user.id,
        league_id: league.leagueId.trim(),
        league_name: league.leagueName.trim(),
        team_id: typeof league.teamId === "string" && league.teamId.trim() ? league.teamId.trim() : null,
        team_name: typeof league.teamName === "string" && league.teamName.trim() ? league.teamName.trim() : null,
        sport: typeof league.sport === "string" && league.sport.trim() ? league.sport.trim() : null,
        last_synced_at: now,
      })),
      { onConflict: "profile_id,league_id" }
    );

    if (upsertError) {
      throw new Error(`Failed to save Fantrax leagues: ${upsertError.message}`);
    }

    const syncResults = await Promise.all(
      leagues.map(async (league) => ({
        leagueId: league.leagueId.trim(),
        ...(await syncLeagueRosterById(admin, user.id, league.leagueId.trim())),
      }))
    );
    const activeLeague = leagues.find((league) => typeof league.teamId === "string" && Boolean(league.teamId.trim()));
    const { error: activeLeagueError } = await admin
      .from("profiles")
      .update({
        fantrax_league_id: activeLeague?.leagueId.trim() ?? null,
        fantrax_team_id: activeLeague?.teamId?.trim() ?? null,
        fantrax_team_name: activeLeague?.teamName?.trim() ?? null,
      })
      .eq("id", user.id);

    if (activeLeagueError) {
      throw new Error(`Failed to set active Fantrax league: ${activeLeagueError.message}`);
    }

    return NextResponse.json({ leagues, syncResults });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to connect Fantrax leagues.";
    return NextResponse.json({ message }, { status: 502 });
  }
}
