import GWOverviewClient from "@/app/portal/gw-overview/GWOverviewClient";
import FixturePlannerClient from "@/app/portal/players/FixturePlannerClient";
import { getGWOverviewData } from "@/app/portal/gw-overview/getGWOverviewData";
import PlayersTableClient from "@/app/portal/players/PlayersTableClient";
import WaiverWireClient from "@/app/portal/players/WaiverWireClient";
import {
  decorateGameweeks,
  mapPosition,
  summarizePlayerWindow,
  type FixtureRow,
  type PlayerGameweekRow,
  type PlayerTableWindowKey,
  type PlayerWindowStats,
} from "@/lib/portal/playerMetrics";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getUserLeagueRoster } from "@/lib/portal/leagueRoster";
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

const PLAYER_ID_BATCH_SIZE = 100;
const FIXTURE_PLANNER_SEASON = "2026-27";
const PLAYER_GAMEWEEK_QUERY_COLUMNS =
  "id, player_id, season, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, clean_sheet, goals_against, saves, key_passes, tackles_won, interceptions, clearances, aerials_won";

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

  const { data: poolRows, error: poolError } = await supabase
    .from("season_player_pool")
    .select("fantrax_id")
    .eq("season", season);

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

  const playerIdBatches = Array.from(
    { length: Math.ceil(playerIds.length / PLAYER_ID_BATCH_SIZE) },
    (_, index) => playerIds.slice(index * PLAYER_ID_BATCH_SIZE, (index + 1) * PLAYER_ID_BATCH_SIZE)
  );

  const [gameweekResults, fixturesResult] = await Promise.all([
    Promise.all(
      playerIdBatches.map((playerIdBatch) =>
        supabase
          .from("player_gameweeks")
          .select(PLAYER_GAMEWEEK_QUERY_COLUMNS)
          .eq("season", season)
          .in("player_id", playerIdBatch)
          .range(0, 40000)
      )
    ),
    supabase.from("fixtures").select("id, season, gameweek, home_team, away_team").eq("season", season),
  ]);

  const gameweeksError = gameweekResults.find((result) => result.error)?.error;
  const fixturesError = fixturesResult.error;
  if (gameweeksError) {
    throw new Error(`Unable to load player gameweeks: ${gameweeksError.message}`);
  }
  if (fixturesError) {
    throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
  }

  const rowsByPlayer = new Map<string, PlayerGameweekRow[]>();
  let latestGameweek = 0;

  for (const row of gameweekResults.flatMap((result) => (result.data ?? []) as PlayerGameweekRow[])) {
    latestGameweek = Math.max(latestGameweek, row.gameweek);
    const existing = rowsByPlayer.get(row.player_id);
    if (existing) {
      existing.push(row);
      continue;
    }

    rowsByPlayer.set(row.player_id, [row]);
  }

  const fixturesByTeam = new Map<string, FixtureRow[]>();
  for (const fixture of (fixturesResult.data ?? []) as FixtureRow[]) {
    const homeTeamFixtures = fixturesByTeam.get(fixture.home_team);
    if (homeTeamFixtures) {
      homeTeamFixtures.push(fixture);
    } else {
      fixturesByTeam.set(fixture.home_team, [fixture]);
    }

    const awayTeamFixtures = fixturesByTeam.get(fixture.away_team);
    if (awayTeamFixtures) {
      awayTeamFixtures.push(fixture);
    } else {
      fixturesByTeam.set(fixture.away_team, [fixture]);
    }
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
      const playerRows = (rowsByPlayer.get(player.id) ?? []).sort((a, b) => a.gameweek - b.gameweek);
      const decoratedRows = decorateGameweeks(playerRows, player.team, fixturesByTeam.get(player.team) ?? []);
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
        windows: { season: summarizePlayerWindow(decoratedRows, position) },
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
  const { availableSeasons, season } = await resolvePortalSeason(supabase, requestedSeason);

  const [playersTableData, formData, leagueRoster] = await Promise.all([
    activeTab === "players" ? getPlayersTableData(season) : Promise.resolve(null),
    activeTab === "form" ? getGWOverviewData() : Promise.resolve(null),
    user ? getUserLeagueRoster(user.id) : Promise.resolve(null),
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
        <PlayersTableClient key={season} players={playersTableData.players} latestGameweek={playersTableData.latestGameweek} leagueRoster={leagueRoster} season={season} availableSeasons={availableSeasons} />
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
        />
      ) : null}

      {activeTab === "waiver" ? <WaiverWireClient leagueRoster={leagueRoster} season={season} /> : null}
      {activeTab === "fixtures" ? <FixturePlannerClient leagueRoster={leagueRoster} season={FIXTURE_PLANNER_SEASON} /> : null}
    </div>
  );
}
