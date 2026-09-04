import { bzzoiroGet, getCurrentPremierLeagueTeamIds } from "@/lib/bsd/client";

export type TransferType = 1 | 2 | 3;

export type Transfer = {
  id: number;
  transferDate: string;
  playerId: number;
  playerName: string;
  fromTeamId: number | null;
  fromTeamName: string | null;
  toTeamId: number | null;
  toTeamName: string | null;
  feeEur: number;
  feeDescription: string;
  transferType: TransferType;
};

export type TransferPage = {
  transfers: Transfer[];
  total: number;
};

type BzzoiroTransferRow = {
  id: number;
  transfer_date: string;
  player: { id: number; name: string };
  from_team_id: number | null;
  from_team_name: string | null;
  to_team_id: number | null;
  to_team_name: string | null;
  fee_eur: number;
  fee_description: string;
  transfer_type: TransferType;
};

type BzzoiroTransferListResponse = {
  count: number;
  next: string | null;
  results: BzzoiroTransferRow[];
};

// Shared with the /admin/bsd-player-mapping candidate list (see
// resolveUnmappedTransferPlayers) so both draw from the same window.
export const TRANSFER_WINDOW_START = "2026-06-01";

const MAX_TRANSFERS_PER_TEAM = 500;

// BSD's own transfer feed only refreshes about once a day, so polling more
// often than this just re-fetches identical data. Four hours keeps us far
// ahead of that cadence while cutting daily request volume drastically.
const TRANSFERS_REVALIDATE_SECONDS = 4 * 60 * 60;

// Same-day ordering: fee-bearing transfers first (largest fee first), then
// free transfers, then loans last.
function feeRank(transfer: Transfer): number {
  if (transfer.transferType === 1) {
    return 2;
  }
  if (transfer.feeEur > 0) {
    return 0;
  }
  return 1;
}

function toTransfer(row: BzzoiroTransferRow): Transfer {
  return {
    id: row.id,
    transferDate: row.transfer_date,
    playerId: row.player.id,
    playerName: row.player.name,
    fromTeamId: row.from_team_id,
    fromTeamName: row.from_team_name,
    toTeamId: row.to_team_id,
    toTeamName: row.to_team_name,
    feeEur: row.fee_eur,
    feeDescription: row.fee_description,
    transferType: row.transfer_type,
  };
}

async function fetchTeamTransfersSince(teamId: number, dateFrom: string): Promise<Transfer[]> {
  const rows: BzzoiroTransferRow[] = [];
  let offset = 0;
  const limit = 100;

  while (rows.length < MAX_TRANSFERS_PER_TEAM) {
    const data = await bzzoiroGet<BzzoiroTransferListResponse>(
      "/transfers/",
      { team_id: String(teamId), date_from: dateFrom, limit: String(limit), offset: String(offset) },
      TRANSFERS_REVALIDATE_SECONDS
    );
    rows.push(...data.results);
    if (!data.next) {
      break;
    }
    offset += limit;
  }

  return rows.map(toTransfer);
}

export async function fetchPremierLeagueTransfers({
  dateFrom,
  limit,
  offset,
}: {
  dateFrom: string;
  limit: number;
  offset: number;
}): Promise<TransferPage> {
  const teamIds = await getCurrentPremierLeagueTeamIds();
  const perTeamTransfers = await Promise.all(teamIds.map((teamId) => fetchTeamTransfersSince(teamId, dateFrom)));

  const byId = new Map<number, Transfer>();
  for (const transfers of perTeamTransfers) {
    for (const transfer of transfers) {
      byId.set(transfer.id, transfer);
    }
  }

  const sorted = Array.from(byId.values()).sort((a, b) => {
    if (a.transferDate !== b.transferDate) {
      return a.transferDate < b.transferDate ? 1 : -1;
    }
    const rankDiff = feeRank(a) - feeRank(b);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    if (a.feeEur !== b.feeEur) {
      return b.feeEur - a.feeEur;
    }
    return b.id - a.id;
  });

  return {
    transfers: sorted.slice(offset, offset + limit),
    total: sorted.length,
  };
}
