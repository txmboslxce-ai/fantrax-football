const BZZOIRO_API_BASE = "https://sports.bzzoiro.com/api/v2";

export const PREMIER_LEAGUE_ID = 1;

function getBzzoiroApiKey(): string {
  const key = process.env.BZZOIRO_API_KEY?.trim();
  if (!key) {
    throw new Error("BZZOIRO_API_KEY is required. Set it in .env.local for local dev or in your Vercel project's environment variables.");
  }
  return key;
}

export async function bzzoiroGet<T>(path: string, params: Record<string, string>, revalidateSeconds: number): Promise<T> {
  const url = new URL(`${BZZOIRO_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Token ${getBzzoiroApiKey()}`,
      Accept: "application/json",
    },
    next: { revalidate: revalidateSeconds },
  });

  if (!response.ok) {
    throw new Error(`Bzzoiro request to ${path} failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}

type BzzoiroStandingsResponse = {
  grouped: boolean;
  standings?: Array<{ team_id: number }>;
};

// The transfers/players endpoints' own `league_id` filter tags the whole
// English football pyramid historically linked to this league (lower
// divisions and youth sides included), not this season's 20-team top
// flight, so anything scoped to "the current Premier League" fetches the
// real roster from standings instead and queries per team_id.
export async function getCurrentPremierLeagueTeamIds(): Promise<number[]> {
  const data = await bzzoiroGet<BzzoiroStandingsResponse>(`/leagues/${PREMIER_LEAGUE_ID}/standings/`, {}, 3600);
  if (data.grouped || !data.standings) {
    throw new Error("Bzzoiro Premier League standings came back grouped or empty; expected a flat 20-team table.");
  }
  return data.standings.map((row) => row.team_id);
}
