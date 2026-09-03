import type { SupabaseClient } from "@supabase/supabase-js";
import { bzzoiroGet } from "@/lib/bsd/client";
import { BSD_ABBREV_TO_TEAM_ID } from "@/lib/bsd/teams";

// Shots this close to goal (BsdShot.x -- "distance from the goal being shot
// at", same convention used by the fixture page's Shot Map) count as inside
// the box. Matches BOX_DEPTH in app/portal/fixtures/ShotMap.tsx.
const BOX_DEPTH = 16.5;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type RawEventRow = {
  id: number;
  home_team_id: number;
  away_team_id: number;
  status: string;
};

type RawEventListResponse = {
  results: RawEventRow[];
};

// Deliberately separate from findBsdEventId (lib/bsd/events.ts), which only
// returns an id for live display -- the backfill also needs `status` so it
// never persists a match that hasn't actually finished yet.
async function resolveBsdEventForFixture(fixture: {
  homeAbbrev: string;
  awayAbbrev: string;
  kickoffAt: string;
}): Promise<RawEventRow | null> {
  const homeTeamId = BSD_ABBREV_TO_TEAM_ID[fixture.homeAbbrev];
  const awayTeamId = BSD_ABBREV_TO_TEAM_ID[fixture.awayAbbrev];
  if (!homeTeamId || !awayTeamId) {
    return null;
  }

  const kickoff = new Date(fixture.kickoffAt);
  if (Number.isNaN(kickoff.getTime())) {
    return null;
  }

  const dateFrom = new Date(kickoff.getTime() - ONE_DAY_MS).toISOString().slice(0, 10);
  const dateTo = new Date(kickoff.getTime() + ONE_DAY_MS).toISOString().slice(0, 10);

  const data = await bzzoiroGet<RawEventListResponse>(
    "/events/",
    { team_id: String(homeTeamId), date_from: dateFrom, date_to: dateTo },
    3600
  );

  return data.results.find((event) => event.home_team_id === homeTeamId && event.away_team_id === awayTeamId) ?? null;
}

type RawTeamStatsBlock = {
  total_shots?: number;
  shots_on_target?: number;
  shots_inside_box?: number;
  shots_outside_box?: number;
  big_chances?: number;
  big_chances_scored?: number;
  big_chances_missed?: number;
  touches_in_penalty_area?: number;
  tackles_won?: number;
  interceptions?: number;
  clearances?: number;
  corner_kicks?: number;
  dispossessed?: number;
  blocked_shots?: number;
  yellow_cards?: number;
  red_cards?: number | null;
  ball_possession?: number;
  pass_accuracy_pct?: number;
  dangerous_attack_pct?: number;
  xg?: { actual: number | null; estimated: boolean };
  // Every other field (crosses, dribbles, aerial_duels, long_balls,
  // ground_duels, final_third_phase, ...) is unmapped here but preserved by
  // storing this whole block as `raw` in the table.
  [key: string]: unknown;
};

type RawShot = {
  min: number;
  home: boolean;
  type: string;
  sit: string;
  body: string;
  xg: number;
  xgot: number | null;
  pos: { x: number; y: number };
  player_id: number;
};

type RawEventStats = {
  stats: { home: RawTeamStatsBlock; away: RawTeamStatsBlock };
  shotmap: RawShot[];
};

type RawIncidentSequenceStep = {
  pid: number;
  player: string;
  event: string;
  assist?: boolean;
};

type RawIncident = {
  type: string;
  minute: number;
  player_id?: number;
  is_home?: boolean;
  goal_type?: string;
  sequence?: RawIncidentSequenceStep[];
};

type RawIncidentsResponse = {
  incidents: RawIncident[];
};

