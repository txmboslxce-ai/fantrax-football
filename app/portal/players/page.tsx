import GWOverviewClient from "@/app/portal/gw-overview/GWOverviewClient";
import FixturePlannerClient from "@/app/portal/players/FixturePlannerClient";
import { getGWOverviewData } from "@/app/portal/gw-overview/getGWOverviewData";
import PredictionsTab from "@/app/portal/players/components/PredictionsTab";
import PlayersTableClient from "@/app/portal/players/PlayersTableClient";
import WaiverWireClient from "@/app/portal/players/WaiverWireClient";
import { createServerSupabaseClient } from "@/lib/supabase-server";
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

type PlayerWithStatsRow = {
  player_id: string;
  games_played: number;
  games_started: number;
  raw_fantrax_pts: number;
  ghost_pts: number;
  players:
    | {
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
      }
    | Array<{
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
      }>
    | null;
};

type AggregatedPlayer = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  seasonPts: number;
  avgPtsPerGw: number;
  ghostPtsPerGw: number;
  ownershipPct: number;
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
};

const SEASON = "2025-26";

const PLAYER_TABS: Array<{ key: PlayersTabKey; label: string }> = [
  { key: "players", label: "Players" },
  { key: "form", label: "Form Table" },
  { key: "waiver", label: "Waiver Wire XI" },
  { key: "fixtures", label: "Fixture Planner" },
  { key: "predictions", label: "Predictions" },
];

function mapPosition(position: string): "GK" | "DEF" | "MID" | "FWD" {
  switch (position) {
    case "G":
      return "GK";
    case "D":
      return "DEF";
    case "M":
      return "MID";
    case "F":
      return "FWD";
    default:
      return "MID";
  }
}

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

async function getPlayersTableData(): Promise<AggregatedPlayer[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("player_gameweeks")
    .select(
      "player_id, games_played, games_started, raw_fantrax_pts, ghost_pts, players!inner(id, name, team, position, ownership_pct, fpl_player_data(chance_of_playing_next_round, status, news))"
    )
    .eq("season", SEASON)
    .gt("games_played", 0);

  if (error) {
    throw new Error(`Unable to load players: ${error.message}`);
  }

  const byPlayer = new Map<
    string,
    {
      id: string;
      name: string;
      team: string;
      position: "GK" | "DEF" | "MID" | "FWD";
      ownershipPct: number;
      seasonPts: number;
      ghostPts: number;
      gameweeksPlayed: number;
      totalGamesPlayed: number;
      chanceOfPlaying: number | null;
      availabilityStatus: string | null;
      availabilityNews: string | null;
    }
  >();

  for (const row of (data ?? []) as PlayerWithStatsRow[]) {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;
    if (!player) {
      continue;
    }

    const availabilityRaw = Array.isArray(player.fpl_player_data) ? player.fpl_player_data[0] : player.fpl_player_data;

    const existing = byPlayer.get(row.player_id);
    if (!existing) {
      byPlayer.set(row.player_id, {
        id: player.id,
        name: player.name,
        team: player.team,
        position: mapPosition(player.position),
        ownershipPct: parseOwnership(player.ownership_pct),
        seasonPts: row.games_played > 0 ? Number(row.raw_fantrax_pts ?? 0) : 0,
        ghostPts: row.games_played > 0 ? Number(row.ghost_pts ?? 0) : 0,
        gameweeksPlayed: row.games_played > 0 ? 1 : 0,
        totalGamesPlayed: row.games_played > 0 ? Number(row.games_played ?? 0) : 0,
        chanceOfPlaying: availabilityRaw?.chance_of_playing_next_round ?? null,
        availabilityStatus: availabilityRaw?.status ?? null,
        availabilityNews: availabilityRaw?.news ?? null,
      });
      continue;
    }

    if (row.games_played > 0) {
      existing.seasonPts += Number(row.raw_fantrax_pts ?? 0);
      existing.ghostPts += Number(row.ghost_pts ?? 0);
      existing.gameweeksPlayed += 1;
      existing.totalGamesPlayed += Number(row.games_played ?? 0);
    }
  }

  const players: AggregatedPlayer[] = Array.from(byPlayer.values()).map((player) => ({
    id: player.id,
    name: player.name,
    team: player.team,
    position: player.position,
    seasonPts: player.seasonPts,
    avgPtsPerGw: player.gameweeksPlayed > 0 ? player.seasonPts / player.gameweeksPlayed : 0,
    ghostPtsPerGw: player.gameweeksPlayed > 0 ? player.ghostPts / player.gameweeksPlayed : 0,
    ownershipPct: player.ownershipPct,
    chanceOfPlaying: player.chanceOfPlaying,
    availabilityStatus: player.availabilityStatus,
    availabilityNews: player.availabilityNews,
  }));

  players.sort((a, b) => b.seasonPts - a.seasonPts);
  return players;
}

export default async function PlayersPage({ searchParams }: PageProps) {
  const resolvedSearchParams =
    searchParams && typeof searchParams === "object" && "then" in searchParams ? await searchParams : searchParams;
  const activeTab = toTabKey(resolvedSearchParams?.tab);

  const players = activeTab === "players" ? await getPlayersTableData() : null;
  const formData = activeTab === "form" ? await getGWOverviewData(resolvedSearchParams?.startGw) : null;
  const currentGw = activeTab === "predictions" ? await getCurrentGameweek() : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Players</h1>
        <p className="mt-2 text-sm text-brand-creamDark">Season {SEASON} player outputs. Click any row for player detail.</p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {PLAYER_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/portal/players?tab=${tab.key}`}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? "border-brand-greenLight bg-brand-green text-brand-cream"
                : "border-brand-cream/35 bg-brand-dark text-brand-cream hover:bg-brand-greenDark"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {activeTab === "players" && players ? <PlayersTableClient players={players} /> : null}

      {activeTab === "form" && formData ? (
        <GWOverviewClient
          players={formData.players}
          gameweeks={formData.gameweeks}
          selectedGws={formData.selectedGws}
          teams={formData.teams}
          minGw={formData.minGw}
          maxGw={formData.maxGw}
          startGwBasePath="/portal/players?tab=form"
        />
      ) : null}

      {activeTab === "waiver" ? <WaiverWireClient /> : null}
      {activeTab === "fixtures" ? <FixturePlannerClient /> : null}
      {activeTab === "predictions" && currentGw ? <PredictionsTab season={SEASON} currentGw={currentGw} /> : null}
    </div>
  );
}
