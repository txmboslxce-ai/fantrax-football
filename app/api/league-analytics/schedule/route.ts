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

  console.log(
    `[league-analytics/schedule] DEBUG raw scoringPeriods sample for league ${leagueId}:`,
    JSON.stringify(periods.slice(0, 2))
  );

  const now = Date.now();

  return periods
    .filter((p) => !p.startDate || new Date(p.startDate).getTime() <= now)
    .map((p, i) => p.number ?? i + 1)
    .sort((a, b) => a - b);
}

// ── Matchup scores (per gameweek) ────────────────────────────────────────────

type MatchupEntry = {
  awayTeamId?: string;
  awayTeamName?: string;
  awayScore?: number | string;
  awayFantasyPoints?: number | string;
  awayPoints?: number | string;
  homeTeamId?: string;
  homeTeamName?: string;
  homeScore?: number | string;
  homeFantasyPoints?: number | string;
  homePoints?: number | string;
};

type MatchupScoresResponse = {
  matchups?: MatchupEntry[];
  pageError?: FantraxErrorDetail;
};

function pickScore(entry: MatchupEntry, side: "away" | "home"): number {
  const raw =
    side === "away"
      ? entry.awayScore ?? entry.awayFantasyPoints ?? entry.awayPoints
      : entry.homeScore ?? entry.homeFantasyPoints ?? entry.homePoints;
  return parseScore(raw);
}

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

  if (matchups.length > 0) {
    console.log(
      `[league-analytics/schedule] DEBUG raw matchup sample for league ${leagueId} period ${period}:`,
      JSON.stringify(matchups[0])
    );
  }

  return matchups
    .filter((m): m is MatchupEntry & { awayTeamId: string; homeTeamId: string } =>
      Boolean(m.awayTeamId && m.homeTeamId)
    )
    .map((m) => {
      const awayScore = pickScore(m, "away");
      const homeScore = pickScore(m, "home");

      return {
        gw: period,
        awayTeamId: m.awayTeamId,
        awayTeamName: m.awayTeamName ?? "",
        awayScore,
        homeTeamId: m.homeTeamId,
        homeTeamName: m.homeTeamName ?? "",
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
