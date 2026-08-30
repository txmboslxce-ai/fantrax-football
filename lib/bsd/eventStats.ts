import { bzzoiroGet } from "@/lib/bsd/client";

export type BsdShotType = "goal" | "save" | "block" | "miss";

export type BsdShot = {
  minute: number;
  isHome: boolean;
  type: BsdShotType;
  situation: string;
  body: string;
  xg: number;
  // Distance-from-the-goal-being-shot-at coordinates (small x = close to
  // goal), independent of which physical end of the pitch it happened at --
  // the same convention for both teams, so rendering has to mirror one side
  // to put both attacking goals on opposite edges of a shared pitch.
  x: number;
  y: number;
  playerId: number;
};

export type BsdMomentumPoint = {
  minute: number;
  value: number;
};

export type BsdAveragePosition = {
  playerId: number;
  name: string;
  jerseyNumber: number;
  position: string;
  // Progress-up-the-pitch coordinates (small x = near this team's own goal),
  // the opposite sense from BsdShot's x -- see rendering notes where used.
  x: number;
  y: number;
};

export type BsdXgPoint = {
  minute: number;
  xgHome: number;
  xgAway: number;
  cumHome: number;
  cumAway: number;
};

export type BsdEventStats = {
  shots: BsdShot[];
  momentum: BsdMomentumPoint[];
  averagePositions: { home: BsdAveragePosition[]; away: BsdAveragePosition[] };
  xgFlow: BsdXgPoint[];
  totalXg: { home: number | null; away: number | null };
};

type RawShot = {
  min: number;
  home: boolean;
  type: BsdShotType;
  sit: string;
  body: string;
  xg: number;
  pos: { x: number; y: number };
  player_id: number;
};

type RawMomentumPoint = { m: number; v: number };

type RawAveragePosition = {
  n: number;
  x: number;
  y: number;
  pos: string;
  name: string;
  player_id: number;
};

type RawXgPoint = { m: number; xg_home: number; xg_away: number; cum_home: number; cum_away: number };

type RawEventStatsResponse = {
  stats: {
    home: { xg?: { actual: number | null } };
    away: { xg?: { actual: number | null } };
  };
  shotmap: RawShot[];
  momentum: RawMomentumPoint[];
  average_positions: { home?: RawAveragePosition[]; away?: RawAveragePosition[] };
  xg_per_minute: RawXgPoint[];
};

function toAveragePosition(row: RawAveragePosition): BsdAveragePosition {
  return { playerId: row.player_id, name: row.name, jerseyNumber: row.n, position: row.pos, x: row.x, y: row.y };
}

export async function fetchBsdEventStats(eventId: number): Promise<BsdEventStats> {
  const data = await bzzoiroGet<RawEventStatsResponse>(`/events/${eventId}/stats/`, {}, 120);

  const shots: BsdShot[] = data.shotmap.map((row) => ({
    minute: row.min,
    isHome: row.home,
    type: row.type,
    situation: row.sit,
    body: row.body,
    xg: row.xg,
    x: row.pos.x,
    y: row.pos.y,
    playerId: row.player_id,
  }));

  const momentum: BsdMomentumPoint[] = data.momentum.map((row) => ({ minute: row.m, value: row.v }));

  const xgFlow: BsdXgPoint[] = data.xg_per_minute.map((row) => ({
    minute: row.m,
    xgHome: row.xg_home,
    xgAway: row.xg_away,
    cumHome: row.cum_home,
    cumAway: row.cum_away,
  }));

  return {
    shots,
    momentum,
    averagePositions: {
      home: (data.average_positions.home ?? []).map(toAveragePosition),
      away: (data.average_positions.away ?? []).map(toAveragePosition),
    },
    xgFlow,
    totalXg: { home: data.stats.home.xg?.actual ?? null, away: data.stats.away.xg?.actual ?? null },
  };
}
