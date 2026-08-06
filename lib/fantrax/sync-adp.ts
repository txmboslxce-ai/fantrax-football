import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { DRAFT_POOL_SEASON } from "@/lib/season/draft";
import { getFantraxLeagueIdForSeason } from "@/lib/fantrax/config";
import {
  FANTRAX_POSITIONS,
  fetchFantraxCsv,
  getUploadType,
  mapFantraxCsvRow,
  parseFantraxCsv,
} from "@/lib/fantrax/sync-scores";

const ADP_DOWNLOAD_GAMEWEEK = 1;

export async function refreshADP(): Promise<{ updated: number; season: string }> {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for ADP sync.");
  }

  const season = DRAFT_POOL_SEASON;
  const leagueId = await getFantraxLeagueIdForSeason(supabase, season);
  const downloadedRows = await Promise.all(
    FANTRAX_POSITIONS.map(async (positionGroup) => {
      const csv = await fetchFantraxCsv(ADP_DOWNLOAD_GAMEWEEK, positionGroup, leagueId);
      const type = getUploadType(positionGroup);
      return parseFantraxCsv(csv)
        .map((row) => mapFantraxCsvRow(row, type, ADP_DOWNLOAD_GAMEWEEK))
        .filter((row) => row.fantrax_id)
        .map((row) => ({ fantraxId: row.fantrax_id.trim(), adp: row.adp }));
    })
  );

  const adpByFantraxId = new Map<string, number | null>();
  for (const row of downloadedRows.flat()) {
    adpByFantraxId.set(row.fantraxId, row.adp);
  }

  const { data: poolRows, error: poolError } = await supabase
    .from("season_player_pool")
    .select("fantrax_id")
    .eq("season", season);
  if (poolError) {
    throw new Error(`Unable to load the ${season} season player pool: ${poolError.message}`);
  }

  const adpUpdates = (poolRows ?? []).flatMap((poolRow) => {
    const fantraxId = poolRow.fantrax_id as string;
    if (!adpByFantraxId.has(fantraxId)) {
      return [];
    }

    return [{ season, fantrax_id: fantraxId, adp: adpByFantraxId.get(fantraxId) ?? null }];
  });

  if (adpUpdates.length === 0) {
    return { updated: 0, season };
  }

  const { data: updatedRows, error: updateError } = await supabase
    .from("season_player_pool")
    .upsert(adpUpdates, { onConflict: "season,fantrax_id" })
    .select("fantrax_id");
  if (updateError) {
    throw new Error(`Unable to refresh ${season} ADP: ${updateError.message}`);
  }

  return { updated: updatedRows?.length ?? adpUpdates.length, season };
}
