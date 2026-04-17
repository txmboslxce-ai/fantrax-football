import { NextResponse } from "next/server";

type ScheduleCell = {
  content?: string;
  teamId?: string;
};

type ScheduleRow = {
  cells?: ScheduleCell[];
};

type ScheduleTable = {
  periodNum?: number;
  rows?: ScheduleRow[];
};

type ScheduleResponse = {
  responses?: Array<{
    data?: {
      tableList?: ScheduleTable[];
    };
  }>;
};

export type MatchData = {
  gw: number;
  awayTeamId: string;
  awayTeamName: string;
  awayScore: number;
  homeTeamId: string;
  homeTeamName: string;
  homeScore: number;
  played: boolean;
};

function parseScore(content: string | undefined): number {
  if (!content) return 0;
  const n = parseFloat(content);
  return isFinite(n) ? n : 0;
}

export async function fetchSchedule(leagueId: string): Promise<MatchData[]> {
  const body = JSON.stringify({
    msgs: [{ method: "getStandings", data: { leagueId, view: "SCHEDULE" } }],
    at: 0,
    av: "0.0",
    dt: 1,
    uiv: 3,
    v: "179.0.1",
  });

  const res = await fetch(
    `https://www.fantrax.com/fxpa/req?leagueId=${encodeURIComponent(leagueId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "User-Agent": "Mozilla/5.0",
      },
      body,
    }
  );

  if (!res.ok) throw new Error(`Fantrax schedule API returned ${res.status}`);

  const json = (await res.json()) as ScheduleResponse;
  const tableList = json?.responses?.[0]?.data?.tableList ?? [];

  const matches: MatchData[] = [];

  for (let i = 0; i < tableList.length; i++) {
    const table = tableList[i];
    const gw = table.periodNum ?? i + 1;

    for (const row of table.rows ?? []) {
      const cells = row.cells ?? [];
      if (cells.length < 4) continue;

      const awayTeamId = cells[0].teamId ?? "";
      const awayTeamName = cells[0].content ?? "";
      const awayScore = parseScore(cells[1].content);
      const homeTeamId = cells[2].teamId ?? "";
      const homeTeamName = cells[2].content ?? "";
      const homeScore = parseScore(cells[3].content);

      if (!awayTeamId || !homeTeamId) continue;

      matches.push({
        gw,
        awayTeamId,
        awayTeamName,
        awayScore,
        homeTeamId,
        homeTeamName,
        homeScore,
        played: awayScore > 0 && homeScore > 0,
      });
    }
  }

  return matches;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get("leagueId");

  if (!leagueId) {
    return NextResponse.json({ message: "Missing leagueId" }, { status: 400 });
  }

  try {
    const matches = await fetchSchedule(leagueId);
    return NextResponse.json(matches);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch schedule";
    return NextResponse.json({ message }, { status: 502 });
  }
}
