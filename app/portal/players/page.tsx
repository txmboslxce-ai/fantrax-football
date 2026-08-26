import GWOverviewClient from "@/app/portal/gw-overview/GWOverviewClient";
import FixturePlannerClient from "@/app/portal/players/FixturePlannerClient";
import { getGWOverviewData } from "@/app/portal/gw-overview/getGWOverviewData";
import PlayersTableClient from "@/app/portal/players/PlayersTableClient";
import WaiverWireClient from "@/app/portal/players/WaiverWireClient";
import { mapPosition, type PlayerTableWindowKey, type PlayerWindowStats } from "@/lib/portal/playerMetrics";
import { emptyWindowStatsRow, fetchPlayerWindowStatsBySeason, toPlayerWindowStats } from "@/lib/portal/summaryAdapters";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getUserLeagueRoster } from "@/lib/portal/leagueRoster";
import { getWatchlistData } from "@/lib/portal/watchlist";
import { resolvePortalSeason } from "@/lib/season/portal-season";
import Link from "next/link";

type PageProps = {
  searchParams?:
    | {
        tab?: string | string[];
        season?: string | string[];
        startGw?: string | string[];
      }
    | Promise<{
        tab?: string | string[];
        season?: string | string[];
        startGw?: string | string[];
      }>;
};

type PlayersTabKey = "players" | "form" | "waiver" | "fixtures";

type PlayerRecord = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  ownershipPct: number;
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
  windows: Partial<Record<PlayerTableWindowKey, PlayerWindowStats>>;
};

type PlayersTableData = {
  players: PlayerRecord[];
  latestGameweek: number;
};

const PLAYER_TABS: Array<{ key: PlayersTabKey; label: string }> = [
  { key: "players", label: "Players" },
  { key: "form", label: "Form Table" },
  { key: "waiver", label: "Waiver Wire XI" },
  { key: "fixtures", label: "Fixture Planner" },
];

const FIXTURE_PLANNER_SEASON = "2026-27";

