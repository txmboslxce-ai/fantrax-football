import { bzzoiroGet } from "@/lib/bsd/client";
import { BSD_ABBREV_TO_TEAM_ID } from "@/lib/bsd/teams";

type BsdEventRow = {
  id: number;
  home_team_id: number;
  away_team_id: number;
};

type BsdEventListResponse = {
  count: number;
  results: BsdEventRow[];
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// We don't persist a BSD event id anywhere -- resolved on demand from our
// own fixture's teams + kickoff date, widened by a day either side to
// absorb any timezone rounding between the two systems.
export async function findBsdEventId({
  homeAbbrev,
  awayAbbrev,
  kickoffAt,
}: {
  homeAbbrev: string;
  awayAbbrev: string;
  kickoffAt: string;
}): Promise<number | null> {
  const homeTeamId = BSD_ABBREV_TO_TEAM_ID[homeAbbrev];
  const awayTeamId = BSD_ABBREV_TO_TEAM_ID[awayAbbrev];
  if (!homeTeamId || !awayTeamId) {
    return null;
  }

  const kickoff = new Date(kickoffAt);
  if (Number.isNaN(kickoff.getTime())) {
    return null;
  }

  const dateFrom = new Date(kickoff.getTime() - ONE_DAY_MS).toISOString().slice(0, 10);
  const dateTo = new Date(kickoff.getTime() + ONE_DAY_MS).toISOString().slice(0, 10);

  const data = await bzzoiroGet<BsdEventListResponse>(
    "/events/",
    { team_id: String(homeTeamId), date_from: dateFrom, date_to: dateTo },
    6 * 60 * 60
  );

  const match = data.results.find((event) => event.home_team_id === homeTeamId && event.away_team_id === awayTeamId);
  return match?.id ?? null;
}