function extractTeamStatsRow(fixtureId: string, bsdEventId: number, teamAbbrev: string, isHome: boolean, block: RawTeamStatsBlock) {
  return {
    fixture_id: fixtureId,
    bsd_event_id: bsdEventId,
    team_abbrev: teamAbbrev,
    is_home: isHome,
    expected_goals: block.xg?.actual ?? null,
    total_shots: block.total_shots ?? null,
    shots_on_target: block.shots_on_target ?? null,
    shots_inside_box: block.shots_inside_box ?? null,
    shots_outside_box: block.shots_outside_box ?? null,
    big_chances: block.big_chances ?? null,
    big_chances_scored: block.big_chances_scored ?? null,
    big_chances_missed: block.big_chances_missed ?? null,
    touches_in_penalty_area: block.touches_in_penalty_area ?? null,
    tackles_won: block.tackles_won ?? null,
    interceptions: block.interceptions ?? null,
    clearances: block.clearances ?? null,
    corner_kicks: block.corner_kicks ?? null,
    dispossessed: block.dispossessed ?? null,
    blocked_shots: block.blocked_shots ?? null,
    yellow_cards: block.yellow_cards ?? null,
    red_cards: block.red_cards ?? null,
    ball_possession: block.ball_possession ?? null,
    pass_accuracy_pct: block.pass_accuracy_pct ?? null,
    dangerous_attack_pct: block.dangerous_attack_pct ?? null,
    raw: block,
    updated_at: new Date().toISOString(),
  };
}

// Builds "scorer bsd id + minute" -> assister bsd id, from goal incidents'
// own sequence (the only place BSD ties a passer's id to a specific chance;
// shots that didn't score carry no passer at all -- see the migration
// comment on player_match_shot_stats.assists for why this means no xA).
function buildAssistLookup(incidents: RawIncident[]): Map<string, number> {
  const lookup = new Map<string, number>();
  for (const incident of incidents) {
    if (incident.type !== "goal" || incident.player_id == null) continue;
    const assistStep = incident.sequence?.find((step) => step.assist);
    if (assistStep) {
      lookup.set(`${incident.player_id}:${incident.minute}`, assistStep.pid);
    }
  }
  return lookup;
}

// Own goals show up in the shotmap tagged to whoever deflected it in, with a
// synthetic xg value (xg_estimated: true -- confirmed by cross-checking a
// real match, where a single own-goal entry's estimated xg accounted for
// almost the entire gap between our shot-level xg sum and BSD's own official
// team xG figure). Crediting that to a player -- often a goalkeeper, who
// otherwise never registers a shot -- would corrupt their profile, so these
// are matched by (player_id, minute) against own-goal incidents and dropped
// entirely rather than aggregated.
function buildOwnGoalKeys(incidents: RawIncident[]): Set<string> {
  const keys = new Set<string>();
  for (const incident of incidents) {
    if (incident.type === "goal" && incident.goal_type === "ownGoal" && incident.player_id != null) {
      keys.add(`${incident.player_id}:${incident.minute}`);
    }
  }
  return keys;
}

type PlayerShotAgg = {
  bsdPlayerId: number;
  isHome: boolean;
  shots: number;
  shotsOnTarget: number;
  shotsInsideBox: number;
  shotsOutsideBox: number;
  headers: number;
  goals: number;
  assists: number;
  xg: number;
  xgot: number;
  rawShots: RawShot[];
};

function aggregatePlayerShots(shotmap: RawShot[], assistLookup: Map<string, number>, ownGoalKeys: Set<string>): Map<number, PlayerShotAgg> {
  const byPlayer = new Map<number, PlayerShotAgg>();

  function getOrCreate(bsdPlayerId: number, isHome: boolean): PlayerShotAgg {
    let row = byPlayer.get(bsdPlayerId);
    if (!row) {
      row = { bsdPlayerId, isHome, shots: 0, shotsOnTarget: 0, shotsInsideBox: 0, shotsOutsideBox: 0, headers: 0, goals: 0, assists: 0, xg: 0, xgot: 0, rawShots: [] };
      byPlayer.set(bsdPlayerId, row);
    }
    return row;
  }

  for (const shot of shotmap) {
    if (shot.type === "goal" && ownGoalKeys.has(`${shot.player_id}:${shot.min}`)) continue;

    const row = getOrCreate(shot.player_id, shot.home);
    row.shots += 1;
    row.xg += shot.xg;
    if (shot.xgot != null) row.xgot += shot.xgot;
    if (shot.type !== "miss" && shot.type !== "block") row.shotsOnTarget += 1;
    if (shot.pos.x <= BOX_DEPTH) row.shotsInsideBox += 1;
    else row.shotsOutsideBox += 1;
    if (shot.body === "head") row.headers += 1;
    row.rawShots.push(shot);

    if (shot.type === "goal") {
      row.goals += 1;
      const assisterBsdId = assistLookup.get(`${shot.player_id}:${shot.min}`);
      if (assisterBsdId != null) {
        const assisterRow = getOrCreate(assisterBsdId, shot.home);
        assisterRow.assists += 1;
      }
    }
  }

  return byPlayer;
}

