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
  results: BzzoiroTransferRow[];
};

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
  const url = new URL(`${BZZOIRO_API_BASE}/transfers/`);
  url.searchParams.set("league_id", String(PREMIER_LEAGUE_ID));
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
  return {
    transfers: data.results.map(toTransfer),
    total: data.count,
  };
}
