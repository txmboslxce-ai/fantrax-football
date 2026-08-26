// Precomputes everything that Players / Stats / Draft Tool / Player Detail
// used to calculate live, on every page view, across the whole player pool:
// season/last5/last10 window summaries, league-wide radar chart rankings,
// and fixture-difficulty rankings. Run this once per season whenever new
// scores are synced (see app/api/cron/sync-scores and
// app/api/fantrax/sync-scores), and it's safe to re-run any time — every
// write here is a full upsert of that season's rows.
//
// This intentionally re-uses the exact calculation functions the pages used
// to call directly (decorateGameweeks, summarizePlayerSeason,
// summarizePlayerWindow, rankRadarValues, computeRadarValue) rather than
// re-deriving the formulas, so the numbers a page shows after this change
// are the same numbers it showed before — just computed once instead of on
// every click.
import {
  decorateGameweeks,
  mapPosition,
  summarizePlayerSeason,
  summarizePlayerWindow,
  type DecoratedGameweek,
  type FixtureRow,
  type PlayerGameweekRow,
  type PlayerSeasonSummary,
  type PlayerWindowStats,
} from "@/lib/portal/playerMetrics";
import { computeRadarValue, rankRadarValues, type RadarBandShape, type RadarDirection } from "@/lib/portal/radarScaling";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

const PLAYER_ID_BATCH_SIZE = 100;

// The full set of player_gameweeks columns needed across every calculation
// below (this matches RADAR_PLAYER_GAMEWEEK_COLUMNS from the old Player
// Detail page, which was already the broadest column list in the app).
const FULL_GAMEWEEK_COLUMNS =
  "id, player_id, season, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, clean_sheet, goals_against, goals_against_outfield, saves, key_passes, shots_on_target, tackles_won, interceptions, clearances, aerials_won, accurate_crosses, blocked_shots, dribbles_succeeded, dispossessed, penalties_drawn, penalties_missed, yellow_cards, red_cards, own_goals, subbed_on, subbed_off, penalty_saves, high_claims, smothers, corner_kicks, free_kick_shots";

export type WindowKey = "season" | "last5" | "last10";
const WINDOW_KEYS: WindowKey[] = ["season", "last5", "last10"];

type PoolPlayer = {
  id: string;
  fantrax_id: string;
  team: string;
  position: string;
};

type RadarMetric = {
  label: string;
  value: (summary: PlayerSeasonSummary) => number;
  direction?: RadarDirection;
};

type RadarPoolPlayer = {
  id: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  summary: PlayerSeasonSummary;
};

type RadarDatum = {
  stat: string;
  rawValue: number;
  rank: number;
  value: number;
};

type FdrGameweekRow = {
  gameweek: number;
  raw_fantrax_pts: number | string | null;
  players: { team: string; position: string } | Array<{ team: string; position: string }> | null;
};

const fantasyMetrics: RadarMetric[] = [
  { label: "Season Pts", value: (s) => s.season_total_pts },
  { label: "Avg Pts/Start", value: (s) => s.avg_pts_per_start },
  { label: "Ghost Pts/Start", value: (s) => s.avg_ghost_per_start },
  { label: "Games Started", value: (s) => s.total_games_started },
];
const attackingMetrics: RadarMetric[] = [
  { label: "Goals", value: (s) => s.goals },
  { label: "Assists", value: (s) => s.assists },
  { label: "Key Passes", value: (s) => s.key_passes },
  { label: "Shots on Target", value: (s) => s.shots_on_target },
  { label: "Dribbles Succeeded", value: (s) => s.dribbles_succeeded },
];
const defensiveMetrics: RadarMetric[] = [
  { label: "Tackles Won", value: (s) => s.tackles },
  { label: "Interceptions", value: (s) => s.interceptions },
  { label: "Clearances", value: (s) => s.clearances },
  { label: "Aerials Won", value: (s) => s.aerials },
  { label: "Clean Sheets", value: (s) => s.clean_sheets },
];
const goalkeeperMetrics: RadarMetric[] = [
  { label: "Saves", value: (s) => s.saves },
  { label: "Clean Sheets", value: (s) => s.clean_sheets },
  { label: "Penalty Saves", value: (s) => s.penalty_saves },
  { label: "High Claims", value: (s) => s.high_claims },
  { label: "Smothers", value: (s) => s.smothers },
  { label: "Goals Against", value: (s) => s.goals_against, direction: "lower_is_better" },
];

