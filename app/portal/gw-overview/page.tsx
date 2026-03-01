import GWOverviewClient, {
  type GWOverviewGameweekRow,
  type GWOverviewPlayer,
  type GWOverviewTeam,
} from "@/app/portal/gw-overview/GWOverviewClient";
import { SEASON } from "@/lib/portal/playerMetrics";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type PageProps = {
  searchParams?:
    | {
        startGw?: string | string[];
      }
    | Promise<{
        startGw?: string | string[];
      }>;
};

type PlayerRow = {
  id: string;
  name: string;
  team: string;
  position: string;
  ownership_pct: string | null;
};

type GameweekRow = {
  id: string;
  player_id: string;
  season: string;
  gameweek: number;
  games_played: number | null;
  games_started: number | null;
  minutes_played: number | null;
  raw_fantrax_pts: number | string | null;
  ghost_pts: number | string | null;
  goals: number | null;
  assists: number | null;
  key_passes: number | null;
  shots_on_target: number | null;
  penalties_drawn: number | null;
  penalties_missed: number | null;
  clean_sheet: number | null;
  tackles_won: number | null;
  interceptions: number | null;
  clearances: number | null;
  aerials_won: number | null;
  blocked_shots: number | null;
  dribbles_succeeded: number | null;
  goals_against_outfield: number | null;
  saves: number | null;
  goals_against: number | null;
  penalty_saves: number | null;
  high_claims: number | null;
  smothers: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  own_goals: number | null;
};

type TeamRow = {
  abbrev: string;
};

