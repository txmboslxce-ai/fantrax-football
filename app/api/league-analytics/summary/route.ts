import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { fetchSchedule, type MatchData } from "../schedule/route";
import { fetchStandings, type StandingsEntry } from "../standings/route";
import type {
  PowerRankingEntry,
  LuckEntry,
  ConsistencyEntry,
  TrajectoryEntry,
  TradeValueEntry,
  AnalyticsPayload,
} from "../types";
import { SEASON } from "@/lib/portal/playerMetrics";

export type { AnalyticsPayload } from "../types";

// ── Metrics computation ──────────────────────────────────────────────────────

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeAnalytics(
  standings: StandingsEntry[],
  scheduleMatches: MatchData[]
): AnalyticsPayload {
  // Build score lookup: teamId → { gw → score }
  const scoresByTeam = new Map<string, Map<number, number>>();
  const scoresByGw = new Map<number, Map<string, number>>();

  for (const match of scheduleMatches) {
    if (!match.played) continue;

    // away
    if (!scoresByTeam.has(match.awayTeamId)) scoresByTeam.set(match.awayTeamId, new Map());
    scoresByTeam.get(match.awayTeamId)!.set(match.gw, match.awayScore);
    if (!scoresByGw.has(match.gw)) scoresByGw.set(match.gw, new Map());
    scoresByGw.get(match.gw)!.set(match.awayTeamId, match.awayScore);

    // home
    if (!scoresByTeam.has(match.homeTeamId)) scoresByTeam.set(match.homeTeamId, new Map());
    scoresByTeam.get(match.homeTeamId)!.set(match.gw, match.homeScore);
    scoresByGw.get(match.gw)!.set(match.homeTeamId, match.homeScore);
  }

  const playedGws = Array.from(scoresByGw.keys()).sort((a, b) => a - b);
  const numTeams = standings.length;

  // ── Luck raw (shared by power rankings and luck index) ───────────────────
  const standingsMap = new Map<string, StandingsEntry>(standings.map((s) => [s.teamId, s]));

  const luckRaw = standings.map((team) => {
    let totalHypotheticalWins = 0;
    let weeksPlayed = 0;

    for (const gw of playedGws) {
      const gwScores = scoresByGw.get(gw);
      if (!gwScores) continue;
      const myScore = gwScores.get(team.teamId);
      if (myScore === undefined) continue;

      weeksPlayed++;
      for (const [otherId, otherScore] of gwScores) {
        if (otherId === team.teamId) continue;
        if (myScore > otherScore) totalHypotheticalWins += 1;
        else if (myScore === otherScore) totalHypotheticalWins += 0.5;
      }
    }

    const expectedW =
      numTeams > 1 && weeksPlayed > 0
        ? totalHypotheticalWins / (numTeams - 1)
        : 0;

    const actualW = standingsMap.get(team.teamId)?.w ?? 0;

    return {
      teamId: team.teamId,
      teamName: team.teamName,
      actualW,
      expectedW: Math.round(expectedW * 100) / 100,
      luckScore: Math.round((actualW - expectedW) * 100) / 100,
    };
  });

  // ── Power Rankings ────────────────────────────────────────────────────────
  // simulatedWins = expectedW × (numTeams - 1), i.e. total hypothetical wins
  // across all opponents and all played weeks. Then min-max scale to 0-100.
  const simulatedWins = luckRaw.map((e) => e.expectedW * (numTeams - 1));
  const minSW = Math.min(...simulatedWins);
  const maxSW = Math.max(...simulatedWins);
  const swRange = maxSW - minSW;

  const powerRankings: PowerRankingEntry[] = luckRaw
    .map((entry, i) => {
      const rawScore = swRange > 0 ? ((simulatedWins[i]! - minSW) / swRange) * 100 : 50;
      return {
        teamId: entry.teamId,
        teamName: entry.teamName,
        powerScore: Math.round(rawScore * 10) / 10,
        actualW: entry.actualW,
        pf: standingsMap.get(entry.teamId)?.pf ?? 0,
        luckScore: entry.luckScore,
      };
    })
    .sort((a, b) => b.powerScore - a.powerScore)
    .map((entry, i) => ({ rank: i + 1, ...entry }));

  // ── Luck Index ───────────────────────────────────────────────────────────
  const luckIndex: LuckEntry[] = luckRaw
    .slice()
    .sort((a, b) => b.luckScore - a.luckScore)
    .map((entry, i) => ({ rank: i + 1, ...entry }));

  // ── Consistency ──────────────────────────────────────────────────────────
  const consistencyRaw = standings.map((team) => {
    const scores = Array.from(scoresByTeam.get(team.teamId)?.values() ?? []);
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const sd = stdDev(scores);
    return {
      teamId: team.teamId,
      teamName: team.teamName,
      avgScore: Math.round(avg * 100) / 100,
      stdDev: Math.round(sd * 100) / 100,
    };
  });

  const consistency: ConsistencyEntry[] = consistencyRaw
    .slice()
    .sort((a, b) => a.stdDev - b.stdDev)
    .map((entry, i) => ({ consistencyRank: i + 1, ...entry }));

  // ── Trajectory ──────────────────────────────────────────────────────────
  const last4Gws = playedGws.slice(-4);

  // League average score across last 4 GWs
  let leagueLast4Total = 0;
  let leagueLast4Count = 0;
  for (const gw of last4Gws) {
    const gwScores = scoresByGw.get(gw);
    if (!gwScores) continue;
    for (const score of gwScores.values()) {
      leagueLast4Total += score;
      leagueLast4Count++;
    }
  }
  const leagueLast4Avg =
    leagueLast4Count > 0
      ? Math.round((leagueLast4Total / leagueLast4Count) * 100) / 100
      : 0;

  const trajectory: TrajectoryEntry[] = standings
    .map((team) => {
      const teamGwScores = scoresByTeam.get(team.teamId);
      const last4Scores = last4Gws
        .map((gw) => teamGwScores?.get(gw))
        .filter((s): s is number => s !== undefined);
      const last4Avg =
        last4Scores.length > 0
          ? Math.round((last4Scores.reduce((a, b) => a + b, 0) / last4Scores.length) * 100) / 100
          : 0;

      return {
        teamId: team.teamId,
        teamName: team.teamName,
        last4Avg,
        leagueLast4Avg,
        trajectoryDelta: Math.round((last4Avg - leagueLast4Avg) * 100) / 100,
      };
    })
    .sort((a, b) => b.trajectoryDelta - a.trajectoryDelta);

  return {
    powerRankings,
    luckIndex,
    consistency,
    trajectory,
    tradeValues: [] as TradeValueEntry[],
    computedAt: new Date().toISOString(),
  };
}

