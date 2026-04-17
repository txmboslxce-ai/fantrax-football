import { NextResponse } from "next/server";

type FantraxStandingsEntry = {
  teamName?: string;
  teamId?: string;
  rank?: number;
  points?: string; // "W-D-L"
  totalPointsFor?: number | string;
  winPercentage?: number | string;
};

export type StandingsEntry = {
  teamId: string;
  teamName: string;
  rank: number;
  w: number;
  d: number;
  l: number;
  pf: number;
  winPercentage: number;
};

function toNum(v: number | string | undefined): number {
  if (v === undefined || v === null) return 0;
  const n = parseFloat(String(v));
  return isFinite(n) ? n : 0;
}

export async function fetchStandings(leagueId: string): Promise<StandingsEntry[]> {
  const res = await fetch(
    `https://www.fantrax.com/fxea/general/getStandings?leagueId=${encodeURIComponent(leagueId)}`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );

  if (!res.ok) throw new Error(`Fantrax standings API returned ${res.status}`);

  const json = (await res.json()) as FantraxStandingsEntry[];

  if (!Array.isArray(json)) throw new Error("Unexpected standings response format");

  return json.map((entry) => {
    const parts = (entry.points ?? "0-0-0").split("-");
    const w = parseInt(parts[0] ?? "0", 10);
    const d = parseInt(parts[1] ?? "0", 10);
    const l = parseInt(parts[2] ?? "0", 10);

    return {
      teamId: entry.teamId ?? "",
      teamName: entry.teamName ?? "",
      rank: entry.rank ?? 0,
      w,
      d,
      l,
      pf: toNum(entry.totalPointsFor),
      winPercentage: toNum(entry.winPercentage),
    };
  }).filter((e) => e.teamId !== "");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get("leagueId");

  if (!leagueId) {
    return NextResponse.json({ message: "Missing leagueId" }, { status: 400 });
  }

  try {
    const standings = await fetchStandings(leagueId);
    return NextResponse.json(standings);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch standings";
    return NextResponse.json({ message }, { status: 502 });
  }
}