type GwOnlyRow = {
  gameweek: number;
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

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

  const parsed = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function GWOverviewPage({ searchParams }: PageProps) {
  const supabase = await createServerSupabaseClient();
  const resolvedSearchParams =
    searchParams && typeof searchParams === "object" && "then" in searchParams ? await searchParams : searchParams;

  const [{ data: players, error: playersError }, { data: teams, error: teamsError }, { data: minGwRows, error: minGwError }, { data: maxGwRows, error: maxGwError }] =
    await Promise.all([
      supabase.from("players").select("id, name, team, position, ownership_pct").order("name"),
      supabase.from("teams").select("abbrev").order("abbrev"),
      supabase.from("player_gameweeks").select("gameweek").eq("season", SEASON).order("gameweek", { ascending: true }).limit(1),
      supabase.from("player_gameweeks").select("gameweek").eq("season", SEASON).order("gameweek", { ascending: false }).limit(1),
    ]);

  if (playersError) {
    throw new Error(`Unable to load players: ${playersError.message}`);
  }

  if (teamsError) {
    throw new Error(`Unable to load teams: ${teamsError.message}`);
  }

  if (minGwError) {
    throw new Error(`Unable to load min gameweek: ${minGwError.message}`);
  }

  if (maxGwError) {
    throw new Error(`Unable to load max gameweek: ${maxGwError.message}`);
  }

  const minGw = ((minGwRows ?? []) as GwOnlyRow[])[0]?.gameweek ?? 1;
  const maxGw = ((maxGwRows ?? []) as GwOnlyRow[])[0]?.gameweek ?? 5;

  const latestStartGw = Math.max(minGw, maxGw - 4);
  const rawStartGw = Array.isArray(resolvedSearchParams?.startGw)
    ? resolvedSearchParams.startGw[0]
    : resolvedSearchParams?.startGw;
  const parsedStartGw = Number.parseInt(String(rawStartGw ?? ""), 10);
  const requestedStartGw = Number.isFinite(parsedStartGw) ? parsedStartGw : latestStartGw;
  const startGw = Math.min(latestStartGw, Math.max(minGw, requestedStartGw));

  const selectedGwsAsc: number[] = [startGw, startGw + 1, startGw + 2, startGw + 3, startGw + 4].map((n) =>
    Number.parseInt(String(n), 10)
  );
  const selectedGws = [...selectedGwsAsc].sort((a, b) => b - a);

  const { data: gameweeks, error: gameweeksError } = await supabase
    .from("player_gameweeks")
    .select(
      "id, player_id, season, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, key_passes, shots_on_target, penalties_drawn, penalties_missed, clean_sheet, tackles_won, interceptions, clearances, aerials_won, blocked_shots, dribbles_succeeded, goals_against_outfield, saves, goals_against, penalty_saves, high_claims, smothers, yellow_cards, red_cards, own_goals"
    )
    .eq("season", SEASON)
    .limit(5000)
    .in("gameweek", selectedGwsAsc.map((gw) => Number.parseInt(String(gw), 10)));

  if (gameweeksError) {
    throw new Error(`Unable to load player gameweeks: ${gameweeksError.message}`);
  }

  const playerRows = (players ?? []) as PlayerRow[];
  const gameweekRows = (gameweeks ?? []) as GameweekRow[];

  const normalizedPlayers: GWOverviewPlayer[] = playerRows.map((player) => ({
    id: player.id,
    name: player.name,
    team: player.team,
    position: mapPosition(player.position),
    ownershipPct: parseOwnership(player.ownership_pct),
  }));

  const normalizedGameweeks: GWOverviewGameweekRow[] = gameweekRows.map((row) => ({
    id: row.id,
    player_id: row.player_id,
    season: row.season,
    gameweek: Number(row.gameweek ?? 0),
    games_played: Number(row.games_played ?? 0),
    games_started: Number(row.games_started ?? 0),
    minutes_played: Number(row.minutes_played ?? 0),
    raw_fantrax_pts: toNumber(row.raw_fantrax_pts),
    ghost_pts: toNumber(row.ghost_pts),
    goals: Number(row.goals ?? 0),
    assists: Number(row.assists ?? 0),
    key_passes: Number(row.key_passes ?? 0),
    shots_on_target: Number(row.shots_on_target ?? 0),
    penalties_drawn: Number(row.penalties_drawn ?? 0),
    penalties_missed: Number(row.penalties_missed ?? 0),
    clean_sheet: Number(row.clean_sheet ?? 0),
    tackles_won: Number(row.tackles_won ?? 0),
    interceptions: Number(row.interceptions ?? 0),
    clearances: Number(row.clearances ?? 0),
    aerials_won: Number(row.aerials_won ?? 0),
    blocked_shots: Number(row.blocked_shots ?? 0),
    dribbles_succeeded: Number(row.dribbles_succeeded ?? 0),
    goals_against_outfield: Number(row.goals_against_outfield ?? 0),
    saves: Number(row.saves ?? 0),
    goals_against: Number(row.goals_against ?? 0),
    penalty_saves: Number(row.penalty_saves ?? 0),
    high_claims: Number(row.high_claims ?? 0),
    smothers: Number(row.smothers ?? 0),
    yellow_cards: Number(row.yellow_cards ?? 0),
    red_cards: Number(row.red_cards ?? 0),
    own_goals: Number(row.own_goals ?? 0),
  }));

  const teamAbbrevs = ((teams ?? []) as TeamRow[]).map((team) => team.abbrev);
  const playerTeams = Array.from(new Set(normalizedPlayers.map((player) => player.team)));
  const normalizedTeams: GWOverviewTeam[] = Array.from(new Set([...teamAbbrevs, ...playerTeams])).sort((a, b) =>
    a.localeCompare(b)
  );

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-brand-cream/20 bg-brand-dark px-5 py-4">
        <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">GW Overview</h1>
        <p className="mt-2 text-sm text-brand-creamDark">Season 2025-26 - gameweek by gameweek output for every player</p>
      </header>

      <GWOverviewClient
        players={normalizedPlayers}
        gameweeks={normalizedGameweeks}
        selectedGws={selectedGws}
        teams={normalizedTeams}
        minGw={minGw}
        maxGw={maxGw}
      />
    </div>
  );
}