// ── Route handler ────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get("leagueId");
  const force = searchParams.get("force") === "true";

  if (!leagueId) {
    return NextResponse.json({ message: "Missing leagueId" }, { status: 400 });
  }

  // Auth check
  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  try {
    supabase = await createServerSupabaseClient();
  } catch (err) {
    console.error("[league-analytics/summary] supabase init error:", err);
    return NextResponse.json({ message: "Failed to initialise database client." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Check cache (skip when force=true)
  if (!force) {
    const { data: cached } = await supabase
      .from("league_analytics_cache")
      .select("computed_at, payload")
      .eq("league_id", leagueId)
      .maybeSingle();

    if (cached) {
      const age = Date.now() - new Date(cached.computed_at as string).getTime();
      if (age < CACHE_TTL_MS) {
        return NextResponse.json(cached.payload);
      }
    }
  }

  // Fetch fresh data
  let standings: Awaited<ReturnType<typeof fetchStandings>>;
  let scheduleMatches: Awaited<ReturnType<typeof fetchSchedule>>;

  try {
    [standings, scheduleMatches] = await Promise.all([
      fetchStandings(leagueId),
      fetchSchedule(leagueId),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch Fantrax data";
    console.error("[league-analytics/summary] fetch error:", message);
    return NextResponse.json({ message }, { status: 502 });
  }

  if (standings.length === 0) {
    return NextResponse.json({ message: "No standings data returned from Fantrax." }, { status: 422 });
  }

  const payload = computeAnalytics(standings, scheduleMatches);

  // ── Trade Values ──────────────────────────────────────────────────────────
  const { data: rosters } = await supabase
    .from("league_rosters")
    .select("player_id, team_name")
    .eq("league_id", leagueId);

  let tradeValues: TradeValueEntry[] = [];

  if (rosters && rosters.length > 0) {
    const playerIds = rosters.map((r) => r.player_id as string);

    const [{ data: pgData }, { data: playerData }] = await Promise.all([
      supabase
        .from("player_gameweeks")
        .select("player_id, gameweek, raw_fantrax_pts")
        .in("player_id", playerIds)
        .eq("season", SEASON),
      supabase
        .from("players")
        .select("id, name, position")
        .in("id", playerIds),
    ]);

    if (pgData && playerData) {
      const gwsByPlayer = new Map<string, { gameweek: number; pts: number }[]>();
      for (const row of pgData) {
        const pid = row.player_id as string;
        if (!gwsByPlayer.has(pid)) gwsByPlayer.set(pid, []);
        gwsByPlayer.get(pid)!.push({ gameweek: row.gameweek as number, pts: row.raw_fantrax_pts as number });
      }

      const playerMap = new Map(playerData.map((p) => [p.id as string, p]));
      const rosterMap = new Map(rosters.map((r) => [r.player_id as string, r.team_name as string]));

      const rawValues = playerIds.map((pid) => {
        const gws = gwsByPlayer.get(pid) ?? [];
        const sorted = gws.slice().sort((a, b) => b.gameweek - a.gameweek);
        const last5 = sorted.slice(0, 5);
        const last5Avg = last5.length > 0 ? last5.reduce((s, g) => s + g.pts, 0) / last5.length : 0;
        const seasonAvg = gws.length > 0 ? gws.reduce((s, g) => s + g.pts, 0) / gws.length : 0;
        const rawTV = last5Avg * 0.6 + seasonAvg * 0.4;
        const player = playerMap.get(pid);
        return {
          pid,
          playerName: (player?.name as string | undefined) ?? "Unknown",
          teamName: rosterMap.get(pid) ?? "Unknown",
          position: (player?.position as string | undefined) ?? "UNK",
          rawTV: Math.round(rawTV * 100) / 100,
          last5Avg: Math.round(last5Avg * 100) / 100,
          seasonAvg: Math.round(seasonAvg * 100) / 100,
        };
      });

      const rawTVValues = rawValues.map((v) => v.rawTV);
      const minTV = Math.min(...rawTVValues);
      const maxTV = Math.max(...rawTVValues);
      const tvRange = maxTV - minTV;

      tradeValues = rawValues
        .map((v) => ({
          playerName: v.playerName,
          teamName: v.teamName,
          position: v.position,
          tradeValue: tvRange > 0 ? Math.round(((v.rawTV - minTV) / tvRange) * 1000) / 10 : 50,
          last5Avg: v.last5Avg,
          seasonAvg: v.seasonAvg,
        }))
        .sort((a, b) => b.tradeValue - a.tradeValue);
    }
  }

  const fullPayload: AnalyticsPayload = { ...payload, tradeValues };

  // Write to cache (fire-and-forget, don't block response on failure)
  const admin = createAdminSupabaseClient();
  if (admin) {
    admin
      .from("league_analytics_cache")
      .upsert({ league_id: leagueId, computed_at: fullPayload.computedAt, payload: fullPayload })
      .then(({ error }) => {
        if (error) console.error("[league-analytics/summary] cache write error:", error.message);
      });
  }

  return NextResponse.json(fullPayload);
}
