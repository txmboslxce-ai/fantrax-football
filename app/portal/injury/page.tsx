import InjuryTableClient from "@/app/portal/injury/InjuryTableClient";
import { mapPosition } from "@/lib/portal/playerMetrics";
import { emptyWindowStatsRow, fetchPlayerWindowStatsBySeason } from "@/lib/portal/summaryAdapters";
import {
  INJURY_TABLE_STATUS_CODES,
  formatInjurySyncedAt,
  isInjuryTableStatusCode,
  mapInjuryTableStatusLabel,
  type InjuryTableStatusCode,
  type InjuryTableStatusLabel,
} from "@/lib/portal/injuryStatus";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentSeason } from "@/lib/season/current";

export type InjuryPlayerRow = {
  id: string;
  name: string;
  team: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  ownershipPct: number;
  seasonPts: number;
  status: InjuryTableStatusCode;
  statusLabel: InjuryTableStatusLabel;
  chanceNextRound: number | null;
  description: string | null;
  scoutLink: string | null;
};

type FplPlayerDataRow = {
  status: string | null;
  chance_of_playing_next_round: number | null;
  news: string | null;
  scout_news_link: string | null;
  players:
    | { id: string; name: string; team: string; position: string; ownership_pct: string | null; fantrax_id: string | null }
    | Array<{ id: string; name: string; team: string; position: string; ownership_pct: string | null; fantrax_id: string | null }>
    | null;
};

function parseOwnership(value: string | null): number {
  if (!value) {
    return 0;
  }

  const numeric = Number.parseFloat(value.replace("%", "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

async function getInjuryTableData(season: string): Promise<{ players: InjuryPlayerRow[]; lastSyncedAt: string | null }> {
  const supabase = await createServerSupabaseClient();

  const [{ data: poolRows, error: poolError }, windowRowByPlayer, { data: latestSyncRow, error: latestSyncError }] = await Promise.all([
    supabase.from("season_player_pool").select("fantrax_id").eq("season", season),
    fetchPlayerWindowStatsBySeason(season, "season"),
    supabase.from("fpl_player_data").select("synced_at").eq("season", season).order("synced_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (poolError) {
    throw new Error(`Unable to load the ${season} player pool: ${poolError.message}`);
  }
  if (latestSyncError) {
    throw new Error(`Unable to load the last FPL sync time: ${latestSyncError.message}`);
  }

  const poolFantraxIds = new Set((poolRows ?? []).map((row) => row.fantrax_id as string));

  const { data: fplRows, error: fplError } = await supabase
    .from("fpl_player_data")
    .select("status, chance_of_playing_next_round, news, scout_news_link, players!inner(id, name, team, position, ownership_pct, fantrax_id)")
    .eq("season", season)
    .in("status", INJURY_TABLE_STATUS_CODES as unknown as string[]);

  if (fplError) {
    throw new Error(`Unable to load injury data: ${fplError.message}`);
  }

  const players: InjuryPlayerRow[] = ((fplRows ?? []) as unknown as FplPlayerDataRow[])
    .map((row) => {
      const player = Array.isArray(row.players) ? row.players[0] : row.players;
      if (!player || !isInjuryTableStatusCode(row.status)) {
        return null;
      }
      if (poolFantraxIds.size > 0 && !poolFantraxIds.has(player.fantrax_id ?? "")) {
        return null;
      }

      const windowRow = windowRowByPlayer.get(player.id) ?? emptyWindowStatsRow(player.id, season, "season");

      const record: InjuryPlayerRow = {
        id: player.id,
        name: player.name,
        team: player.team,
        position: mapPosition(player.position),
        ownershipPct: parseOwnership(player.ownership_pct),
        seasonPts: windowRow.season_pts,
        status: row.status,
        statusLabel: mapInjuryTableStatusLabel(row.status),
        chanceNextRound: row.chance_of_playing_next_round,
        description: row.news?.trim() || null,
        scoutLink: row.scout_news_link?.trim() || null,
      };
      return record;
    })
    .filter((row): row is InjuryPlayerRow => row != null)
    .sort((a, b) => b.ownershipPct - a.ownershipPct || b.seasonPts - a.seasonPts);

  return {
    players,
    lastSyncedAt: formatInjurySyncedAt((latestSyncRow?.synced_at as string | undefined) ?? null),
  };
}

export default async function InjuryPage() {
  const supabase = await createServerSupabaseClient();
  const season = await getCurrentSeason(supabase);
  const { players, lastSyncedAt } = await getInjuryTableData(season);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">Injuries</h1>
        <p className="mt-2 text-sm text-brand-dark/70">Every player carrying an injury, suspension, or availability doubt, sourced from the FPL API.</p>
      </div>

      <p className="text-xs italic text-slate-500">{lastSyncedAt ? `Injury information last updated: ${lastSyncedAt}` : "Injury information last updated: unavailable."}</p>

      <InjuryTableClient players={players} />
    </div>
  );
}
