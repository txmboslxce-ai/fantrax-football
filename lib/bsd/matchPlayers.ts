import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCurrentPremierLeaguePlayers, type BsdPlayer } from "@/lib/bsd/players";

export type PlayerMatch = {
  playerId: string;
  playerName: string;
  team: string;
  bsdId: number;
  bsdName: string;
};

export type FantraxPlayerCandidate = {
  id: string;
  name: string;
  team: string;
};

export type PlayerMatchResult = {
  matches: PlayerMatch[];
  unmatchedBsdPlayers: BsdPlayer[];
  unmatchedFantraxPlayers: FantraxPlayerCandidate[];
};

type FantraxPlayerRow = {
  id: string;
  name: string;
  team: string | null;
  bsd_id: number | null;
};

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Matches on exact (normalized name, team) pairs only -- deliberately
// conservative, since Fantrax and BSD often store different name variants
// for the same player (middle names, accents, nicknames). Anything that
// doesn't match exactly this way is left for manual pairing in the admin
// UI rather than guessed at with fuzzy matching.
export async function matchCurrentPremierLeaguePlayers(supabase: SupabaseClient): Promise<PlayerMatchResult> {
  const bsdPlayers = await fetchCurrentPremierLeaguePlayers();
  const teamAbbrevs = Array.from(new Set(bsdPlayers.map((player) => player.teamAbbrev)));

  const { data, error } = await supabase.from("players").select("id, name, team, bsd_id").in("team", teamAbbrevs);

  if (error) {
    throw new Error(`Unable to load Fantrax players for BSD matching: ${error.message}`);
  }

  const fantraxPlayers = (data ?? []) as FantraxPlayerRow[];

  const unmatchedFantraxByKey = new Map<string, FantraxPlayerRow>();
  for (const player of fantraxPlayers) {
    if (player.bsd_id != null || !player.team) {
      continue;
    }
    unmatchedFantraxByKey.set(`${player.team}::${normalizeName(player.name)}`, player);
  }

  const matches: PlayerMatch[] = [];
  const unmatchedBsdPlayers: BsdPlayer[] = [];
  const alreadyMappedBsdIds = new Set(fantraxPlayers.filter((p) => p.bsd_id != null).map((p) => p.bsd_id));

  for (const bsdPlayer of bsdPlayers) {
    if (alreadyMappedBsdIds.has(bsdPlayer.id)) {
      continue;
    }

    const key = `${bsdPlayer.teamAbbrev}::${normalizeName(bsdPlayer.name)}`;
    const fantraxMatch = unmatchedFantraxByKey.get(key);

    if (fantraxMatch) {
      matches.push({ playerId: fantraxMatch.id, playerName: fantraxMatch.name, team: bsdPlayer.teamAbbrev, bsdId: bsdPlayer.id, bsdName: bsdPlayer.name });
      unmatchedFantraxByKey.delete(key);
    } else {
      unmatchedBsdPlayers.push(bsdPlayer);
    }
  }

  const unmatchedFantraxPlayers: FantraxPlayerCandidate[] = Array.from(unmatchedFantraxByKey.values()).map((player) => ({
    id: player.id,
    name: player.name,
    team: player.team as string,
  }));

  return { matches, unmatchedBsdPlayers, unmatchedFantraxPlayers };
}
