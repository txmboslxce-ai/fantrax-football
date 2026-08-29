import { bzzoiroGet, getCurrentPremierLeagueTeamIds } from "@/lib/bsd/client";
import { BSD_TEAM_ID_TO_ABBREV } from "@/lib/bsd/teams";

export type BsdPlayer = {
  id: number;
  name: string;
  shortName: string;
  teamId: number;
  teamAbbrev: string;
};

type BsdPlayerRow = {
  id: number;
  name: string;
  short_name: string;
  current_team_id: number;
};

type BsdPlayerListResponse = {
  count: number;
  next: string | null;
  results: BsdPlayerRow[];
};

const MAX_PLAYERS_PER_TEAM = 200;

async function fetchTeamPlayers(teamId: number, teamAbbrev: string): Promise<BsdPlayer[]> {
  const players: BsdPlayer[] = [];
  let offset = 0;
  const limit = 100;

  while (players.length < MAX_PLAYERS_PER_TEAM) {
    const data = await bzzoiroGet<BsdPlayerListResponse>(
      "/players/",
      { team_id: String(teamId), limit: String(limit), offset: String(offset) },
      3600
    );
    players.push(...data.results.map((row) => ({ id: row.id, name: row.name, shortName: row.short_name, teamId, teamAbbrev })));
    if (!data.next) {
      break;
    }
    offset += limit;
  }

  return players;
}

export async function fetchCurrentPremierLeaguePlayers(): Promise<BsdPlayer[]> {
  const teamIds = await getCurrentPremierLeagueTeamIds();

  const knownTeamIds = teamIds.filter((teamId) => {
    if (!(teamId in BSD_TEAM_ID_TO_ABBREV)) {
      console.warn(`[bsd/players] No abbrev mapping for BSD team_id ${teamId}; skipping its squad. Update BSD_TEAM_ID_TO_ABBREV.`);
      return false;
    }
    return true;
  });

  const perTeam = await Promise.all(knownTeamIds.map((teamId) => fetchTeamPlayers(teamId, BSD_TEAM_ID_TO_ABBREV[teamId])));
  return perTeam.flat();
}
