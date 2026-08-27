import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type FantraxErrorDetail = string | { code?: string; msg?: string };

function extractErrorMessage(detail: FantraxErrorDetail | undefined): string | undefined {
  if (!detail) return undefined;
  return typeof detail === "string" ? detail : detail.msg ?? detail.code;
}

export type MatchData = {
  gw: number;
  awayTeamId: string;
  awayTeamName: string;
  awayScore: number;
  homeTeamId: string;
  homeTeamName: string;
  homeScore: number;
  played: boolean;
};

function parseScore(value: number | string | undefined): number {
  if (value === undefined || value === null) return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  return isFinite(n) ? n : 0;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

// ── Scoring periods (gameweeks) ──────────────────────────────────────────────

type ScoringPeriod = { number?: number; startDate?: string; endDate?: string };

type LeagueInfoResponse = {
  scoringPeriods?: Record<string, ScoringPeriod> | ScoringPeriod[];
  pageError?: FantraxErrorDetail;
};

async function fetchScoringPeriods(leagueId: string): Promise<number[]> {
  const res = await fetch(
    `https://www.fantrax.com/fxea/general/getLeagueInfo?leagueId=${encodeURIComponent(leagueId)}&excludePlayerInfo=true`,
    { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
  );

  if (!res.ok) throw new Error(`Fantrax league info API returned ${res.status}`);

  const json = (await res.json()) as LeagueInfoResponse;
  const raw = json?.scoringPeriods;
  const periods: ScoringPeriod[] = Array.isArray(raw) ? raw : raw ? Object.values(raw) : [];

  if (periods.length === 0) {
    const detail = extractErrorMessage(json?.pageError);
    console.error(
      `[league-analytics/schedule] Unexpected Fantrax league info shape for league ${leagueId}:`,
      JSON.stringify(json).slice(0, 1000)
    );
    throw new Error(
      detail
        ? `Fantrax league info API error: ${detail}`
        : "Fantrax league info API returned no scoring periods."
    );
  }

  const now = Date.now();

  return periods
    .filter((p) => !p.startDate || new Date(p.startDate).getTime() <= now)
    .map((p, i) => p.number ?? i + 1)
    .sort((a, b) => a - b);
}

// ── Matchup scores (per gameweek) ────────────────────────────────────────────

type MatchupTeam = {
  teamId?: string;
  teamName?: string;
  score?: number | string;
};

type MatchupEntry = {
  away?: MatchupTeam;
  home?: MatchupTeam;
};

type MatchupScoresResponse = {
  matchups?: MatchupEntry[];
  pageError?: FantraxErrorDetail;
};

async function fetchMatchupsForPeriod(leagueId: string, period: number): Promise<MatchData[]> {
  const res = await fetch(
    `https://www.fantrax.com/fxea/general/getMatchupScores?leagueId=${encodeURIComponent(leagueId)}&period=${period}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
  );

  if (!res.ok) throw new Error(`Fantrax matchup scores API returned ${res.status} for period ${period}`);

  const json = (await res.json()) as MatchupScoresResponse;
  const matchups = json?.matchups;

  if (!Array.isArray(matchups)) {
    const detail = extractErrorMessage(json?.pageError);
    console.error(
      `[league-analytics/schedule] Unexpected Fantrax matchup scores shape for league ${leagueId} period ${period}:`,
      JSON.stringify(json).slice(0, 1000)
    );
    throw new Error(
      detail
        ? `Fantrax matchup scores API error: ${detail}`
        : "Fantrax matchup scores API returned an unexpected response shape."
    );
  }

  return matchups
    .filter((m): m is MatchupEntry & { away: { teamId: string }; home: { teamId: string } } =>
      Boolean(m.away?.teamId && m.home?.teamId)
    )
    .map((m) => {
      const awayScore = parseScore(m.away.score);
      const homeScore = parseScore(m.home.score);

      return {
        gw: period,
        awayTeamId: m.away.teamId,
        awayTeamName: m.away.teamName ?? "",
        awayScore,
        homeTeamId: m.home.teamId,
        homeTeamName: m.home.teamName ?? "",
        homeScore,
        played: awayScore > 0 && homeScore > 0,
      };
    });
}

export async function fetchSchedule(leagueId: string): Promise<MatchData[]> {
  const periods = await fetchScoringPeriods(leagueId);
  const matchesByPeriod = await mapWithConcurrency(periods, 5, (period) =>
    fetchMatchupsForPeriod(leagueId, period)
  );
  return matchesByPeriod.flat();
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get("leagueId");

  if (!leagueId) {
    return NextResponse.json({ message: "Missing leagueId" }, { status: 400 });
  }

  try {
    const matches = await fetchSchedule(leagueId);
    return NextResponse.json(matches);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch schedule";
    return NextResponse.json({ message }, { status: 502 });
  }
}
