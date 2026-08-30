import { bzzoiroGet } from "@/lib/bsd/client";

export type BsdLineupPlayer = {
  id: number;
  name: string;
  shortName: string;
  position: string;
  jerseyNumber: number;
};

export type BsdTeamLineup = {
  teamId: number;
  teamName: string;
  formation: string;
  starters: BsdLineupPlayer[];
  substitutes: BsdLineupPlayer[];
};

export type BsdSubstitution = {
  minute: number;
  addedTime: number | null;
  isHome: boolean;
  playerInId: number;
  playerInName: string;
  playerOutId: number;
  playerOutName: string;
};

export type BsdMatchLineup = {
  status: string;
  home: BsdTeamLineup | null;
  away: BsdTeamLineup | null;
  substitutions: BsdSubstitution[];
};

type RawLineupPlayer = {
  id: number;
  name: string;
  short_name: string;
  position: string;
  jersey_number: number;
};

type RawTeamLineup = {
  team_id: number;
  team_name: string;
  formation: string;
  players: RawLineupPlayer[];
  substitutes: RawLineupPlayer[];
};

type RawLineupsResponse = {
  lineup_status: string;
  lineups: { home: RawTeamLineup; away: RawTeamLineup } | null;
};

type RawIncident = {
  type: string;
  minute: number;
  is_home?: boolean;
  player_in?: string;
  player_in_id?: number;
  player_out?: string;
  player_out_id?: number;
  added_time?: number | null;
};

type RawIncidentsResponse = {
  incidents: RawIncident[];
};

const LINEUPS_REVALIDATE_SECONDS = 300;

function toLineupPlayer(row: RawLineupPlayer): BsdLineupPlayer {
  return { id: row.id, name: row.name, shortName: row.short_name, position: row.position, jerseyNumber: row.jersey_number };
}

function toTeamLineup(row: RawTeamLineup): BsdTeamLineup {
  return {
    teamId: row.team_id,
    teamName: row.team_name,
    formation: row.formation,
    starters: row.players.map(toLineupPlayer),
    substitutes: row.substitutes.map(toLineupPlayer),
  };
}

export async function fetchBsdMatchLineup(eventId: number): Promise<BsdMatchLineup> {
  const [lineupsData, incidentsData] = await Promise.all([
    bzzoiroGet<RawLineupsResponse>(`/events/${eventId}/lineups/`, {}, LINEUPS_REVALIDATE_SECONDS),
    bzzoiroGet<RawIncidentsResponse>(`/events/${eventId}/incidents/`, {}, LINEUPS_REVALIDATE_SECONDS),
  ]);

  const substitutions: BsdSubstitution[] = incidentsData.incidents
    .filter(
      (incident): incident is Required<Pick<RawIncident, "player_in_id" | "player_out_id" | "player_in" | "player_out">> & RawIncident =>
        incident.type === "substitution" && incident.player_in_id != null && incident.player_out_id != null
    )
    .map((incident) => ({
      minute: incident.minute,
      addedTime: incident.added_time ?? null,
      isHome: incident.is_home ?? false,
      playerInId: incident.player_in_id,
      playerInName: incident.player_in,
      playerOutId: incident.player_out_id,
      playerOutName: incident.player_out,
    }))
    .sort((a, b) => a.minute - b.minute);

  return {
    status: lineupsData.lineup_status,
    home: lineupsData.lineups ? toTeamLineup(lineupsData.lineups.home) : null,
    away: lineupsData.lineups ? toTeamLineup(lineupsData.lineups.away) : null,
    substitutions,
  };
}
