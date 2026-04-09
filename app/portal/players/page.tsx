import GWOverviewClient from "@/app/portal/gw-overview/GWOverviewClient";
import FixturePlannerClient from "@/app/portal/players/FixturePlannerClient";
import { getGWOverviewData } from "@/app/portal/gw-overview/getGWOverviewData";
import PredictionsTab from "@/app/portal/players/components/PredictionsTab";
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
import Link from "next/link";

type PageProps = {
  searchParams?:
    | {
        tab?: string | string[];
        startGw?: string | string[];
      }
    | Promise<{
        tab?: string | string[];
        startGw?: string | string[];
      }>;
};

type PlayersTabKey = "players" | "form" | "waiver" | "fixtures" | "predictions";

type PlayerRecord = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  ownershipPct: number;
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
  windows: Record<PlayerTableWindowKey, PlayerWindowStats>;
};

const SEASON = "2025-26";

const PLAYER_TABS: Array<{ key: PlayersTabKey; label: string }> = [
  { key: "players", label: "Players" },
  { key: "form", label: "Form Table" },
  { key: "waiver", label: "Waiver Wire XI" },
  { key: "fixtures", label: "Fixture Planner" },
  { key: "predictions", label: "Predictions" },
];

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
  if (tab === "players" || tab === "form" || tab === "waiver" || tab === "fixtures" || tab === "predictions") {
    return tab;
  }
  return "players";
}

async function getCurrentGameweek(): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("player_gameweeks")
    .select("gameweek")
    .eq("season", SEASON)
    .order("gameweek", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Unable to load current gameweek: ${error.message}`);
  }

  return Number((data ?? [])[0]?.gameweek ?? 1);
}

async function getPlayersTableData(): Promise<PlayerRecord[]> {
  const supabase = await createServerSupabaseClient();

  const [{ data: players, error: playersError }, { data: gameweeks, error: gameweeksError }, { data: fixtures, error: fixturesError }] =
    await Promise.all([
      supabase
        .from("players")
        .select("id, name, team, position, ownership_pct, fpl_player_data(chance_of_playing_next_round, status, news)")
        .order("name"),
      supabase
        .from("player_gameweeks")
        .select(
          "id, player_id, season, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, clean_sheet, goals_against, saves, key_passes, tackles_won, interceptions, clearances, aerials_won"
        )
        .eq("season", SEASON),
      supabase.from("fixtures").select("id, season, gameweek, home_team, away_team").eq("season", SEASON),
    ]);

  if (playersError) {
    throw new Error(`Unable to load players: ${playersError.message}`);
  }
  if (gameweeksError) {
    throw new Error(`Unable to load player gameweeks: ${gameweeksError.message}`);
  }
  if (fixturesError) {
    throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
  }

  const rowsByPlayer = new Map<string, PlayerGameweekRow[]>();
  let latestGameweek = 0;

  for (const row of (gameweeks ?? []) as PlayerGameweekRow[]) {
    latestGameweek = Math.max(latestGameweek, row.gameweek);
    const existing = rowsByPlayer.get(row.player_id);
    if (existing) {
      existing.push(row);
      continue;
    }

    rowsByPlayer.set(row.player_id, [row]);
  }

  const fixturesByTeam = new Map<string, FixtureRow[]>();
  for (const fixture of (fixtures ?? []) as FixtureRow[]) {
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

  const windowStarts: Record<PlayerTableWindowKey, number> = {
    last5: Math.max(1, latestGameweek - 4),
    last10: Math.max(1, latestGameweek - 9),
    season: 1,
  };

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
        windows: {
          last5: summarizePlayerWindow(decoratedRows.filter((row) => row.gameweek >= windowStarts.last5), position),
          last10: summarizePlayerWindow(decoratedRows.filter((row) => row.gameweek >= windowStarts.last10), position),
          season: summarizePlayerWindow(decoratedRows, position),
        },
      };
    })
    .sort((a, b) => b.windows.season.season_pts - a.windows.season.season_pts);

  return records;
}

export default async function PlayersPage({ searchParams }: PageProps) {
  const resolvedSearchParams =
    searchParams && typeof searchParams === "object" && "then" in searchParams ? await searchParams : searchParams;
  const activeTab = toTabKey(resolvedSearchParams?.tab);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [players, formData, currentGw, leagueRoster] = await Promise.all([
    activeTab === "players" ? getPlayersTableData() : Promise.resolve(null),
    activeTab === "form" ? getGWOverviewData() : Promise.resolve(null),
    activeTab === "predictions" ? getCurrentGameweek() : Promise.resolve(null),
    user ? getUserLeagueRoster(user.id) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Players</h1>
        <p className="mt-2 text-sm text-brand-creamDark">Season {SEASON} player outputs. Click any row for player detail.</p>
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

      {activeTab === "players" && players ? (
        <PlayersTableClient players={players} leagueRoster={leagueRoster} />
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

      {activeTab === "waiver" ? <WaiverWireClient leagueRoster={leagueRoster} /> : null}
      {activeTab === "fixtures" ? <FixturePlannerClient leagueRoster={leagueRoster} /> : null}
      {activeTab === "predictions" && currentGw ? <PredictionsTab season={SEASON} currentGw={currentGw} leagueRoster={leagueRoster} /> : null}
    </div>
  );
}
