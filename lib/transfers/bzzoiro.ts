const BZZOIRO_API_BASE = "https://sports.bzzoiro.com/api/v2";
const PREMIER_LEAGUE_ID = 1;

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

type BzzoiroStandingsResponse = {
  grouped: boolean;
  standings?: Array<{ team_id: number }>;
};

// The transfers endpoint's own `league_id` filter tags the whole English
// football pyramid historically linked to this league (51 teams, including
// lower-division and youth sides), not this season's 20-team top flight.
// The site's own Premier League transfers page instead only shows a move
// where at least one side is a *current* Premier League club, so we fetch
// the real roster and query per team (team_id matches both incoming and
// outgoing moves) rather than trusting transfers' league_id filter.
async function getCurrentPremierLeagueTeamIds(): Promise<number[]> {
  const url = `${BZZOIRO_API_BASE}/leagues/${PREMIER_LEAGUE_ID}/standings/`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Token ${getBzzoiroApiKey()}`,
      Accept: "application/json",
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(`Bzzoiro standings request failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as BzzoiroStandingsResponse;
  if (data.grouped || !data.standings) {
    throw new Error("Bzzoiro Premier League standings came back grouped or empty; expected a flat 20-team table.");
  }

  return data.standings.map((row) => row.team_id);
}

const MAX_TRANSFERS_PER_TEAM = 500;

async function fetchTeamTransfersSince(teamId: number, dateFrom: string): Promise<Transfer[]> {
  const rows: BzzoiroTransferRow[] = [];
  let offset = 0;
  const limit = 100;

  while (rows.length < MAX_TRANSFERS_PER_TEAM) {
    const url = new URL(`${BZZOIRO_API_BASE}/transfers/`);
    url.searchParams.set("team_id", String(teamId));
    url.searchParams.set("date_from", dateFrom);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, {
      headers: {
        Authorization: `Token ${getBzzoiroApiKey()}`,
        Accept: "application/json",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      throw new Error(`Bzzoiro transfers request failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as BzzoiroTransferListResponse;
    rows.push(...data.results);
    if (!data.next) {
      break;
    }
    offset += limit;
  }

  return rows.map(toTransfer);
}

function getBzzoiroApiKey(): string {
  const key = process.env.BZZOIRO_API_KEY?.trim();
  if (!key) {
    throw new Error("BZZOIRO_API_KEY is required. Set it in .env.local for local dev or in your Vercel project's environment variables.");
  }
  return key;
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
    return b.id - a.id;
  });

  return {
    transfers: sorted.slice(offset, offset + limit),
    total: sorted.length,
  };
}