export type BackfillResult = { fixtureId: string; status: "backfilled" | "not_finished" | "no_bsd_match" | "error"; message?: string };

export async function backfillFixtureMatchStats(
  db: SupabaseClient,
  fixture: { id: string; homeAbbrev: string; awayAbbrev: string; kickoffAt: string | null }
): Promise<BackfillResult> {
  if (!fixture.kickoffAt) {
    return { fixtureId: fixture.id, status: "no_bsd_match", message: "No kickoff time" };
  }

  let event: RawEventRow | null;
  try {
    event = await resolveBsdEventForFixture({ homeAbbrev: fixture.homeAbbrev, awayAbbrev: fixture.awayAbbrev, kickoffAt: fixture.kickoffAt });
  } catch (error) {
    return { fixtureId: fixture.id, status: "error", message: error instanceof Error ? error.message : "Failed to resolve BSD event" };
  }

  if (!event) {
    return { fixtureId: fixture.id, status: "no_bsd_match" };
  }
  if (event.status !== "finished") {
    return { fixtureId: fixture.id, status: "not_finished", message: `BSD status: ${event.status}` };
  }

  let stats: RawEventStats;
  let incidents: RawIncidentsResponse;
  try {
    [stats, incidents] = await Promise.all([
      bzzoiroGet<RawEventStats>(`/events/${event.id}/stats/`, {}, 3600),
      bzzoiroGet<RawIncidentsResponse>(`/events/${event.id}/incidents/`, {}, 3600),
    ]);
  } catch (error) {
    return { fixtureId: fixture.id, status: "error", message: error instanceof Error ? error.message : "Failed to fetch BSD match stats" };
  }

  const teamRows = [
    extractTeamStatsRow(fixture.id, event.id, fixture.homeAbbrev, true, stats.stats.home),
    extractTeamStatsRow(fixture.id, event.id, fixture.awayAbbrev, false, stats.stats.away),
  ];

  const { error: teamStatsError } = await db.from("team_match_stats").upsert(teamRows, { onConflict: "fixture_id,is_home" });
  if (teamStatsError) {
    return { fixtureId: fixture.id, status: "error", message: `team_match_stats: ${teamStatsError.message}` };
  }

  const assistLookup = buildAssistLookup(incidents.incidents ?? []);
  const ownGoalKeys = buildOwnGoalKeys(incidents.incidents ?? []);
  const playerAgg = aggregatePlayerShots(stats.shotmap ?? [], assistLookup, ownGoalKeys);

  const playerRows = Array.from(playerAgg.values()).map((row) => ({
    fixture_id: fixture.id,
    bsd_event_id: event.id,
    bsd_player_id: row.bsdPlayerId,
    team_abbrev: row.isHome ? fixture.homeAbbrev : fixture.awayAbbrev,
    is_home: row.isHome,
    shots: row.shots,
    shots_on_target: row.shotsOnTarget,
    shots_inside_box: row.shotsInsideBox,
    shots_outside_box: row.shotsOutsideBox,
    headers: row.headers,
    goals: row.goals,
    assists: row.assists,
    xg: Math.round(row.xg * 1000) / 1000,
    xgot: Math.round(row.xgot * 1000) / 1000,
    raw: row.rawShots,
    updated_at: new Date().toISOString(),
  }));

  if (playerRows.length > 0) {
    const { error: playerStatsError } = await db.from("player_match_shot_stats").upsert(playerRows, { onConflict: "fixture_id,bsd_player_id" });
    if (playerStatsError) {
      return { fixtureId: fixture.id, status: "error", message: `player_match_shot_stats: ${playerStatsError.message}` };
    }
  }

  return { fixtureId: fixture.id, status: "backfilled" };
}