function parseOwnership(value: string | null): number {
  if (!value) {
    return 0;
  }

  const numeric = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

function toTabKey(value: string | string[] | undefined): PlayersTabKey {
  const raw = Array.isArray(value) ? value[0] : value;
  const tab = raw?.toLowerCase();
  if (tab === "players" || tab === "form" || tab === "waiver" || tab === "fixtures") {
    return tab;
  }
  return "players";
}

async function getPlayersTableData(season: string): Promise<PlayersTableData> {
  const supabase = await createServerSupabaseClient();

  // The summary lookup only needs `season`, not the pool/player rows
  // below, so it can run alongside them instead of waiting in line.
  const [{ data: poolRows, error: poolError }, windowRowByPlayer] = await Promise.all([
    supabase.from("season_player_pool").select("fantrax_id").eq("season", season),
    fetchPlayerWindowStatsBySeason(season, "season"),
  ]);

  if (poolError) {
    throw new Error(`Unable to load the ${season} player pool: ${poolError.message}`);
  }

  const poolFantraxIds = (poolRows ?? []).map((row) => row.fantrax_id as string);
  if (poolFantraxIds.length === 0) {
    return { players: [], latestGameweek: 0 };
  }

  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, name, team, position, ownership_pct, fpl_player_data(chance_of_playing_next_round, status, news)")
    .in("fantrax_id", poolFantraxIds)
    .order("name");

  if (playersError) {
    throw new Error(`Unable to load players: ${playersError.message}`);
  }

  const playerIds = (players ?? []).map((player) => player.id as string);
  if (playerIds.length === 0) {
    return { players: [], latestGameweek: 0 };
  }

  let latestGameweek = 0;
  for (const row of windowRowByPlayer.values()) {
    latestGameweek = Math.max(latestGameweek, row.current_gameweek);
  }

  const records = ((players ?? []) as Array<{
    id: string;
    name: string;
    team: string;
    position: string;
    ownership_pct: string | null;
    fpl_player_data:
      | {
          chance_of_playing_next_round: number | null;
          status: string | null;
          news: string | null;
        }
      | Array<{
          chance_of_playing_next_round: number | null;
          status: string | null;
          news: string | null;
        }>
      | null;
  }>)
    .map((player) => {
      const position = mapPosition(player.position);
      const windowRow = windowRowByPlayer.get(player.id) ?? emptyWindowStatsRow(player.id, season, "season");
      const availabilityRaw = Array.isArray(player.fpl_player_data) ? player.fpl_player_data[0] : player.fpl_player_data;

      return {
        id: player.id,
        name: player.name,
        team: player.team,
        position,
        ownershipPct: parseOwnership(player.ownership_pct),
        chanceOfPlaying: availabilityRaw?.chance_of_playing_next_round ?? null,
        availabilityStatus: availabilityRaw?.status ?? null,
        availabilityNews: availabilityRaw?.news ?? null,
        windows: { season: toPlayerWindowStats(windowRow) },
      };
    })
    .sort((a, b) => b.windows.season!.season_pts - a.windows.season!.season_pts);

  return { players: records, latestGameweek };
}

export default async function PlayersPage({ searchParams }: PageProps) {
  const resolvedSearchParams =
    searchParams && typeof searchParams === "object" && "then" in searchParams ? await searchParams : searchParams;
  const activeTab = toTabKey(resolvedSearchParams?.tab);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const requestedSeason = Array.isArray(resolvedSearchParams?.season) ? resolvedSearchParams.season[0] : resolvedSearchParams?.season;

  // Neither of these depends on the other's result, so they don't need
  // to wait in line — only the profile lookup itself needs `user`.
  const [{ data: profile }, { availableSeasons, season }] = await Promise.all([
    user ? supabase.from("profiles").select("fantrax_league_id").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    resolvePortalSeason(supabase, requestedSeason),
  ]);

  const [playersTableData, formData, leagueRoster, watchlistData] = await Promise.all([
    activeTab === "players" ? getPlayersTableData(season) : Promise.resolve(null),
    activeTab === "form" ? getGWOverviewData() : Promise.resolve(null),
    user ? getUserLeagueRoster(user.id, profile?.fantrax_league_id ?? null) : Promise.resolve(null),
    user ? getWatchlistData(user.id) : Promise.resolve({ watchlistedIds: [], orderById: {} }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">Players</h1>
        <p className="mt-2 text-sm text-brand-dark/70">Season {season} player outputs. Click any row for player detail.</p>
      </div>

      <nav className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ flexWrap: "nowrap" }}>
        {PLAYER_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/portal/players?tab=${tab.key}`}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? "border-brand-greenLight bg-brand-green text-brand-cream"
                : "border-brand-cream/35 bg-brand-dark text-brand-cream hover:bg-brand-greenDark"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {activeTab === "players" && playersTableData ? (
        <PlayersTableClient key={season} players={playersTableData.players} latestGameweek={playersTableData.latestGameweek} leagueRoster={leagueRoster} season={season} availableSeasons={availableSeasons} watchlistedPlayerIds={watchlistData.watchlistedIds} watchlistOrderById={watchlistData.orderById} />
      ) : null}

      {activeTab === "form" && formData ? (
        <GWOverviewClient
          players={formData.players}
          selectedGws={formData.selectedGws}
          teams={formData.teams}
          allGws={formData.allGws}
          season={formData.season}
          fixtures={formData.fixtures}
          leagueRoster={leagueRoster}
          watchlistedPlayerIds={watchlistData.watchlistedIds}
          watchlistOrderById={watchlistData.orderById}
        />
      ) : null}

      {activeTab === "waiver" ? <WaiverWireClient leagueRoster={leagueRoster} season={season} /> : null}
      {activeTab === "fixtures" ? <FixturePlannerClient leagueRoster={leagueRoster} season={FIXTURE_PLANNER_SEASON} /> : null}
    </div>
  );
}
