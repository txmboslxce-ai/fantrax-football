import { createServerSupabaseClient } from "@/lib/supabase-server";
import { mapPosition } from "@/lib/portal/playerMetrics";
import { getCurrentSeason } from "@/lib/season/current";

export type AdviceStatKey =
  | "pts_per_start"
  | "ghost_pts_per_start"
  | "pts_per_game"
  | "goals"
  | "assists"
  | "key_passes"
  | "shots_on_target"
  | "tackles_won"
  | "interceptions"
  | "clearances"
  | "accurate_crosses"
  | "aerials_won"
  | "saves"
  | "clean_sheets";

export type AdvicePlayerRow = {
  playerId: string;
  playerName: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  ownershipPct: number | null;
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
  /** Season per-start (or per-game for pts_per_game) averages */
  playerStats: Record<AdviceStatKey, number>;
  gamesStarted: number;
  nextFixtureGw: number | null;
  nextFixtureOpponent: string | null;
  nextFixtureIsHome: boolean | null;
  /** Opponent's avg conceded per player per game to this player's position */
  oppStats: Record<AdviceStatKey, number>;
};

type GwRow = {
  player_id: string;
  gameweek: number;
  games_played: number | null;
  games_started: number | null;
  raw_fantrax_pts: number | string | null;
  ghost_pts: number | string | null;
  goals: number | null;
  assists: number | null;
  key_passes: number | null;
  shots_on_target: number | null;
  tackles_won: number | null;
  interceptions: number | null;
  clearances: number | null;
  accurate_crosses: number | null;
  aerials_won: number | null;
  saves: number | null;
  clean_sheet: number | null;
};

type FixRow = {
  gameweek: number;
  home_team: string;
  away_team: string;
};

type PlayerDbRow = {
  id: string;
  name: string;
  team: string;
  position: string;
  ownership_pct: string | null;
  fpl_player_data:
    | { chance_of_playing_next_round: number | null; status: string | null; news: string | null }
    | Array<{ chance_of_playing_next_round: number | null; status: string | null; news: string | null }>
    | null;
};

type Accum = { sum: number; count: number };

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const p = Number.parseFloat(v);
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

function addAccum(
  map: Record<string, Record<string, Record<string, Accum>>>,
  opponent: string,
  position: string,
  key: string,
  value: number,
  count: number,
) {
  if (!map[opponent]) map[opponent] = {};
  if (!map[opponent][position]) map[opponent][position] = {};
  const existing = map[opponent][position][key];
  if (existing) {
    existing.sum += value;
    existing.count += count;
  } else {
    map[opponent][position][key] = { sum: value, count };
  }
}

function resolveAccum(
  map: Record<string, Record<string, Record<string, Accum>>>,
  opponent: string | null,
  position: string,
  key: string,
): number {
  if (!opponent) return 0;
  const a = map[opponent]?.[position]?.[key];
  if (!a || a.count === 0) return 0;
  return r2(a.sum / a.count);
}

