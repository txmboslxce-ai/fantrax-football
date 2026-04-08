import StatsTableClient from "@/app/portal/stats/StatsTableClient";
import PremiumGate from "@/components/PremiumGate";
import { SEASON, mapPosition, type PlayerTableWindowKey } from "@/lib/portal/playerMetrics";
import { isPremiumUser } from "@/lib/premium";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type StatsWindowRow = {
  season_pts: number;
  avg_pts_per_gw: number;
  ghost_pts_per_gw: number;
  goals: number;
  assists: number;
  key_passes: number;
  shots_on_target: number;
  dribbles_succeeded: number;
  dispossessed: number;
  tackles_won: number;
  interceptions: number;
  clearances: number;
  blocked_shots: number;
  aerials_won: number;
  accurate_crosses: number;
  goals_against_outfield: number;
  clean_sheets: number;
  saves: number;
  penalty_saves: number;
  goals_against: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
  penalties_missed: number;
  penalties_drawn: number;
  games_played: number;
  games_started: number;
  minutes_played: number;
};

type StatsPlayerRecord = {
  id: string;
  player: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  ownershipPct: number;
  chanceOfPlaying: number | null;
  availabilityStatus: string | null;
  availabilityNews: string | null;
  windows: Record<PlayerTableWindowKey, StatsWindowRow>;
};

