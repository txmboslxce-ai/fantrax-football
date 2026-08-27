import * as cheerio from "cheerio";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { FIXTURES_SEASON } from "@/lib/season/fixtures";

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

    const collectPlayers = (side: "is-home" | "is-visit"): ParsedLineupPlayer[] =>
      $match
        .find(`.lineup__list.${side} .lineup__player`)
        .map((__, playerEl) => {
          const $player = $(playerEl);
          const name = $player.find("a").first().text().trim() || $player.text().trim();
          const positionText = $player.find(".lineup__pos").first().text().trim();
          return { name, position: positionText || null };
        })
        .get()
        .filter((player) => player.name.length > 0);

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
type PlayerRow = { id: string; name: string; team: string | null };
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

function matchPlayer(rotowireName: string, teamAbbrev: string | null, players: PlayerRow[]): string | null {
  const candidates = teamAbbrev ? players.filter((player) => player.team === teamAbbrev) : players;
  const target = normalize(rotowireName);

  const exact = candidates.find((player) => normalize(player.name) === target);
  if (exact) {
    return exact.id;
  }

  // RotoWire sometimes drops middle names or uses a shortened first name
  // (e.g. "Bruno G." vs our "Bruno Guimaraes"). Fall back to matching on
  // surname alone within the same team, but only when exactly one player
  // qualifies -- an ambiguous surname match is worse than no match, since
  // it would silently record the wrong player's lineup status.
  const surname = normalize(rotowireName.trim().split(/\s+/).pop() ?? "");
  if (!surname) {
    return null;
  }

  const surnameMatches = candidates.filter((player) => {
    const playerSurname = normalize(player.name.trim().split(/\s+/).pop() ?? "");
    return playerSurname === surname;
  });

  return surnameMatches.length === 1 ? surnameMatches[0].id : null;
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
      supabase.from("players").select("id, name, team"),
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
        const playerId = matchPlayer(lineupPlayer.name, teamAbbrev, players);
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
          fetched_at: fetchedAt,
        });
      }
    }
  }

  if (rows.length > 0) {
    // Idempotent via the table's existing unique(player_id, season,
    // gameweek) constraint -- re-running throughout the week (predicted ->
    // confirmed as kickoff approaches) upserts the same rows in place.
    const { error: upsertError } = await supabase.from("player_lineups").upsert(rows, {
      onConflict: "player_id,season,gameweek",
    });

    if (upsertError) {
      throw new Error(upsertError.message);
    }
  }

  return {
    matchesFound: parsedMatches.length,
    playersUpserted: rows.length,
    unmatchedTeams: Array.from(unmatchedTeams),
    unmatchedPlayers: Array.from(unmatchedPlayers),
    skippedFixtures,
  };
}
