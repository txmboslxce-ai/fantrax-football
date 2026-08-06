import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getFantraxLeagueIdForSeason } from "@/lib/fantrax/config";
import {
  FANTRAX_POSITIONS,
  fetchFantraxCsv,
  getUploadType,
  mapFantraxCsvRow,
  parseFantraxCsv,
  resolveFantraxTeam,
} from "@/lib/fantrax/sync-scores";

const POOL_DOWNLOAD_GAMEWEEK = 1;
const VALID_POSITIONS = new Set(["G", "D", "M", "F"]);

type IncomingPlayer = {
  fantraxId: string;
  name: string;
  team: string;
  position: string;
  isKeeper: boolean;
};

type ExistingPlayer = {
  id: string;
  fantrax_id: string;
  name: string;
  team: string | null;
  position: string;
};

export type PlayerPoolAdded = {
  fantraxId: string;
  name: string;
  team: string;
  position: string;
};

export type PlayerPoolChanged = {
  fantraxId: string;
  name: string;
  before: { team: string | null; position: string };
  after: { team: string; position: string };
};

export type PlayerPoolUnmatched = {
  fantraxId: string;
  name: string;
  team: string;
  reason: string;
};

export type PlayerPoolFailed = {
  fantraxId: string;
  name: string;
  before: { team: string | null; position: string } | null;
  after: { team: string; position: string };
  error: string;
};

export type SyncFantraxPlayersResult = {
  season: string;
  playersFound: number;
  poolEntriesAdded: number;
  added: PlayerPoolAdded[];
  changed: PlayerPoolChanged[];
  failed: PlayerPoolFailed[];
  unmatched: PlayerPoolUnmatched[];
};

export async function syncFantraxPlayers(season: string): Promise<SyncFantraxPlayersResult> {
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for Fantrax sync.");
  }

  const leagueId = await getFantraxLeagueIdForSeason(supabase, season);
  const downloadedRows = await Promise.all(
    FANTRAX_POSITIONS.map(async (positionGroup) => {
      const csv = await fetchFantraxCsv(POOL_DOWNLOAD_GAMEWEEK, positionGroup, leagueId);
      const type = getUploadType(positionGroup);
      return parseFantraxCsv(csv)
        .map((row) => mapFantraxCsvRow(row, type, POOL_DOWNLOAD_GAMEWEEK))
        .filter((row) => row.fantrax_id && row.name)
        .map((row) => ({
          fantraxId: row.fantrax_id.trim(),
          name: row.name.trim(),
          team: row.team.trim(),
          position: row.position.trim().toUpperCase(),
          isKeeper: type === "keeper",
        }));
    })
  );

  const incomingByFantraxId = new Map<string, IncomingPlayer>();
  for (const row of downloadedRows.flat()) {
    if (!VALID_POSITIONS.has(row.position)) continue;
    incomingByFantraxId.set(row.fantraxId, {
      fantraxId: row.fantraxId,
      name: row.name,
      team: row.team,
      position: row.position,
      isKeeper: row.isKeeper,
    });
  }

  const { data: teamsData, error: teamsError } = await supabase.from("teams").select("abbrev");
  if (teamsError) throw new Error(`Unable to load teams: ${teamsError.message}`);
  const validAbbrevs = new Set((teamsData ?? []).map((team) => team.abbrev as string));

  const unmatched: PlayerPoolUnmatched[] = [];
  const validPlayers: IncomingPlayer[] = [];
  for (const player of incomingByFantraxId.values()) {
    const team = resolveFantraxTeam(player.team, validAbbrevs);
    if (!team) {
      unmatched.push({
        fantraxId: player.fantraxId,
        name: player.name,
        team: player.team,
        reason: "Team is missing or does not match a configured team abbreviation.",
      });
      continue;
    }
    validPlayers.push({ ...player, team });
  }

  const fantraxIds = validPlayers.map((player) => player.fantraxId);
  const { data: existingPlayersData, error: existingPlayersError } = fantraxIds.length
    ? await supabase.from("players").select("id, fantrax_id, name, team, position").in("fantrax_id", fantraxIds)
    : { data: [], error: null };
  if (existingPlayersError) throw new Error(`Unable to load players: ${existingPlayersError.message}`);

  const existingByFantraxId = new Map(
    ((existingPlayersData ?? []) as ExistingPlayer[]).map((player) => [player.fantrax_id, player])
  );
  const added = validPlayers.filter((player) => !existingByFantraxId.has(player.fantraxId));
  const changed = validPlayers.flatMap((player) => {
    const existing = existingByFantraxId.get(player.fantraxId);
    if (!existing || (existing.team === player.team && existing.position === player.position)) return [];
    return [{
      fantraxId: player.fantraxId,
      name: existing.name,
      before: { team: existing.team, position: existing.position },
      after: { team: player.team, position: player.position },
      playerId: existing.id,
    }];
  });
  const failed: PlayerPoolFailed[] = [];
  let successfullyAdded: PlayerPoolAdded[] = added;

  if (added.length > 0) {
    const { error: insertError } = await supabase.from("players").insert(
      added.map((player) => ({
        fantrax_id: player.fantraxId,
        name: player.name,
        team: player.team,
        position: player.position,
        is_keeper: player.isKeeper,
      }))
    );
    if (insertError) {
      successfullyAdded = [];
      failed.push(
        ...added.map((player) => ({
          fantraxId: player.fantraxId,
          name: player.name,
          before: null,
          after: { team: player.team, position: player.position },
          error: insertError.message,
        }))
      );
    }
  }

  const changedResults = await Promise.all(
    changed.map(async (change) => {
      const { error } = await supabase
        .from("players")
        .update({ team: change.after.team, position: change.after.position })
        .eq("id", change.playerId);
      return { change, error };
    })
  );
  const successfullyChanged: PlayerPoolChanged[] = [];
  for (const { change, error } of changedResults) {
    const player: PlayerPoolChanged = {
      fantraxId: change.fantraxId,
      name: change.name,
      before: change.before,
      after: change.after,
    };
    if (error) {
      failed.push({ ...player, error: error.message });
    } else {
      successfullyChanged.push(player);
    }
  }

  let poolEntriesAdded = 0;
  if (fantraxIds.length > 0) {
    const { data: existingPoolRows, error: existingPoolError } = await supabase
      .from("season_player_pool")
      .select("fantrax_id")
      .eq("season", season)
      .in("fantrax_id", fantraxIds);
    if (existingPoolError) throw new Error(`Unable to load the ${season} season player pool: ${existingPoolError.message}`);

    const existingPoolIds = new Set((existingPoolRows ?? []).map((row) => row.fantrax_id as string));
    poolEntriesAdded = fantraxIds.filter((fantraxId) => !existingPoolIds.has(fantraxId)).length;

    const { error: poolError } = await supabase.from("season_player_pool").upsert(
      fantraxIds.map((fantraxId) => ({ season, fantrax_id: fantraxId })),
      { onConflict: "season,fantrax_id", ignoreDuplicates: true }
    );
    if (poolError) throw new Error(`Unable to update the ${season} season player pool: ${poolError.message}`);
  }

  return {
    season,
    playersFound: validPlayers.length + unmatched.length,
    poolEntriesAdded,
    added: successfullyAdded,
    changed: successfullyChanged,
    failed,
    unmatched,
  };
}
