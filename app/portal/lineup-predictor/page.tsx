import LineupPredictorClient from "@/app/portal/lineup-predictor/LineupPredictorClient";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { SEASON } from "@/lib/portal/playerMetrics";

export type LineupPlayer = {
  playerId: string;
  playerName: string;
  position: "G" | "D" | "M" | "F";
  isStarter: boolean;
  startProbability: number;
  prevGwMinutes: number | null;
  ptsPerStart: number;
  gamesStarted: number;
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
};

export type TeamLineup = {
  team: string;
  gameweek: number;
  players: LineupPlayer[];
};

type PredictionRow = {
  player_id: string;
  start_probability: number | string | null;
  players:
    | {
        name: string;
        team: string;
        position: "G" | "D" | "M" | "F";
        fpl_player_data:
          | { chance_of_playing_next_round: number | null; status: string | null; news: string | null }
          | Array<{ chance_of_playing_next_round: number | null; status: string | null; news: string | null }>
          | null;
      }
    | Array<{
        name: string;
        team: string;
        position: "G" | "D" | "M" | "F";
        fpl_player_data:
          | { chance_of_playing_next_round: number | null; status: string | null; news: string | null }
          | Array<{ chance_of_playing_next_round: number | null; status: string | null; news: string | null }>
          | null;
      }>
    | null;
};

type GwRow = {
  player_id: string;
  gameweek: number;
  games_played: number | null;
  games_started: number | null;
  minutes_played: number | null;
  raw_fantrax_pts: number | string | null;
};

function toNum(v: number | string | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const p = Number.parseFloat(v);
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

const POS_ORDER: Record<"G" | "D" | "M" | "F", number> = { G: 0, D: 1, M: 2, F: 3 };

export default async function LineupPredictorPage() {
  const supabase = await createServerSupabaseClient();

  // 1 — find the latest uploaded GW (games_played > 0, same pattern as FixturePlannerClient)
  const { data: latestGwData } = await supabase
    .from("player_gameweeks")
    .select("gameweek")
    .eq("season", SEASON)
    .gt("games_played", 0)
    .order("gameweek", { ascending: false })
    .limit(1);

  const latestGw: number = (latestGwData ?? [])[0]?.gameweek ?? 0;
  const nextGw = latestGw + 1;

  // 2 — load predictions, season gameweeks, and previous GW minutes in parallel
  const [
    { data: predictionsRaw, error: predictionsError },
    { data: gwsRaw, error: gwsError },
    { data: prevGwRaw },
  ] = await Promise.all([
    supabase
      .from("player_predictions")
      .select(
        "player_id, start_probability, players!inner(name, team, position, fpl_player_data(chance_of_playing_next_round, status, news))",
      )
      .eq("season", SEASON)
      .eq("gameweek", nextGw)
      .order("start_probability", { ascending: false, nullsFirst: false }),
    supabase
      .from("player_gameweeks")
      .select("player_id, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts")
      .eq("season", SEASON),
    // Previous GW minutes — only the latest played gameweek
    supabase
      .from("player_gameweeks")
      .select("player_id, gameweek, games_played, minutes_played")
      .eq("season", SEASON)
      .eq("gameweek", latestGw),
  ]);

  if (predictionsError) throw new Error(`Failed to load predictions: ${predictionsError.message}`);
  if (gwsError) throw new Error(`Failed to load gameweeks: ${gwsError.message}`);

  // 3 — build per-player season aggregates
  const seasonByPlayer = new Map<string, { totalPts: number; starts: number }>();
  for (const row of (gwsRaw ?? []) as GwRow[]) {
    const gs = Number(row.games_started ?? 0);
    const pts = toNum(row.raw_fantrax_pts);
    const existing = seasonByPlayer.get(row.player_id);
    if (existing) {
      if (gs === 1) { existing.totalPts += pts; existing.starts += 1; }
    } else {
      seasonByPlayer.set(row.player_id, { totalPts: gs === 1 ? pts : 0, starts: gs === 1 ? 1 : 0 });
    }
  }

  // 4 — prev GW minutes lookup
  const prevGwMins = new Map<string, number | null>();
  for (const row of (prevGwRaw ?? []) as GwRow[]) {
    const gp = Number(row.games_played ?? 0);
    prevGwMins.set(row.player_id, gp > 0 ? Number(row.minutes_played ?? 0) : null);
  }

  // 5 — group predictions by team, sort into starters then subs
  const teamMap = new Map<string, LineupPlayer[]>();

  for (const raw of (predictionsRaw ?? []) as PredictionRow[]) {
    const player = Array.isArray(raw.players) ? raw.players[0] : raw.players;
    if (!player) continue;

    const availRaw = Array.isArray(player.fpl_player_data) ? player.fpl_player_data[0] : player.fpl_player_data;
    const sp = toNum(raw.start_probability);
    const season = seasonByPlayer.get(raw.player_id) ?? { totalPts: 0, starts: 0 };

    const lp: LineupPlayer = {
      playerId: raw.player_id,
      playerName: player.name,
      position: player.position,
      isStarter: sp >= 0.5,
      startProbability: sp,
      prevGwMinutes: prevGwMins.get(raw.player_id) ?? null,
      ptsPerStart: season.starts > 0 ? Math.round((season.totalPts / season.starts) * 100) / 100 : 0,
      gamesStarted: season.starts,
      chanceOfPlaying: availRaw?.chance_of_playing_next_round ?? null,
      availabilityStatus: availRaw?.status ?? null,
      availabilityNews: availRaw?.news ?? null,
    };

    const existing = teamMap.get(player.team);
    if (existing) existing.push(lp);
    else teamMap.set(player.team, [lp]);
  }

  // 6 — for each team sort: starters by position order, then subs by startProb desc
  const lineups: TeamLineup[] = Array.from(teamMap.entries())
    .map(([team, players]) => {
      const starters = players
        .filter((p) => p.isStarter)
        .sort((a, b) => POS_ORDER[a.position] - POS_ORDER[b.position] || b.startProbability - a.startProbability);
      const subs = players
        .filter((p) => !p.isStarter)
        .sort((a, b) => b.startProbability - a.startProbability);
      return { team, gameweek: nextGw, players: [...starters, ...subs] };
    })
    .sort((a, b) => a.team.localeCompare(b.team));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Lineup Predictor</h1>
        <p className="mt-2 text-sm text-brand-creamDark">
          Predicted starting XIs for GW{nextGw} — {SEASON}. Subs ranked by start probability.
        </p>
      </div>
      <LineupPredictorClient lineups={lineups} />
    </div>
  );
}
