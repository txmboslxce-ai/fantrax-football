/**
 * sync-sofascore-lineups.ts
 *
 * Fetches SofaScore lineups for a given gameweek and upserts into sofascore_lineups.
 *
 * Run:
 *   npm run sofa:sync -- --gameweek 33
 *   npm run sofa:sync              # auto-detects next gameweek
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { createClient } from "@supabase/supabase-js";

// ─── Config ───────────────────────────────────────────────────────────────────

const SOFASCORE_BASE = "https://api.sofascore.com/api/v1";
const SEASON = "2025-26";
const DELAY_MS = 150;

// ─── Supabase ─────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(supabaseUrl, serviceKey);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sofaFetch<T>(path: string): Promise<T> {
  await delay(DELAY_MS);
  const url = `${SOFASCORE_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SofaScore ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

const EPL_TEAMS = new Set([
  "Arsenal", "Aston Villa", "Bournemouth", "Brentford", "Brighton & Hove Albion",
  "Chelsea", "Crystal Palace", "Everton", "Fulham", "Ipswich Town", "Leeds United",
  "Leicester City", "Liverpool", "Manchester City", "Manchester United", "Newcastle United",
  "Nottingham Forest", "Southampton", "Sunderland", "Tottenham Hotspur",
  "West Ham United", "Wolverhampton", "Wolverhampton Wanderers",
]);

type ScheduledEvent = {
  id: number;
  homeTeam?: { name: string };
  awayTeam?: { name: string };
  tournament: {
    name: string;
    uniqueTournament?: { id: number; name: string };
  };
};

type ScheduledEventsResponse = { events?: ScheduledEvent[] };

type LineupsResponse = {
  confirmed?: boolean;
  home?: { players?: LineupsPlayer[] };
  away?: { players?: LineupsPlayer[] };
};

type LineupsPlayer = {
  player: { id: number; name: string };
  substitute: boolean;
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1 — parse --gameweek arg or auto-detect
  const gwArgIndex = process.argv.indexOf("--gameweek");
  let gameweek: number;

  if (gwArgIndex !== -1 && process.argv[gwArgIndex + 1]) {
    gameweek = parseInt(process.argv[gwArgIndex + 1], 10);
    if (!Number.isInteger(gameweek) || gameweek <= 0) {
      console.error("Invalid --gameweek value:", process.argv[gwArgIndex + 1]);
      process.exit(1);
    }
    console.log(`Using gameweek from arg: GW${gameweek}`);
  } else {
    const { data, error } = await db
      .from("player_gameweeks")
      .select("gameweek")
      .eq("season", SEASON)
      .order("gameweek", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Failed to query player_gameweeks:", error.message);
      process.exit(1);
    }

    const latestGw: number = (data ?? [])[0]?.gameweek ?? 0;
    gameweek = latestGw + 1;
    console.log(`Auto-detected: latestGw=${latestGw} → targeting GW${gameweek}`);
  }

  // 2 — get fixture dates for this GW
  const { data: fixtureRows, error: fixturesError } = await db
    .from("fixtures")
    .select("kickoff_at")
    .eq("season", SEASON)
    .eq("gameweek", gameweek);

  if (fixturesError) {
    console.error("Failed to query fixtures:", fixturesError.message);
    process.exit(1);
  }

  const kickoffDates = [
    ...new Set(
      (fixtureRows ?? [])
        .map((r: { kickoff_at: string | null }) => r.kickoff_at?.slice(0, 10))
        .filter((d): d is string => Boolean(d))
    ),
  ];

  if (kickoffDates.length === 0) {
    console.error(`No fixture dates found for GW${gameweek}. Ensure kickoff_at is populated in fixtures table.`);
    process.exit(1);
  }

  console.log(`GW${gameweek} dates: ${kickoffDates.join(", ")}`);

  // 3 — build sofascore_id → player_id map
  const { data: playersRaw, error: playersError } = await db
    .from("players")
    .select("id, sofascore_id")
    .not("sofascore_id", "is", null);

  if (playersError) {
    console.error("Failed to query players:", playersError.message);
    process.exit(1);
  }

  const playerBySofaId = new Map<number, string>();
  for (const p of (playersRaw ?? []) as { id: string; sofascore_id: number }[]) {
    playerBySofaId.set(p.sofascore_id, p.id);
  }
  console.log(`Players with sofascore_id: ${playerBySofaId.size}`);

  // 4 — fetch scheduled events per date, filter to Premier League
  const eplEventIds: number[] = [];

  for (const date of kickoffDates) {
    try {
      const data = await sofaFetch<ScheduledEventsResponse>(`/sport/football/scheduled-events/${date}`);
      let plCount = 0;
      for (const event of data.events ?? []) {
        const isPL =
          EPL_TEAMS.has(event.homeTeam?.name ?? "") &&
          EPL_TEAMS.has(event.awayTeam?.name ?? "");
        if (isPL) {
          eplEventIds.push(event.id);
          plCount++;
        }
      }
      console.log(`  ${date}: ${data.events?.length ?? 0} total events, ${plCount} PL`);
    } catch (err) {
      console.error(`  ${date}: ${(err as Error).message}`);
    }
  }

  if (eplEventIds.length === 0) {
    console.error(`No Premier League events found for GW${gameweek}.`);
    process.exit(1);
  }

  console.log(`Fetching lineups for ${eplEventIds.length} PL events…`);

  // 5 — fetch lineups and build upsert rows
  type UpsertRow = {
    player_id: string;
    season: string;
    gameweek: number;
    sofascore_event_id: number;
    status: "predicted" | "confirmed";
    is_starter: boolean;
    fetched_at: string;
  };

  const upsertRows: UpsertRow[] = [];
  const unmatched: string[] = [];
  const fetchedAt = new Date().toISOString();

  for (const eventId of eplEventIds) {
    try {
      const data = await sofaFetch<LineupsResponse>(`/event/${eventId}/lineups`);
      const status: "predicted" | "confirmed" = data.confirmed ? "confirmed" : "predicted";

      for (const side of [data.home, data.away]) {
        for (const entry of side?.players ?? []) {
          const sofaId = entry.player.id;
          const playerId = playerBySofaId.get(sofaId);
          if (!playerId) {
            const label = `${entry.player.name} (SS#${sofaId})`;
            if (!unmatched.includes(label)) unmatched.push(label);
            continue;
          }
          upsertRows.push({
            player_id: playerId,
            season: SEASON,
            gameweek,
            sofascore_event_id: eventId,
            status,
            is_starter: !entry.substitute,
            fetched_at: fetchedAt,
          });
        }
      }
    } catch (err) {
      console.error(`  event ${eventId}: ${(err as Error).message}`);
    }
  }

  // 6 — deduplicate by player_id (keep last occurrence) then upsert
  const deduped = new Map<string, UpsertRow>();
  for (const row of upsertRows) deduped.set(row.player_id, row);
  const rowsToUpsert = Array.from(deduped.values());

  if (rowsToUpsert.length === 0) {
    console.log("No rows to upsert.");
  } else {
    const { error: upsertError } = await db.from("sofascore_lineups").upsert(rowsToUpsert, {
      onConflict: "player_id,season,gameweek",
    });
    if (upsertError) {
      console.error("Upsert failed:", upsertError.message);
      process.exit(1);
    }
  }

  // 7 — summary
  console.log("\n─── Summary ─────────────────────────────────────────────");
  console.log(`  Season:   ${SEASON}`);
  console.log(`  Gameweek: GW${gameweek}`);
  console.log(`  Synced:   ${rowsToUpsert.length} players`);
  if (unmatched.length > 0) {
    console.log(`  Unmatched (${unmatched.length}):`);
    for (const name of unmatched) console.log(`    - ${name}`);
  } else {
    console.log("  Unmatched: none");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
