import * as cheerio from "cheerio";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { FIXTURES_SEASON } from "@/lib/season/fixtures";
import { coarsePositionGroup, translateRotowirePosition } from "@/lib/rotowire/position";

const ROTOWIRE_LINEUPS_URL = "https://www.rotowire.com/soccer/lineups.php";

// RotoWire has no public API for this -- it's the same predicted-lineups
// page a human would load in a browser, fetched with a normal desktop
// User-Agent. See branch history for why Sofascore (a real API-shaped
// endpoint) isn't usable instead: it blocks all cloud/datacenter IPs
// regardless of headers, which is a dead end for a hosted cron job.
const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

export type ParsedLineupPlayer = {
  name: string;
  rotowireId: number | null;
  position: string | null;
};

export type ParsedInjuryPlayer = {
  name: string;
  rotowireId: number | null;
  status: string;
};

export type ParsedMatch = {
  homeTeamName: string;
  awayTeamName: string;
  status: "predicted" | "confirmed";
  homePlayers: ParsedLineupPlayer[];
  awayPlayers: ParsedLineupPlayer[];
  homeInjuries: ParsedInjuryPlayer[];
  awayInjuries: ParsedInjuryPlayer[];
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// RotoWire's player links end in a stable numeric id
// (/soccer/player/gabriel-23477 -> 23477), independent of however they're
// displaying the player's name that day.
function extractRotowireId(href: string | undefined): number | null {
  const match = href?.match(/-(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

// Exported separately from the fetch so it can be run against a saved copy
// of the page -- this app's own network can't reach rotowire.com to verify
// these selectors live, so treat the first real cron run's output as the
// actual test and adjust here if RotoWire's markup differs from what was
// reported when this was written.
export function parseRotowireLineups(html: string): ParsedMatch[] {
  const $ = cheerio.load(html);
  const matches: ParsedMatch[] = [];

  $(".lineup.is-soccer").each((_, matchEl) => {
    const $match = $(matchEl);

    const teamNames = $match
      .find(".lineup__mteam")
      .map((__, teamEl) => $(teamEl).text().trim())
      .get()
      .filter((name) => name.length > 0);

    const [homeTeamName, awayTeamName] = teamNames;
    if (!homeTeamName || !awayTeamName) {
      return;
    }

    const statusText = $match.find(".lineup__status").first().text().trim().toLowerCase();
    const status: ParsedMatch["status"] = statusText.includes("confirmed") ? "confirmed" : "predicted";

    const collectSide = (side: "is-home" | "is-visit") => {
      const starters: ParsedLineupPlayer[] = [];
      const injuries: ParsedInjuryPlayer[] = [];
      let pastDivider = false;

      // RotoWire tags each team's list with an "Injuries" divider
      // (`.lineup__title.is-middle`) followed by more `.lineup__player`
      // <li>s for players who are OUT/doubtful. A player *in* the XI can
      // also carry a `.lineup__inj` "QUES" span directly on their own <li>
      // when they're named as a starter despite a fitness doubt (e.g.
      // Morgan Gibbs-White predicted to start but flagged questionable),
      // so presence of `.lineup__inj` alone isn't a safe signal for which
      // list an entry belongs to -- position in the DOM relative to the
      // divider is.
      $match.find(`.lineup__list.${side}`).children().each((__, el) => {
        const $el = $(el);
        if ($el.hasClass("lineup__title")) {
          pastDivider = true;
          return;
        }
        if (!$el.hasClass("lineup__player")) {
          return; // skip the "Predicted/Confirmed Lineup" status <li>
        }

        const $link = $el.find("a").first();
        const name = $link.text().trim() || $el.text().trim();
        if (!name) return;

        const rotowireId = extractRotowireId($link.attr("href"));

        if (pastDivider) {
          const status = $el.find(".lineup__inj").first().text().trim() || "OUT";
          injuries.push({ name, rotowireId, status });
        } else {
          const positionText = $el.find(".lineup__pos").first().text().trim();
          starters.push({ name, rotowireId, position: translateRotowirePosition(positionText || null) });
        }
      });

      return { starters, injuries };
    };

    const home = collectSide("is-home");
    const away = collectSide("is-visit");

    matches.push({
      homeTeamName,
      awayTeamName,
      status,
      homePlayers: home.starters,
      awayPlayers: away.starters,
      homeInjuries: home.injuries,
      awayInjuries: away.injuries,
    });
  });

  return matches;
}

type TeamRow = { abbrev: string; name: string; full_name: string };
type PlayerRow = { id: string; name: string; team: string | null; position: string | null; rotowire_id: number | null };
type FixtureRow = { gameweek: number; home_team: string; away_team: string };

function matchTeam(rotowireTeamName: string, teams: TeamRow[]): string | null {
  const target = normalize(rotowireTeamName);

  const exact = teams.find((team) => normalize(team.name) === target || normalize(team.full_name) === target);
  if (exact) {
    return exact.abbrev;
  }

  // RotoWire's short names ("Man City") don't equal our full_name
  // ("Manchester City"), so fall back to containment either direction.
  const partial = teams.find((team) => {
    const teamName = normalize(team.name);
    const teamFullName = normalize(team.full_name);
    return (
      teamFullName.includes(target) ||
      target.includes(teamFullName) ||
      teamName.includes(target) ||
      target.includes(teamName)
    );
  });

  return partial?.abbrev ?? null;
}

function matchPlayer(
  rotowireName: string,
  rotowireId: number | null,
  teamAbbrev: string | null,
  players: PlayerRow[],
  rotowirePosition: string | null
): string | null {
  // Highest priority: an exact RotoWire player id match, once one's been
  // recorded (either by an earlier run's name-based match, or a human
  // pairing them in the admin mapping tool). Authoritative regardless of
  // team, since players_rotowire_id_unique guarantees at most one player
  // claims a given id.
  if (rotowireId != null) {
    const idMatch = players.find((player) => player.rotowire_id === rotowireId);
    if (idMatch) {
      return idMatch.id;
    }
  }

  const candidates = teamAbbrev ? players.filter((player) => player.team === teamAbbrev) : players;
  const target = normalize(rotowireName);

  const exact = candidates.find((player) => normalize(player.name) === target);
  if (exact) {
    return exact.id;
  }

  const rotowireTokens = rotowireName.trim().split(/\s+/).filter((token) => token.length > 0);

  // RotoWire sometimes drops middle names or uses a shortened first name
  // (e.g. "Bruno G." vs our "Bruno Guimaraes"). Fall back to matching on
  // surname alone within the same team, but only when exactly one player
  // qualifies -- an ambiguous surname match is worse than no match, since
  // it would silently record the wrong player's lineup status.
  const surname = normalize(rotowireTokens[rotowireTokens.length - 1] ?? "");
  if (surname) {
    const surnameMatches = candidates.filter((player) => {
      const playerSurname = normalize(player.name.trim().split(/\s+/).pop() ?? "");
      return playerSurname === surname;
    });

    if (surnameMatches.length === 1) {
      return surnameMatches[0].id;
    }
  }

  // RotoWire also displays some players (often Brazilian/Portuguese) by
  // first name alone rather than surname, e.g. "Gabriel" for Gabriel
  // Magalhaes. When RotoWire's name is a single token, try matching it
  // against the first name of our fuller record instead. That alone isn't
  // safe on a squad with multiple same-first-name players (Arsenal has
  // Gabriel Magalhaes, Gabriel Jesus, and Gabriel Martinelli) -- but
  // RotoWire only ever shows a bare first name for the one player it treats
  // as commonly known that way, so if there's more than one candidate, use
  // the position parsed for this lineup slot to narrow it down. That's safe
  // here specifically because RotoWire abbreviates the others as "G. Jesus"
  // / "G. Martinelli", so they never reach this single-token path at all.
  if (rotowireTokens.length === 1) {
    const firstNameMatches = candidates.filter((player) => {
      const playerFirstName = normalize(player.name.trim().split(/\s+/)[0] ?? "");
      return playerFirstName === target;
    });

    if (firstNameMatches.length === 1) {
      return firstNameMatches[0].id;
    }

    const rotowireGroup = coarsePositionGroup(rotowirePosition);
    if (firstNameMatches.length > 1 && rotowireGroup) {
      const positionMatches = firstNameMatches.filter((player) => player.position === rotowireGroup);
      if (positionMatches.length === 1) {
        return positionMatches[0].id;
      }
    }
  }

  return null;
}

export type UnmatchedRotowirePlayer = {
  name: string;
  rotowireId: number | null;
  team: string;
  position: string | null;
  kind: "starter" | "injury";
};

export type ResolvedLineupRow = {
  player_id: string;
  season: string;
  gameweek: number;
  source: string;
  source_event_id: string;
  status: "predicted" | "confirmed";
  is_starter: boolean;
  position: string | null;
  injury_status: string | null;
  fetched_at: string;
};

type ResolvedSide = {
  teamAbbrev: string;
  sourceEventId: string;
  gameweek: number;
  rows: ResolvedLineupRow[];
};

type ResolveResult = {
  parsedMatches: ParsedMatch[];
  players: PlayerRow[];
  unmatchedTeams: string[];
  unmatchedPlayers: UnmatchedRotowirePlayer[];
  skippedFixtures: string[];
  sides: ResolvedSide[];
  rotowireIdBackfills: Map<string, number>;
};

// Fetches, parses, and matches against our own teams/players/fixtures, but
// never writes anything -- shared by the actual sync (which then diffs and
// writes) and the admin mapping tool's read-only "what's unmatched right
// now" view.
async function resolveRotowireLineups(supabase: ReturnType<typeof createAdminSupabaseClient>): Promise<ResolveResult> {
  if (!supabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for RotoWire lineup sync.");
  }

  const response = await fetch(ROTOWIRE_LINEUPS_URL, {
    method: "GET",
    headers: FETCH_HEADERS,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`RotoWire lineups page unavailable (${response.status}).`);
  }

  const html = await response.text();
  const parsedMatches = parseRotowireLineups(html);

  const [{ data: teamsData, error: teamsError }, { data: playersData, error: playersError }, { data: fixturesData, error: fixturesError }] =
    await Promise.all([
      supabase.from("teams").select("abbrev, name, full_name"),
      supabase.from("players").select("id, name, team, position, rotowire_id"),
      supabase.from("fixtures").select("gameweek, home_team, away_team").eq("season", FIXTURES_SEASON),
    ]);

  if (teamsError) throw new Error(teamsError.message);
  if (playersError) throw new Error(playersError.message);
  if (fixturesError) throw new Error(fixturesError.message);

  const teams = (teamsData ?? []) as TeamRow[];
  const players = (playersData ?? []) as PlayerRow[];
  const fixtures = (fixturesData ?? []) as FixtureRow[];

  const unmatchedTeams = new Set<string>();
  const unmatchedPlayers: UnmatchedRotowirePlayer[] = [];
  const skippedFixtures: string[] = [];
  const sides: ResolvedSide[] = [];
  const rotowireIdBackfills = new Map<string, number>();
  const fetchedAt = new Date().toISOString();

  for (const match of parsedMatches) {
    const homeAbbrev = matchTeam(match.homeTeamName, teams);
    const awayAbbrev = matchTeam(match.awayTeamName, teams);

    if (!homeAbbrev) unmatchedTeams.add(match.homeTeamName);
    if (!awayAbbrev) unmatchedTeams.add(match.awayTeamName);
    if (!homeAbbrev || !awayAbbrev) {
      continue;
    }

    const fixture = fixtures.find((f) => f.home_team === homeAbbrev && f.away_team === awayAbbrev);
    if (!fixture) {
      skippedFixtures.push(`${match.homeTeamName} vs ${match.awayTeamName}`);
      continue;
    }

    const sourceEventId = `${homeAbbrev}-${awayAbbrev}-${FIXTURES_SEASON}`;

    const teamSides: [string, ParsedLineupPlayer[], ParsedInjuryPlayer[]][] = [
      [homeAbbrev, match.homePlayers, match.homeInjuries],
      [awayAbbrev, match.awayPlayers, match.awayInjuries],
    ];

    for (const [teamAbbrev, starters, injuries] of teamSides) {
      const rows: ResolvedLineupRow[] = [];

      // A player can appear in both the XI and the Injuries footnote --
      // named as a starter, but flagged with a fitness doubt (e.g. Morgan
      // Gibbs-White). Both would otherwise target the same (player_id,
      // season, gameweek) row, and the table's unique constraint means
      // only one can exist -- the footnote row would silently clobber the
      // starter row in the same upsert call. Identify that overlap using
      // RotoWire's own identity (its player id, or the name) before
      // matching against our players at all, and merge the footnote's
      // status onto the starter's row instead of writing a second one.
      const starterIdentities = new Set(
        starters.map((player) => (player.rotowireId != null ? `id:${player.rotowireId}` : `name:${normalize(player.name)}`))
      );
      const injuryStatusByIdentity = new Map<string, string>();
      const standaloneInjuries: ParsedInjuryPlayer[] = [];
      for (const injury of injuries) {
        const identity = injury.rotowireId != null ? `id:${injury.rotowireId}` : `name:${normalize(injury.name)}`;
        if (starterIdentities.has(identity)) {
          injuryStatusByIdentity.set(identity, injury.status);
        } else {
          standaloneInjuries.push(injury);
        }
      }

      for (const player of starters) {
        const playerId = matchPlayer(player.name, player.rotowireId, teamAbbrev, players, player.position);
        if (!playerId) {
          unmatchedPlayers.push({ name: player.name, rotowireId: player.rotowireId, team: teamAbbrev, position: player.position, kind: "starter" });
          continue;
        }
        if (player.rotowireId != null) {
          const existing = players.find((p) => p.id === playerId);
          if (existing && existing.rotowire_id !== player.rotowireId) {
            rotowireIdBackfills.set(playerId, player.rotowireId);
          }
        }
        const identity = player.rotowireId != null ? `id:${player.rotowireId}` : `name:${normalize(player.name)}`;
        rows.push({
          player_id: playerId,
          season: FIXTURES_SEASON,
          gameweek: fixture.gameweek,
          source: "rotowire",
          source_event_id: sourceEventId,
          status: match.status,
          is_starter: true,
          position: player.position,
          injury_status: injuryStatusByIdentity.get(identity) ?? null,
          fetched_at: fetchedAt,
        });
      }

      for (const player of standaloneInjuries) {
        const playerId = matchPlayer(player.name, player.rotowireId, teamAbbrev, players, null);
        if (!playerId) {
          unmatchedPlayers.push({ name: player.name, rotowireId: player.rotowireId, team: teamAbbrev, position: null, kind: "injury" });
          continue;
        }
        if (player.rotowireId != null) {
          const existing = players.find((p) => p.id === playerId);
          if (existing && existing.rotowire_id !== player.rotowireId) {
            rotowireIdBackfills.set(playerId, player.rotowireId);
          }
        }
        rows.push({
          player_id: playerId,
          season: FIXTURES_SEASON,
          gameweek: fixture.gameweek,
          source: "rotowire",
          source_event_id: sourceEventId,
          status: match.status,
          is_starter: false,
          position: null,
          injury_status: player.status,
          fetched_at: fetchedAt,
        });
      }

      // Only record a side when this run actually found something for it --
      // an empty side (RotoWire hasn't posted this team's lineup yet) must
      // not wipe out a previous run's rows for it. See syncRotowireLineups.
      if (rows.length > 0) {
        sides.push({ teamAbbrev, sourceEventId, gameweek: fixture.gameweek, rows });
      }
    }
  }

  return { parsedMatches, players, unmatchedTeams: Array.from(unmatchedTeams), unmatchedPlayers, skippedFixtures, sides, rotowireIdBackfills };
}

export type RotowireSyncResult = {
  matchesFound: number;
  playersUpserted: number;
  playersRemoved: number;
  rotowireIdsRecorded: number;
  unmatchedTeams: string[];
  unmatchedPlayers: string[];
  skippedFixtures: string[];
};

export async function syncRotowireLineups(): Promise<RotowireSyncResult> {
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveRotowireLineups(supabase);

  if (!supabase) {
    // resolveRotowireLineups already throws in this case -- unreachable,
    // but keeps TypeScript happy about supabase being non-null below.
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for RotoWire lineup sync.");
  }

  // Diff each covered side against what's already stored for that fixture +
  // team, so a player who's no longer in this run's parse (transferred,
  // dropped, or just a stale row from before a parsing bug was fixed)
  // doesn't linger in player_lineups forever -- upsert alone only ever
  // adds/updates rows, never removes them.
  const { data: existingData, error: existingError } = await supabase
    .from("player_lineups")
    .select("id, player_id, source_event_id")
    .eq("source", "rotowire")
    .eq("season", FIXTURES_SEASON);

  if (existingError) throw new Error(existingError.message);

  const teamByPlayerId = new Map(resolved.players.map((player) => [player.id, player.team]));
  const existingRows = (existingData ?? []) as { id: string; player_id: string; source_event_id: string }[];

  let playersRemoved = 0;
  let playersUpserted = 0;

  for (const side of resolved.sides) {
    const newPlayerIds = new Set(side.rows.map((row) => row.player_id));
    const staleIds = existingRows
      .filter(
        (row) =>
          row.source_event_id === side.sourceEventId &&
          teamByPlayerId.get(row.player_id) === side.teamAbbrev &&
          !newPlayerIds.has(row.player_id)
      )
      .map((row) => row.id);

    if (staleIds.length > 0) {
      const { error: deleteError } = await supabase.from("player_lineups").delete().in("id", staleIds);
      if (deleteError) throw new Error(deleteError.message);
      playersRemoved += staleIds.length;
    }

    const { error: upsertError } = await supabase
      .from("player_lineups")
      .upsert(side.rows, { onConflict: "player_id,season,gameweek" });
    if (upsertError) throw new Error(upsertError.message);
    playersUpserted += side.rows.length;
  }

  // Record any RotoWire ids matched by name this run, so future runs (and
  // the admin mapping tool's unmatched count) don't need to re-guess them.
  // Best-effort: a write failing here (e.g. a genuine unique-constraint
  // clash from bad data) shouldn't fail the whole sync.
  let rotowireIdsRecorded = 0;
  await Promise.all(
    Array.from(resolved.rotowireIdBackfills.entries()).map(async ([playerId, rotowireId]) => {
      const { error } = await supabase.from("players").update({ rotowire_id: rotowireId }).eq("id", playerId);
      if (!error) rotowireIdsRecorded += 1;
    })
  );

  return {
    matchesFound: resolved.parsedMatches.length,
    playersUpserted,
    playersRemoved,
    rotowireIdsRecorded,
    unmatchedTeams: resolved.unmatchedTeams,
    unmatchedPlayers: resolved.unmatchedPlayers.map((p) => `${p.name} (${p.team})`),
    skippedFixtures: resolved.skippedFixtures,
  };
}

export type RotowireMatchingReport = {
  matchesFound: number;
  unmatchedTeams: string[];
  skippedFixtures: string[];
  unmatchedRotowirePlayers: UnmatchedRotowirePlayer[];
  unmatchedFantraxPlayers: { id: string; name: string; team: string }[];
};

// Read-only counterpart for the admin mapping tool -- fetches and matches
// exactly like a real sync, but never writes, so it's safe to call just to
// render the current gaps.
export async function getRotowireMatchingReport(): Promise<RotowireMatchingReport> {
  const supabase = createAdminSupabaseClient();
  const resolved = await resolveRotowireLineups(supabase);

  const unmatchedFantraxPlayers = resolved.players
    .filter((player) => player.rotowire_id == null && player.team)
    .map((player) => ({ id: player.id, name: player.name, team: player.team as string }))
    .sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name));

  return {
    matchesFound: resolved.parsedMatches.length,
    unmatchedTeams: resolved.unmatchedTeams,
    skippedFixtures: resolved.skippedFixtures,
    unmatchedRotowirePlayers: resolved.unmatchedPlayers,
    unmatchedFantraxPlayers,
  };
}