function buildRadarDataset(
  pool: RadarPoolPlayer[],
  playerId: string,
  metrics: RadarMetric[],
  floorRank: number,
  bandShape: RadarBandShape = "skewed"
): RadarDatum[] {
  const target = pool.find((player) => player.id === playerId);

  return metrics.map(({ label, value, direction = "higher_is_better" }) => {
    const ranks = rankRadarValues(pool.map((player) => ({ id: player.id, value: value(player.summary) })), direction);
    const rank = ranks.get(playerId) ?? pool.length + 1;
    const rawValue = target ? value(target.summary) : 0;

    return { stat: label, rawValue, rank, value: computeRadarValue(rank, pool.length, floorRank, direction, bandShape) };
  });
}

function sumPlayed(rows: DecoratedGameweek[], key: keyof DecoratedGameweek): number {
  return rows
    .filter((row) => row.games_played > 0)
    .reduce((sum, row) => sum + (Number(row[key] as number) || 0), 0);
}

function windowRowsFor(decorated: DecoratedGameweek[], window: WindowKey, latestGameweek: number): DecoratedGameweek[] {
  if (window === "season") {
    return decorated;
  }

  const startGameweek = Math.max(1, latestGameweek - (window === "last5" ? 4 : 9));
  return decorated.filter((row) => row.gameweek >= startGameweek);
}