type StatsPlayerGameweekRow = {
  player_id: string;
  gameweek: number;
  games_played: number;
  games_started: number;
  minutes_played: number;
  raw_fantrax_pts: number | string | null;
  ghost_pts: number | string | null;
  goals: number | null;
  assists: number | null;
  key_passes: number | null;
  shots_on_target: number | null;
  dribbles_succeeded: number | null;
  dispossessed: number | null;
  tackles_won: number | null;
  interceptions: number | null;
  clearances: number | null;
  blocked_shots: number | null;
  aerials_won: number | null;
  accurate_crosses: number | null;
  goals_against_outfield: number | null;
  clean_sheet: number | null;
  saves: number | null;
  penalty_saves: number | null;
  goals_against: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  own_goals: number | null;
  penalties_missed: number | null;
  penalties_drawn: number | null;
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

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseOwnership(value: string | null): number {
  if (!value) {
    return 0;
  }

  const numeric = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

function summarizeStatsWindow(rows: StatsPlayerGameweekRow[]): StatsWindowRow {
  const playedRows = rows.filter((row) => Number(row.games_played ?? 0) > 0);
  const totalSeasonPts = playedRows.reduce((sum, row) => sum + toNumber(row.raw_fantrax_pts), 0);
  const totalGhostPts = playedRows.reduce((sum, row) => sum + toNumber(row.ghost_pts), 0);
  const playedGameweeks = playedRows.length;

  return {
    season_pts: roundTo2(totalSeasonPts),
    avg_pts_per_gw: roundTo2(playedGameweeks > 0 ? totalSeasonPts / playedGameweeks : 0),
    ghost_pts_per_gw: roundTo2(playedGameweeks > 0 ? totalGhostPts / playedGameweeks : 0),
    goals: playedRows.reduce((sum, row) => sum + Number(row.goals ?? 0), 0),
    assists: playedRows.reduce((sum, row) => sum + Number(row.assists ?? 0), 0),
    key_passes: playedRows.reduce((sum, row) => sum + Number(row.key_passes ?? 0), 0),
    shots_on_target: playedRows.reduce((sum, row) => sum + Number(row.shots_on_target ?? 0), 0),
    dribbles_succeeded: playedRows.reduce((sum, row) => sum + Number(row.dribbles_succeeded ?? 0), 0),
    dispossessed: playedRows.reduce((sum, row) => sum + Number(row.dispossessed ?? 0), 0),
    tackles_won: playedRows.reduce((sum, row) => sum + Number(row.tackles_won ?? 0), 0),
    interceptions: playedRows.reduce((sum, row) => sum + Number(row.interceptions ?? 0), 0),
    clearances: playedRows.reduce((sum, row) => sum + Number(row.clearances ?? 0), 0),
    blocked_shots: playedRows.reduce((sum, row) => sum + Number(row.blocked_shots ?? 0), 0),
    aerials_won: playedRows.reduce((sum, row) => sum + Number(row.aerials_won ?? 0), 0),
    accurate_crosses: playedRows.reduce((sum, row) => sum + Number(row.accurate_crosses ?? 0), 0),
    goals_against_outfield: playedRows.reduce((sum, row) => sum + Number(row.goals_against_outfield ?? 0), 0),
    clean_sheets: playedRows.reduce((sum, row) => sum + Number(row.clean_sheet ?? 0), 0),
    saves: playedRows.reduce((sum, row) => sum + Number(row.saves ?? 0), 0),
    penalty_saves: playedRows.reduce((sum, row) => sum + Number(row.penalty_saves ?? 0), 0),
    goals_against: playedRows.reduce((sum, row) => sum + Number(row.goals_against ?? 0), 0),
    yellow_cards: playedRows.reduce((sum, row) => sum + Number(row.yellow_cards ?? 0), 0),
    red_cards: playedRows.reduce((sum, row) => sum + Number(row.red_cards ?? 0), 0),
    own_goals: playedRows.reduce((sum, row) => sum + Number(row.own_goals ?? 0), 0),
    penalties_missed: playedRows.reduce((sum, row) => sum + Number(row.penalties_missed ?? 0), 0),
    penalties_drawn: playedRows.reduce((sum, row) => sum + Number(row.penalties_drawn ?? 0), 0),
    games_played: playedRows.reduce((sum, row) => sum + Number(row.games_played ?? 0), 0),
    games_started: playedRows.reduce((sum, row) => sum + Number(row.games_started ?? 0), 0),
    minutes_played: playedRows.reduce((sum, row) => sum + Number(row.minutes_played ?? 0), 0),
  };
}

export default async function StatsPage() {
  const supabase = await createServerSupabaseClient();

  const [
    {
      data: { user },
    },
    { data: players, error: playersError },
    { data: gameweeks, error: gameweeksError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("players")
      .select("id, name, team, position, ownership_pct, fpl_player_data(chance_of_playing_next_round, status, news)")
      .order("name"),
    supabase
      .from("player_gameweeks")
      .select(
        "player_id, gameweek, games_played, games_started, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, key_passes, shots_on_target, dribbles_succeeded, dispossessed, tackles_won, interceptions, clearances, blocked_shots, aerials_won, accurate_crosses, goals_against_outfield, clean_sheet, saves, penalty_saves, goals_against, yellow_cards, red_cards, own_goals, penalties_missed, penalties_drawn"
      )
      .eq("season", SEASON),
  ]);

  if (playersError) {
    throw new Error(`Unable to load players: ${playersError.message}`);
  }
  if (gameweeksError) {
    throw new Error(`Unable to load player gameweeks: ${gameweeksError.message}`);
  }

  const rowsByPlayer = new Map<string, StatsPlayerGameweekRow[]>();
  let latestGameweek = 0;

  for (const row of (gameweeks ?? []) as StatsPlayerGameweekRow[]) {
    latestGameweek = Math.max(latestGameweek, Number(row.gameweek ?? 0));
    const existing = rowsByPlayer.get(row.player_id);
    if (existing) {
      existing.push(row);
      continue;
    }
    rowsByPlayer.set(row.player_id, [row]);
  }

  const windowStarts: Record<PlayerTableWindowKey, number> = {
    last5: Math.max(1, latestGameweek - 4),
    last10: Math.max(1, latestGameweek - 9),
    season: 1,
  };

  const statsRows: StatsPlayerRecord[] = ((players ?? []) as Array<{
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
  }>)
    .map((player) => {
      const playerRows = (rowsByPlayer.get(player.id) ?? []).sort((a, b) => a.gameweek - b.gameweek);
      const availabilityRaw = Array.isArray(player.fpl_player_data) ? player.fpl_player_data[0] : player.fpl_player_data;

      return {
        id: player.id,
        player: player.name,
        team: player.team,
        position: mapPosition(player.position),
        ownershipPct: parseOwnership(player.ownership_pct),
        chanceOfPlaying: availabilityRaw?.chance_of_playing_next_round ?? null,
        availabilityStatus: availabilityRaw?.status ?? null,
        availabilityNews: availabilityRaw?.news ?? null,
        windows: {
          last5: summarizeStatsWindow(playerRows.filter((row) => row.gameweek >= windowStarts.last5)),
          last10: summarizeStatsWindow(playerRows.filter((row) => row.gameweek >= windowStarts.last10)),
          season: summarizeStatsWindow(playerRows),
        },
      };
    })
    .sort((a, b) => b.windows.season.season_pts - a.windows.season.season_pts);

  const hasPremiumAccess = await isPremiumUser(user?.id);

  return (
    <PremiumGate isPremium={hasPremiumAccess}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black text-brand-cream sm:text-4xl">Player Stats</h1>
          <p className="mt-2 text-sm text-brand-creamDark">Filterable and sortable season {SEASON} player output.</p>
        </div>
        <StatsTableClient rows={statsRows} />
      </div>
    </PremiumGate>
  );
}
