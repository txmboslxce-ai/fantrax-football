import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { PRIOR_SEASON, FIXTURES_SEASON } from "@/lib/season/fixtures";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchAllRows } from "@/lib/supabase/fetchAllRows";

// Temporary diagnostic: runs the exact same whole-season player_gameweeks
// fetch computeGameweekProjections uses (see playerProjection.ts), then
// reports what it actually finds for one named player -- both via the
// production code path (paginate the whole league, aggregate, look this
// player up) and via a trivially-correct direct fetch (filtered straight to
// their player_id) as a ground truth to compare against. Confirmed live:
// three separate production recomputes after a fix that should have moved
// a specific player's number produced byte-identical output, which only
// makes sense if the production path still isn't seeing their real
// prior-season history -- this pins down whether that's still a fetch
// problem or something else entirely, without guessing from CSV output
// alone. Remove once this is resolved.
type PlayerGameweekRow = {
  player_id: string;
  gameweek: number;
  games_played: number | null;
  minutes_played: number | null;
  key_passes: number | null;
};

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

  const { data: playerRows, error: playerError } = await db.from("players").select("id, name, team, position").eq("name", playerName);
  if (playerError) {
    return NextResponse.json({ message: playerError.message }, { status: 500 });
  }
  if (!playerRows || playerRows.length === 0) {
    return NextResponse.json({ message: `No player named "${playerName}"` }, { status: 404 });
  }
  if (playerRows.length > 1) {
    return NextResponse.json({ message: `Multiple players named "${playerName}"`, playerRows });
  }
  const player = playerRows[0];

  // Ground truth: fetch this one player's rows directly, filtered by their
  // own player_id -- trivially small, no pagination risk, nothing for this
  // query to get wrong.
  const { data: directRows, error: directError } = await db
    .from("player_gameweeks")
    .select("player_id, gameweek, games_played, minutes_played, key_passes")
    .eq("season", PRIOR_SEASON)
    .eq("player_id", player.id);
  if (directError) {
    return NextResponse.json({ message: directError.message }, { status: 500 });
  }
  const direct = (directRows ?? []) as PlayerGameweekRow[];
  const directTotals = direct.reduce(
    (acc, row) => {
      if ((row.games_played ?? 0) > 0) {
        acc.minutes += row.minutes_played ?? 0;
        acc.keyPasses += row.key_passes ?? 0;
        acc.games += 1;
      }
      return acc;
    },
    { minutes: 0, keyPasses: 0, games: 0 }
  );

  // Production path: the exact same paginated whole-league, whole-season
  // fetch computeGameweekProjections uses, then find this player in it.
  const allPriorSeasonRows = await fetchAllRows<PlayerGameweekRow>((from, to) =>
    db
      .from("player_gameweeks")
      .select("player_id, gameweek, games_played, minutes_played, key_passes")
      .eq("season", PRIOR_SEASON)
      .range(from, to)
  );
  const viaProductionPath = allPriorSeasonRows.filter((row) => row.player_id === player.id);
  const productionTotals = viaProductionPath.reduce(
    (acc, row) => {
      if ((row.games_played ?? 0) > 0) {
        acc.minutes += row.minutes_played ?? 0;
        acc.keyPasses += row.key_passes ?? 0;
        acc.games += 1;
      }
      return acc;
    },
    { minutes: 0, keyPasses: 0, games: 0 }
  );

  return NextResponse.json({
    player,
    priorSeason: PRIOR_SEASON,
    fixturesSeason: FIXTURES_SEASON,
    totalPriorSeasonRowsFetched: allPriorSeasonRows.length,
    directGroundTruth: directTotals,
    viaProductionPaginatedFetch: productionTotals,
    matchesGroundTruth: directTotals.minutes === productionTotals.minutes && directTotals.keyPasses === productionTotals.keyPasses,
  });
}