function buildWindowStatsRow(
  playerId: string,
  season: string,
  window: WindowKey,
  windowStats: PlayerWindowStats,
  seasonSummary: PlayerSeasonSummary,
  windowRows: DecoratedGameweek[]
) {
  return {
    player_id: playerId,
    season,
    // Column is stat_window, not window: WINDOW is a reserved SQL keyword.
    stat_window: window,

    gameweeks_played: seasonSummary.gameweeks_played,
    games_played: windowStats.games_played,
    games_started: windowStats.games_started,
    total_minutes: windowStats.total_minutes,
    current_gameweek: seasonSummary.current_gameweek,

    season_pts: windowStats.season_pts,
    avg_pts_per_gameweek: windowStats.avg_pts_per_gw,
    avg_pts_per_game: seasonSummary.avg_pts_per_game,
    avg_pts_per_start: windowStats.fantasy_pts_per_start,
    total_ghost_pts: seasonSummary.total_ghost_pts,
    avg_ghost_per_gameweek: windowStats.ghost_pts_per_gw,
    avg_ghost_per_game: seasonSummary.avg_ghost_per_game,
    avg_ghost_per_start: windowStats.ghost_pts_per_start,
    attack_pts: seasonSummary.attack_pts,

    season_avg_pts_per_start: seasonSummary.avg_pts_per_start,
    season_avg_ghost_per_start: seasonSummary.avg_ghost_per_start,
    games_started_total: seasonSummary.total_games_started,

    minutes_per_start: windowStats.minutes_per_start,
    floor_per_start: windowStats.floor_per_start,
    ceiling_per_start: windowStats.ceiling_per_start,
    tenth_percentile_per_start: windowStats.tenth_percentile_per_start,
    ninetieth_percentile_per_start: windowStats.ninetieth_percentile_per_start,
    std_deviation: windowStats.std_deviation,
    median_pts_per_start: windowStats.median_pts_per_start,
    coefficient_of_variation: windowStats.coefficient_of_variation,

    home_avg: seasonSummary.home_avg,
    away_avg: seasonSummary.away_avg,
    home_pct: seasonSummary.home_pct,
    away_pct: seasonSummary.away_pct,
    home_pts_per_start: windowStats.home_pts_per_start,
    home_pts_pct: windowStats.home_pts_pct,
    away_pts_per_start: windowStats.away_pts_per_start,
    away_pts_pct: windowStats.away_pts_pct,

    ghost_pts_pct: windowStats.ghost_pts_pct,
    goals_pts_pct: windowStats.goals_pts_pct,
    assist_pts_pct: windowStats.assist_pts_pct,
    clean_sheet_pts_pct: windowStats.clean_sheet_pts_pct,
    attacking_pts_pct: windowStats.attacking_pts_pct,
    defensive_pts_pct: windowStats.defensive_pts_pct,
    total_attacking_defensive_pct: windowStats.total_attacking_defensive_pct,

    goals: seasonSummary.goals,
    assists: seasonSummary.assists,
    clean_sheets: seasonSummary.clean_sheets,
    key_passes: seasonSummary.key_passes,
    shots_on_target: seasonSummary.shots_on_target,
    dribbles_succeeded: seasonSummary.dribbles_succeeded,
    dispossessed: sumPlayed(windowRows, "dispossessed"),
    tackles_won: seasonSummary.tackles,
    interceptions: seasonSummary.interceptions,
    clearances: seasonSummary.clearances,
    blocked_shots: sumPlayed(windowRows, "blocked_shots"),
    aerials_won: seasonSummary.aerials,
    accurate_crosses: sumPlayed(windowRows, "accurate_crosses"),
    goals_against_outfield: sumPlayed(windowRows, "goals_against_outfield"),
    saves: seasonSummary.saves,
    penalty_saves: seasonSummary.penalty_saves,
    goals_against: seasonSummary.goals_against,
    high_claims: seasonSummary.high_claims,
    smothers: seasonSummary.smothers,
    yellow_cards: sumPlayed(windowRows, "yellow_cards"),
    red_cards: sumPlayed(windowRows, "red_cards"),
    own_goals: sumPlayed(windowRows, "own_goals"),
    penalties_missed: sumPlayed(windowRows, "penalties_missed"),
    penalties_drawn: sumPlayed(windowRows, "penalties_drawn"),
    corner_kicks: sumPlayed(windowRows, "corner_kicks"),
    free_kick_shots: sumPlayed(windowRows, "free_kick_shots"),

    computed_at: new Date().toISOString(),
  };
}

export type RecomputeResult = {
  season: string;
  playersProcessed: number;
  radarProfilesWritten: number;
  fdrRowsWritten: number;
};

