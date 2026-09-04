import type { SupabaseClient } from "@supabase/supabase-js";
import type { BsdPlayer } from "@/lib/bsd/players";
import { BSD_TEAM_ID_TO_ABBREV } from "@/lib/bsd/teams";
import { fetchPremierLeagueTransfers, TRANSFER_WINDOW_START } from "@/lib/transfers/bzzoiro";

// The live roster fetch (matchCurrentPremierLeaguePlayers) and the shot-data
// fetch (resolveUnmappedShotPlayers) both miss a very recent signing who
// hasn't played a backfilled match yet, and whose new club's BSD roster
// listing hasn't caught up to the move either -- both are lagging
// indicators of the same transfer. BSD's own transfer feed is the earliest
// signal of the three (that's literally what records the move, and it's
// what the portal's Transfers page already reads), so pull unmapped
// candidates from there too rather than waiting on either to catch up.
export async function resolveUnmappedTransferPlayers(supabase: SupabaseClient): Promise<BsdPlayer[]> {
  const { transfers } = await fetchPremierLeagueTransfers({ dateFrom: TRANSFER_WINDOW_START, limit: 1000, offset: 0 });
  if (transfers.length === 0) return [];

  const bsdPlayerIds = transfers.map((transfer) => transfer.playerId);
  const { data, error } = await supabase.from("players").select("bsd_id").not("bsd_id", "is", null).in("bsd_id", bsdPlayerIds);

  if (error) {
    throw new Error(`Unable to load players: ${error.message}`);
  }

  const alreadyMapped = new Set(((data ?? []) as Array<{ bsd_id: number }>).map((row) => row.bsd_id));

  const seen = new Set<number>();
  const results: BsdPlayer[] = [];
  for (const transfer of transfers) {
    if (alreadyMapped.has(transfer.playerId) || seen.has(transfer.playerId)) continue;
    seen.add(transfer.playerId);

    const teamAbbrev = transfer.toTeamId != null ? BSD_TEAM_ID_TO_ABBREV[transfer.toTeamId] : undefined;
    if (!teamAbbrev) continue; // no mapped destination team -- nothing on our side to match against anyway

    results.push({ id: transfer.playerId, name: transfer.playerName, shortName: transfer.playerName, teamId: transfer.toTeamId ?? 0, teamAbbrev });
  }

  return results.sort((a, b) => a.teamAbbrev.localeCompare(b.teamAbbrev) || a.name.localeCompare(b.name));
}
