export type PowerRankingEntry = {
  rank: number;
  teamId: string;
  teamName: string;
  powerScore: number;
  actualW: number;
  pf: number;
  luckScore: number;
};

export type LuckEntry = {
  rank: number;
  teamId: string;
  teamName: string;
  actualW: number;
  expectedW: number;
  luckScore: number;
};

export type ConsistencyEntry = {
  consistencyRank: number;
  teamId: string;
  teamName: string;
  avgScore: number;
  stdDev: number;
};

export type TrajectoryEntry = {
  teamId: string;
  teamName: string;
  last4Avg: number;
  leagueLast4Avg: number;
  trajectoryDelta: number;
};

export type TradeValueEntry = {
  playerName: string;
  teamName: string;
  position: string;
  tradeValue: number;
  last5Avg: number;
  seasonAvg: number;
};

export type AnalyticsPayload = {
  powerRankings: PowerRankingEntry[];
  luckIndex: LuckEntry[];
  consistency: ConsistencyEntry[];
  trajectory: TrajectoryEntry[];
  tradeValues: TradeValueEntry[];
  computedAt: string;
};
