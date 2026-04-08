import type { GWOverviewGameweekRow, GWOverviewPlayer, GWOverviewTeam } from "@/app/portal/gw-overview/GWOverviewClient";
import { SEASON } from "@/lib/portal/playerMetrics";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type PlayerRow = {
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

type FixtureRow = {
  gameweek: number;
  home_team: string;
  away_team: string;
};

type GwOnlyRow = {
  gameweek: number;
};

export type GWOverviewTabData = {
  players: GWOverviewPlayer[];
  gameweeks: GWOverviewGameweekRow[];
  selectedGws: number[];
  teams: GWOverviewTeam[];
  minGw: number;
  maxGw: number;
  allGws: number[];
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

export async function getGWOverviewData(): Promise<GWOverviewTabData> {
  const supabase = await createServerSupabaseClient();

  const [
    { data: players, error: playersError },
    { data: teams, error: teamsError },
    { data: minGwRows, error: minGwError },
    { data: maxGwRows, error: maxGwError },
    { data: gameweeks, error: gameweeksError },
    { data: fixtures, error: fixturesError },
  ] = await Promise.all([
    supabase
      .from("players")
      .select("id, name, team, position, ownership_pct, fpl_player_data(chance_of_playing_next_round, status, news)")
      .order("name"),
    supabase.from("teams").select("abbrev").order("abbrev"),
    supabase.from("player_gameweeks").select("gameweek").eq("season", SEASON).order("gameweek", { ascending: true }).limit(1),
    supabase.from("player_gameweeks").select("gameweek").eq("season", SEASON).order("gameweek", { ascending: false }).limit(1),
    supabase
      .from("player_gameweeks")
      .select(
        "id, player_id, season, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, key_passes, shots_on_target, penalties_drawn, penalties_missed, clean_sheet, tackles_won, interceptions, clearances, aerials_won, blocked_shots, dribbles_succeeded, goals_against_outfield, saves, goals_against, penalty_saves, high_claims, smothers, yellow_cards, red_cards, own_goals"
      )
      .eq("season", SEASON)
      .limit(20000),
    supabase.from("fixtures").select("gameweek, home_team, away_team").eq("season", SEASON),
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
  if (gameweeksError) {
    throw new Error(`Unable to load player gameweeks: ${gameweeksError.message}`);
  }
  if (fixturesError) {
    throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
  }

  const minGw = ((minGwRows ?? []) as GwOnlyRow[])[0]?.gameweek ?? 1;
  const maxGw = ((maxGwRows ?? []) as GwOnlyRow[])[0]?.gameweek ?? 5;
  const latestStartGw = Math.max(minGw, maxGw - 4);
  const selectedGws = Array.from({ length: 5 }, (_, index) => latestStartGw + index).sort((a, b) => b - a);
  const allGws = Array.from({ length: maxGw - minGw + 1 }, (_, index) => minGw + index).sort((a, b) => b - a);

  const playerRows = (players ?? []) as PlayerRow[];
  const gameweekRows = (gameweeks ?? []) as GameweekRow[];
  const fixtureRows = (fixtures ?? []) as FixtureRow[];

  const playerTeamById = new Map<string, string>();
  const normalizedPlayers: GWOverviewPlayer[] = playerRows.map((player) => {
    playerTeamById.set(player.id, player.team);
    const availabilityRaw = Array.isArray(player.fpl_player_data) ? player.fpl_player_data[0] : player.fpl_player_data;

    return {
      id: player.id,
      name: player.name,
      team: player.team,
      position: mapPosition(player.position),
      ownershipPct: parseOwnership(player.ownership_pct),
      chanceOfPlaying: availabilityRaw?.chance_of_playing_next_round ?? null,
      availabilityStatus: availabilityRaw?.status ?? null,
      availabilityNews: availabilityRaw?.news ?? null,
    };
  });

  const normalizedGameweeks: GWOverviewGameweekRow[] = gameweekRows.map((row) => {
    const playerTeam = playerTeamById.get(row.player_id);
    const fixture = fixtureRows.find(
      (item) => item.gameweek === Number(row.gameweek ?? 0) && (item.home_team === playerTeam || item.away_team === playerTeam)
    );
    const is_home =
      fixture && playerTeam ? (fixture.home_team === playerTeam ? true : fixture.away_team === playerTeam ? false : null) : null;

    return {
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
      is_home,
    };
  });

  const teamAbbrevs = ((teams ?? []) as TeamRow[]).map((team) => team.abbrev);
  const playerTeams = Array.from(new Set(normalizedPlayers.map((player) => player.team)));
  const normalizedTeams: GWOverviewTeam[] = Array.from(new Set([...teamAbbrevs, ...playerTeams])).sort((a, b) =>
    a.localeCompare(b)
  );

  return {
    players: normalizedPlayers,
    gameweeks: normalizedGameweeks,
    selectedGws,
    teams: normalizedTeams,
    minGw,
    maxGw,
    allGws,
  };
}
