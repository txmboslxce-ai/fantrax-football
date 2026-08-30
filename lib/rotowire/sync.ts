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
  position: string | null;
};

export type ParsedMatch = {
  homeTeamName: string;
  awayTeamName: string;
  status: "predicted" | "confirmed";
  homePlayers: ParsedLineupPlayer[];
  awayPlayers: ParsedLineupPlayer[];
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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

    const collectPlayers = (side: "is-home" | "is-visit"): ParsedLineupPlayer[] => {
      const players: ParsedLineupPlayer[] = [];

      // RotoWire tags each team's list with an "Injuries" divider
      // (`.lineup__title.is-middle`) followed by more `.lineup__player`
      // <li>s for players who are OUT/doubtful -- those footnote entries
      // aren't part of the starting XI. But a player *in* the XI can also
      // carry a `.lineup__inj` "QUES" span directly on their own <li> when
      // they're named as a starter despite a fitness doubt (e.g. Morgan
      // Gibbs-White predicted to start but flagged questionable) -- so
      // presence of `.lineup__inj` alone isn't a safe signal to exclude on;
      // it would drop real starters, not just the footnote. Walk the list
      // in DOM order instead and stop entirely once the divider is hit.
      $match.find(`.lineup__list.${side}`).children().each((__, el) => {
        const $el = $(el);
        if ($el.hasClass("lineup__title")) {
          return false; // stop the .each() loop -- everything after this is the footnote
        }
        if (!$el.hasClass("lineup__player")) {
          return; // skip the "Predicted/Confirmed Lineup" status <li>
        }

        const name = $el.find("a").first().text().trim() || $el.text().trim();
        if (!name) return;

        const positionText = $el.find(".lineup__pos").first().text().trim();
        players.push({ name, position: translateRotowirePosition(positionText || null) });
      });

      return players;
    };

    matches.push({
      homeTeamName,
      awayTeamName,
      status,
      homePlayers: collectPlayers("is-home"),
      awayPlayers: collectPlayers("is-visit"),
    });
  });

  return matches;
}

type TeamRow = { abbrev: string; name: string; full_name: string };
type PlayerRow = { id: string; name: string; team: string | null; position: string | null };
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
  teamAbbrev: string | null,
  players: PlayerRow[],
  rotowirePosition: string | null
): string | null {
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

export type RotowireSyncResult = {
  matchesFound: number;
  playersUpserted: number;
  unmatchedTeams: string[];
  unmatchedPlayers: string[];
  skippedFixtures: string[];
};

export async function syncRotowireLineups(): Promise<RotowireSyncResult> {
  const supabase = createAdminSupabaseClient();
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
      supabase.from("players").select("id, name, team, position"),
      supabase.from("fixtures").select("gameweek, home_team, away_team").eq("season", FIXTURES_SEASON),
    ]);

  if (teamsError) throw new Error(teamsError.message);
  if (playersError) throw new Error(playersError.message);
  if (fixturesError) throw new Error(fixturesError.message);

  const teams = (teamsData ?? []) as TeamRow[];
  const players = (playersData ?? []) as PlayerRow[];
  const fixtures = (fixturesData ?? []) as FixtureRow[];

  const unmatchedTeams = new Set<string>();
  const unmatchedPlayers = new Set<string>();
  const skippedFixtures: string[] = [];
  const fetchedAt = new Date().toISOString();

  const rows: {
    player_id: string;
    season: string;
    gameweek: number;
    source: string;
    source_event_id: string;
    status: "predicted" | "confirmed";
    is_starter: boolean;
    position: string | null;
    fetched_at: string;
  }[] = [];

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

    const sides: [ParsedLineupPlayer[], string][] = [
      [match.homePlayers, homeAbbrev],
      [match.awayPlayers, awayAbbrev],
    ];

    for (const [lineupPlayers, teamAbbrev] of sides) {
      for (const lineupPlayer of lineupPlayers) {
        const playerId = matchPlayer(lineupPlayer.name, teamAbbrev, players, lineupPlayer.position);
        if (!playerId) {
          unmatchedPlayers.add(`${lineupPlayer.name} (${teamAbbrev})`);
          continue;
        }

        rows.push({
          player_id: playerId,
          season: FIXTURES_SEASON,
          gameweek: fixture.gameweek,
          source: "rotowire",
          source_event_id: sourceEventId,
          status: match.status,
          is_starter: true,
          position: lineupPlayer.position,
          fetched_at: fetchedAt,
        });
      }
    }
  }

  // Before the Injuries-footnote filter above, a player who was both named
  // in the predicted XI and flagged questionable in that team's Injuries
  // footnote could be collected twice, submitting two rows for the same
  // (player_id, season, gameweek) in one upsert call -- Postgres rejects
  // that outright ("ON CONFLICT DO UPDATE command cannot affect row a
  // second time"), even though the rows were identical. The footnote filter
  // should prevent that at the source now, but this collapse is left in
  // place as a cheap safety net: last one wins, which is harmless since any
  // remaining duplicates would carry the same status/is_starter anyway.
  const dedupedRows = Array.from(
    new Map(rows.map((row) => [`${row.player_id}|${row.season}|${row.gameweek}`, row])).values()
  );

  if (dedupedRows.length > 0) {
    // Idempotent via the table's existing unique(player_id, season,
    // gameweek) constraint -- re-running throughout the week (predicted ->
    // confirmed as kickoff approaches) upserts the same rows in place.
    const { error: upsertError } = await supabase.from("player_lineups").upsert(dedupedRows, {
      onConflict: "player_id,season,gameweek",
    });

    if (upsertError) {
      throw new Error(upsertError.message);
    }
  }

  return {
    matchesFound: parsedMatches.length,
    playersUpserted: dedupedRows.length,
    unmatchedTeams: Array.from(unmatchedTeams),
    unmatchedPlayers: Array.from(unmatchedPlayers),
    skippedFixtures,
  };
}