export async function getAdviceData(): Promise<{ players: AdvicePlayerRow[] }> {
  const supabase = await createServerSupabaseClient();
  const SEASON = await getCurrentSeason(supabase);
  const FIXTURE_SEASON = "2026-27";

  const [
    { data: playersRaw, error: playersError },
    { data: gwsRaw, error: gwsError },
    { data: historicalFixturesRaw, error: historicalFixturesError },
    { data: fixtureSeasonFixturesRaw, error: fixtureSeasonFixturesError },
    { data: fixtureSeasonLatestGwRaw, error: fixtureSeasonLatestGwError },
  ] = await Promise.all([
    supabase
      .from("players")
      .select("id, name, team, position, ownership_pct, fpl_player_data(chance_of_playing_next_round, status, news)")
      .order("name"),
    supabase
      .from("player_gameweeks")
      .select(
        "player_id, gameweek, games_played, games_started, raw_fantrax_pts, ghost_pts, goals, assists, key_passes, shots_on_target, tackles_won, interceptions, clearances, accurate_crosses, aerials_won, saves, clean_sheet",
      )
      .eq("season", SEASON),
    supabase.from("fixtures").select("gameweek, home_team, away_team").eq("season", SEASON),
    supabase.from("fixtures").select("gameweek, home_team, away_team").eq("season", FIXTURE_SEASON),
    supabase
      .from("player_gameweeks")
      .select("gameweek")
      .eq("season", FIXTURE_SEASON)
      .gt("games_played", 0)
      .order("gameweek", { ascending: false })
      .limit(1),
  ]);

  if (playersError) throw new Error(`Failed to load players: ${playersError.message}`);
  if (gwsError) throw new Error(`Failed to load gameweeks: ${gwsError.message}`);
  if (historicalFixturesError) throw new Error(`Failed to load historical fixtures: ${historicalFixturesError.message}`);
  if (fixtureSeasonFixturesError) throw new Error(`Failed to load fixture-season fixtures: ${fixtureSeasonFixturesError.message}`);
  if (fixtureSeasonLatestGwError) throw new Error(`Failed to load fixture-season gameweek: ${fixtureSeasonLatestGwError.message}`);

  const players = (playersRaw ?? []) as PlayerDbRow[];
  const gws = (gwsRaw ?? []) as GwRow[];
  const historicalFixtures = (historicalFixturesRaw ?? []) as FixRow[];
  const fixtureSeasonFixtures = (fixtureSeasonFixturesRaw ?? []) as FixRow[];

  // --- indexes ---

  const playerInfo = new Map<string, { team: string; position: "GK" | "DEF" | "MID" | "FWD" }>();
  for (const p of players) {
    playerInfo.set(p.id, { team: p.team, position: mapPosition(p.position) });
  }

  // Historical fixtures are used only to match the historical gameweeks that
  // feed the opponent-conceded accumulation below.
  const historicalFixByTeamGw = new Map<string, { opponent: string; isHome: boolean }>();
  for (const fix of historicalFixtures) {
    historicalFixByTeamGw.set(`${fix.home_team}:${fix.gameweek}`, { opponent: fix.away_team, isHome: true });
    historicalFixByTeamGw.set(`${fix.away_team}:${fix.gameweek}`, { opponent: fix.home_team, isHome: false });
  }

  const rowsByPlayer = new Map<string, GwRow[]>();
  for (const row of gws) {
    const existing = rowsByPlayer.get(row.player_id);
    if (existing) existing.push(row);
    else rowsByPlayer.set(row.player_id, [row]);
  }

  // Fixture-season data is deliberately separate from the historical fixture
  // map: it drives only the upcoming-fixture lookup shown in Advice.
  const fixtureSeasonFixByTeamGw = new Map<string, { opponent: string; isHome: boolean }>();
  const fixtureSeasonFixturesByGw = new Map<number, FixRow[]>();
  for (const fix of fixtureSeasonFixtures) {
    fixtureSeasonFixByTeamGw.set(`${fix.home_team}:${fix.gameweek}`, { opponent: fix.away_team, isHome: true });
    fixtureSeasonFixByTeamGw.set(`${fix.away_team}:${fix.gameweek}`, { opponent: fix.home_team, isHome: false });
    const existing = fixtureSeasonFixturesByGw.get(fix.gameweek);
    if (existing) existing.push(fix);
    else fixtureSeasonFixturesByGw.set(fix.gameweek, [fix]);
  }

  // Start from the fixture season's first available GW when it has no played
  // matches; otherwise advance to the next fixture GW when available.
  const fixtureSeasonLatestGw = Number((fixtureSeasonLatestGwRaw ?? [])[0]?.gameweek ?? 0);
  const nextFixtureGw: number | null =
    fixtureSeasonLatestGw === 0
      ? ([...fixtureSeasonFixturesByGw.keys()].sort((a, b) => a - b)[0] ?? null)
      : fixtureSeasonFixturesByGw.has(fixtureSeasonLatestGw + 1)
      ? fixtureSeasonLatestGw + 1
      : fixtureSeasonLatestGw;

  // --- opponent conceded accumulation ---
  // oppMap[opponent_team][position][stat] = { sum, count }
  // "per start" stats: count each started row (games_started === 1) as 1 observation
  // "per game" (pts_per_game): count each played row with weight = games_played
  const oppMap: Record<string, Record<string, Record<string, Accum>>> = {};

  for (const row of gws) {
    const info = playerInfo.get(row.player_id);
    if (!info) continue;

    const fix = historicalFixByTeamGw.get(`${info.team}:${row.gameweek}`);
    if (!fix) continue;

    const { opponent } = fix;
    const pos = info.position;
    const gp = Number(row.games_played ?? 0);
    const gs = Number(row.games_started ?? 0);

    if (gp > 0) {
      addAccum(oppMap, opponent, pos, "pts_per_game", toNum(row.raw_fantrax_pts), gp);
    }

    if (gs === 1) {
      addAccum(oppMap, opponent, pos, "pts_per_start", toNum(row.raw_fantrax_pts), 1);
      addAccum(oppMap, opponent, pos, "ghost_pts_per_start", toNum(row.ghost_pts), 1);
      addAccum(oppMap, opponent, pos, "goals", Number(row.goals ?? 0), 1);
      addAccum(oppMap, opponent, pos, "assists", Number(row.assists ?? 0), 1);
      addAccum(oppMap, opponent, pos, "key_passes", Number(row.key_passes ?? 0), 1);
      addAccum(oppMap, opponent, pos, "shots_on_target", Number(row.shots_on_target ?? 0), 1);
      addAccum(oppMap, opponent, pos, "tackles_won", Number(row.tackles_won ?? 0), 1);
      addAccum(oppMap, opponent, pos, "interceptions", Number(row.interceptions ?? 0), 1);
      addAccum(oppMap, opponent, pos, "clearances", Number(row.clearances ?? 0), 1);
      addAccum(oppMap, opponent, pos, "accurate_crosses", Number(row.accurate_crosses ?? 0), 1);
      addAccum(oppMap, opponent, pos, "aerials_won", Number(row.aerials_won ?? 0), 1);
      addAccum(oppMap, opponent, pos, "saves", Number(row.saves ?? 0), 1);
      addAccum(oppMap, opponent, pos, "clean_sheets", Number(row.clean_sheet ?? 0), 1);
    }
  }

  // --- build per-player rows ---

  const result: AdvicePlayerRow[] = players.map((p) => {
    const rows = rowsByPlayer.get(p.id) ?? [];
    const started = rows.filter((r) => Number(r.games_started ?? 0) === 1);
    const played = rows.filter((r) => Number(r.games_played ?? 0) > 0);
    const ns = started.length;
    const np = played.length;

    function sSum(arr: GwRow[], get: (r: GwRow) => number): number {
      return arr.reduce((s, r) => s + get(r), 0);
    }

    const playerStats: Record<AdviceStatKey, number> = {
      pts_per_start: r2(ns > 0 ? sSum(started, (r) => toNum(r.raw_fantrax_pts)) / ns : 0),
      ghost_pts_per_start: r2(ns > 0 ? sSum(started, (r) => toNum(r.ghost_pts)) / ns : 0),
      pts_per_game: r2(np > 0 ? sSum(played, (r) => toNum(r.raw_fantrax_pts)) / np : 0),
      goals: r2(ns > 0 ? sSum(started, (r) => Number(r.goals ?? 0)) / ns : 0),
      assists: r2(ns > 0 ? sSum(started, (r) => Number(r.assists ?? 0)) / ns : 0),
      key_passes: r2(ns > 0 ? sSum(started, (r) => Number(r.key_passes ?? 0)) / ns : 0),
      shots_on_target: r2(ns > 0 ? sSum(started, (r) => Number(r.shots_on_target ?? 0)) / ns : 0),
      tackles_won: r2(ns > 0 ? sSum(started, (r) => Number(r.tackles_won ?? 0)) / ns : 0),
      interceptions: r2(ns > 0 ? sSum(started, (r) => Number(r.interceptions ?? 0)) / ns : 0),
      clearances: r2(ns > 0 ? sSum(started, (r) => Number(r.clearances ?? 0)) / ns : 0),
      accurate_crosses: r2(ns > 0 ? sSum(started, (r) => Number(r.accurate_crosses ?? 0)) / ns : 0),
      aerials_won: r2(ns > 0 ? sSum(started, (r) => Number(r.aerials_won ?? 0)) / ns : 0),
      saves: r2(ns > 0 ? sSum(started, (r) => Number(r.saves ?? 0)) / ns : 0),
      clean_sheets: r2(ns > 0 ? sSum(started, (r) => Number(r.clean_sheet ?? 0)) / ns : 0),
    };

    const position = mapPosition(p.position);

    const nextFix = nextFixtureGw !== null
      ? fixtureSeasonFixByTeamGw.get(`${p.team}:${nextFixtureGw}`) ?? null
      : null;
    const nextFixtureOpponent = nextFix?.opponent ?? null;
    const nextFixtureIsHome = nextFix?.isHome ?? null;

    const oppStats: Record<AdviceStatKey, number> = {
      pts_per_start: resolveAccum(oppMap, nextFixtureOpponent, position, "pts_per_start"),
      ghost_pts_per_start: resolveAccum(oppMap, nextFixtureOpponent, position, "ghost_pts_per_start"),
      pts_per_game: resolveAccum(oppMap, nextFixtureOpponent, position, "pts_per_game"),
      goals: resolveAccum(oppMap, nextFixtureOpponent, position, "goals"),
      assists: resolveAccum(oppMap, nextFixtureOpponent, position, "assists"),
      key_passes: resolveAccum(oppMap, nextFixtureOpponent, position, "key_passes"),
      shots_on_target: resolveAccum(oppMap, nextFixtureOpponent, position, "shots_on_target"),
      tackles_won: resolveAccum(oppMap, nextFixtureOpponent, position, "tackles_won"),
      interceptions: resolveAccum(oppMap, nextFixtureOpponent, position, "interceptions"),
      clearances: resolveAccum(oppMap, nextFixtureOpponent, position, "clearances"),
      accurate_crosses: resolveAccum(oppMap, nextFixtureOpponent, position, "accurate_crosses"),
      aerials_won: resolveAccum(oppMap, nextFixtureOpponent, position, "aerials_won"),
      saves: resolveAccum(oppMap, nextFixtureOpponent, position, "saves"),
      clean_sheets: resolveAccum(oppMap, nextFixtureOpponent, position, "clean_sheets"),
    };

    const availRaw = Array.isArray(p.fpl_player_data) ? p.fpl_player_data[0] : p.fpl_player_data;

    const ownershipRaw = p.ownership_pct != null ? parseFloat(p.ownership_pct) : null;

    return {
      playerId: p.id,
      playerName: p.name,
      team: p.team,
      position,
      ownershipPct: ownershipRaw != null && Number.isFinite(ownershipRaw) ? ownershipRaw : null,
      chanceOfPlaying: availRaw?.chance_of_playing_next_round ?? null,
      availabilityStatus: availRaw?.status ?? null,
      availabilityNews: availRaw?.news ?? null,
      playerStats,
      gamesStarted: ns,
      nextFixtureGw: nextFix ? nextFixtureGw : null,
      nextFixtureOpponent,
      nextFixtureIsHome,
      oppStats,
    };
  });

  return { players: result };
}