export async function recomputePlayerSummaries(season: string): Promise<RecomputeResult> {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to recompute player summaries.");
  }

  const { data: poolRows, error: poolError } = await supabase
    .from("season_player_pool")
    .select("fantrax_id")
    .eq("season", season);
  if (poolError) {
    throw new Error(`Unable to load the ${season} player pool: ${poolError.message}`);
  }

  const poolFantraxIds = (poolRows ?? []).map((row) => row.fantrax_id as string);
  if (poolFantraxIds.length === 0) {
    return { season, playersProcessed: 0, radarProfilesWritten: 0, fdrRowsWritten: 0 };
  }

  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("id, fantrax_id, team, position")
    .in("fantrax_id", poolFantraxIds)
    .range(0, 40000);
  if (playersError) {
    throw new Error(`Unable to load players: ${playersError.message}`);
  }

  const players = (playersData ?? []) as PoolPlayer[];
  if (players.length === 0) {
    return { season, playersProcessed: 0, radarProfilesWritten: 0, fdrRowsWritten: 0 };
  }

  const { data: fixturesData, error: fixturesError } = await supabase
    .from("fixtures")
    .select("id, season, gameweek, home_team, away_team")
    .eq("season", season);
  if (fixturesError) {
    throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
  }

  const fixturesByTeam = new Map<string, FixtureRow[]>();
  for (const fixture of (fixturesData ?? []) as FixtureRow[]) {
    for (const team of [fixture.home_team, fixture.away_team]) {
      const existing = fixturesByTeam.get(team);
      if (existing) existing.push(fixture);
      else fixturesByTeam.set(team, [fixture]);
    }
  }

  const playerIds = players.map((player) => player.id);
  const playerIdBatches = Array.from(
    { length: Math.ceil(playerIds.length / PLAYER_ID_BATCH_SIZE) },
    (_, index) => playerIds.slice(index * PLAYER_ID_BATCH_SIZE, (index + 1) * PLAYER_ID_BATCH_SIZE)
  );

  const gameweekResults = await Promise.all(
    playerIdBatches.map((batch) =>
      supabase.from("player_gameweeks").select(FULL_GAMEWEEK_COLUMNS).eq("season", season).in("player_id", batch).range(0, 40000)
    )
  );
  const gameweeksError = gameweekResults.find((result) => result.error)?.error;
  if (gameweeksError) {
    throw new Error(`Unable to load ${season} player gameweeks: ${gameweeksError.message}`);
  }

  const rowsByPlayer = new Map<string, PlayerGameweekRow[]>();
  let latestGameweek = 0;
  for (const row of gameweekResults.flatMap((result) => (result.data ?? []) as PlayerGameweekRow[])) {
    latestGameweek = Math.max(latestGameweek, row.gameweek);
    const existing = rowsByPlayer.get(row.player_id);
    if (existing) existing.push(row);
    else rowsByPlayer.set(row.player_id, [row]);
  }

  const windowStatsToUpsert: ReturnType<typeof buildWindowStatsRow>[] = [];
  const radarPool: RadarPoolPlayer[] = [];
  const decoratedByPlayer = new Map<string, DecoratedGameweek[]>();

  for (const player of players) {
    const rows = (rowsByPlayer.get(player.id) ?? []).sort((a, b) => a.gameweek - b.gameweek);
    const decorated = decorateGameweeks(rows, player.team, fixturesByTeam.get(player.team) ?? []);
    const position = mapPosition(player.position);
    decoratedByPlayer.set(player.id, decorated);

    for (const window of WINDOW_KEYS) {
      const windowRows = windowRowsFor(decorated, window, latestGameweek);
      const seasonSummary = summarizePlayerSeason(windowRows);
      const windowStats = summarizePlayerWindow(windowRows, position);
      windowStatsToUpsert.push(buildWindowStatsRow(player.id, season, window, windowStats, seasonSummary, windowRows));
    }

    radarPool.push({ id: player.id, position, summary: summarizePlayerSeason(decorated) });
  }

  for (let i = 0; i < windowStatsToUpsert.length; i += 500) {
    const chunk = windowStatsToUpsert.slice(i, i + 500);
    const { error } = await supabase.from("player_window_stats").upsert(chunk, { onConflict: "player_id,season,stat_window" });
    if (error) {
      throw new Error(`Unable to write player_window_stats for ${season}: ${error.message}`);
    }
  }

  // Radar profiles are always season-scoped (matches prior Player Detail behaviour).
  const outfieldRadarPool = radarPool.filter((player) => player.position !== "GK");
  const goalkeeperRadarPool = radarPool.filter(
    (player) => player.position === "GK" && player.summary.total_games_started >= 1
  );

  const radarRowsToUpsert: Array<{ player_id: string; season: string; profile: string; data: RadarDatum[]; computed_at: string }> = [];
  const computedAt = new Date().toISOString();

  for (const player of players) {
    const position = mapPosition(player.position);
    const isGk = position === "GK";

    radarRowsToUpsert.push({
      player_id: player.id,
      season,
      profile: "fantasy",
      data: buildRadarDataset(
        isGk ? goalkeeperRadarPool : outfieldRadarPool,
        player.id,
        fantasyMetrics,
        isGk ? 35 : 300,
        isGk ? "even" : "skewed"
      ),
      computed_at: computedAt,
    });

    if (!isGk) {
      radarRowsToUpsert.push({
        player_id: player.id,
        season,
        profile: "attacking",
        data: buildRadarDataset(outfieldRadarPool, player.id, attackingMetrics, 300),
        computed_at: computedAt,
      });
      radarRowsToUpsert.push({
        player_id: player.id,
        season,
        profile: "defensive",
        data: buildRadarDataset(outfieldRadarPool, player.id, defensiveMetrics, 300),
        computed_at: computedAt,
      });
    } else {
      radarRowsToUpsert.push({
        player_id: player.id,
        season,
        profile: "goalkeeper",
        data: buildRadarDataset(goalkeeperRadarPool, player.id, goalkeeperMetrics, 35, "even"),
        computed_at: computedAt,
      });
    }
  }

  for (let i = 0; i < radarRowsToUpsert.length; i += 500) {
    const chunk = radarRowsToUpsert.slice(i, i + 500);
    const { error } = await supabase.from("player_radar_profiles").upsert(chunk, { onConflict: "player_id,season,profile" });
    if (error) {
      throw new Error(`Unable to write player_radar_profiles for ${season}: ${error.message}`);
    }
  }

  // Fixture difficulty: computed once per (season, position) — it doesn't
  // vary by individual player, only by the position being viewed.
  const { data: fdrGameweeks, error: fdrError } = await supabase
    .from("player_gameweeks")
    .select("gameweek, raw_fantrax_pts, players!inner(team, position)")
    .eq("season", season)
    .gte("games_started", 1)
    .gt("games_played", 0);
  if (fdrError) {
    throw new Error(`Unable to load ${season} fixture-difficulty source rows: ${fdrError.message}`);
  }

  const opponentsByGwAndTeam = new Map<string, string[]>();
  for (const fixture of (fixturesData ?? []) as FixtureRow[]) {
    const homeKey = `${fixture.gameweek}:${fixture.home_team}`;
    const awayKey = `${fixture.gameweek}:${fixture.away_team}`;
    if (!opponentsByGwAndTeam.has(homeKey)) opponentsByGwAndTeam.set(homeKey, []);
    opponentsByGwAndTeam.get(homeKey)!.push(fixture.away_team);
    if (!opponentsByGwAndTeam.has(awayKey)) opponentsByGwAndTeam.set(awayKey, []);
    opponentsByGwAndTeam.get(awayKey)!.push(fixture.home_team);
  }

  const fdrRowsToUpsert: Array<{ team: string; season: string; position: string; rank: number; avg_pts_conceded: number; computed_at: string }> = [];

  for (const position of ["D", "M", "F", "G"] as const) {
    const opponentTotals = new Map<string, { pts: number; starts: number }>();

    for (const row of (fdrGameweeks ?? []) as FdrGameweekRow[]) {
      const rowPlayer = Array.isArray(row.players) ? row.players[0] : row.players;
      if (!rowPlayer || rowPlayer.position !== position) continue;
      const pts = Number(row.raw_fantrax_pts ?? 0);
      for (const opp of opponentsByGwAndTeam.get(`${row.gameweek}:${rowPlayer.team}`) ?? []) {
        const entry = opponentTotals.get(opp) ?? { pts: 0, starts: 0 };
        entry.pts += pts;
        entry.starts += 1;
        opponentTotals.set(opp, entry);
      }
    }

    [...opponentTotals.entries()]
      .map(([team, { pts, starts }]) => ({ team, avg: starts > 0 ? pts / starts : 0 }))
      .sort((a, b) => a.avg - b.avg)
      .forEach(({ team, avg }, idx) => {
        fdrRowsToUpsert.push({ team, season, position, rank: idx + 1, avg_pts_conceded: Math.round(avg * 100) / 100, computed_at: computedAt });
      });
  }

  if (fdrRowsToUpsert.length > 0) {
    const { error } = await supabase.from("team_fixture_difficulty").upsert(fdrRowsToUpsert, { onConflict: "team,season,position" });
    if (error) {
      throw new Error(`Unable to write team_fixture_difficulty for ${season}: ${error.message}`);
    }
  }

  return {
    season,
    playersProcessed: players.length,
    radarProfilesWritten: radarRowsToUpsert.length,
    fdrRowsWritten: fdrRowsToUpsert.length,
  };
}
