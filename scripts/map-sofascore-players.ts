/**
 * map-sofascore-players.ts
 *
 * One-time script: fetches every EPL player who appeared in a lineup this
 * season from SofaScore, exact-name-matches them to our players table, writes
 * sofascore_id for matches, and outputs two CSV files for the rest.
 *
 * Run:
 *   npx tsx scripts/map-sofascore-players.ts
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import * as dotenv from "dotenv";
// Load .env.local (Next.js convention) then fall back to .env
dotenv.config({ path: ".env.local" });
dotenv.config();
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

// ─── Config ──────────────────────────────────────────────────────────────────

const SOFASCORE_BASE = "https://api.sofascore.com/api/v1";
const EPL_TOURNAMENT_ID = 17;
// SofaScore season ID for 2025-26 EPL — confirmed via /unique-tournament/17/seasons
const SEASON_ID = 61627;
const DELAY_MS = 200;

const OUTPUT_DIR = path.join(process.cwd(), "scripts", "output");

// ─── Types ───────────────────────────────────────────────────────────────────

type SofaPlayer = {
  id: number;
  name: string;
  position: string | null;
  team: string;
};

type OurPlayer = {
  id: string;
  name: string;
  position: string;
  team: string;
  sofascore_id: number | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sofaFetch<T>(path: string): Promise<T> {
  await delay(DELAY_MS);
  const url = `${SOFASCORE_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "application/json",
      Referer: "https://www.sofascore.com/",
    },
  });
  if (!res.ok) {
    throw new Error(`SofaScore ${res.status} for ${url}`);
  }
  return res.json() as T;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().normalize("NFC");
}

function toCsvRow(fields: (string | number | null)[]): string {
  return fields
    .map((f) => {
      if (f == null) return "";
      const s = String(f);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    })
    .join(",");
}

function writeCsv(filePath: string, header: string[], rows: (string | number | null)[][]): void {
  const lines = [header.join(","), ...rows.map(toCsvRow)];
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
}

// ─── SofaScore data fetching ──────────────────────────────────────────────────

type RoundsResponse = {
  rounds: Array<{ id: number; slug: string; name: string }>;
};

type EventsResponse = {
  events: Array<{ id: number; homeTeam: { name: string }; awayTeam: { name: string }; status: { type: string } }>;
};

type LineupsResponse = {
  home: {
    players: Array<{
      player: { id: number; name: string; position?: string };
    }>;
  };
  away: {
    players: Array<{
      player: { id: number; name: string; position?: string };
    }>;
  };
};

async function fetchAllEventIds(): Promise<number[]> {
  console.log(`Fetching rounds for tournament ${EPL_TOURNAMENT_ID}, season ${SEASON_ID}...`);

  const roundsData = await sofaFetch<RoundsResponse>(
    `/unique-tournament/${EPL_TOURNAMENT_ID}/season/${SEASON_ID}/rounds`
  );

  const rounds = roundsData.rounds ?? [];
  console.log(`Found ${rounds.length} rounds.`);

  const eventIds: number[] = [];

  for (const round of rounds) {
    process.stdout.write(`  Round ${round.name}: fetching events... `);
    try {
      const eventsData = await sofaFetch<EventsResponse>(
        `/unique-tournament/${EPL_TOURNAMENT_ID}/season/${SEASON_ID}/events/round/${round.id}`
      );
      const events = eventsData.events ?? [];
      // Only collect events that have been played (lineups exist for finished events)
      const finished = events.filter(
        (e) => e.status?.type === "finished" || e.status?.type === "inprogress"
      );
      for (const e of finished) {
        eventIds.push(e.id);
      }
      console.log(`${finished.length} finished events.`);
    } catch (err) {
      console.log(`error — ${(err as Error).message}`);
    }
  }

  return eventIds;
}

async function fetchLineupsForEvents(eventIds: number[]): Promise<Map<number, SofaPlayer>> {
  const players = new Map<number, SofaPlayer>();
  let done = 0;

  for (const eventId of eventIds) {
    done++;
    process.stdout.write(`  [${done}/${eventIds.length}] event ${eventId}... `);
    try {
      const data = await sofaFetch<LineupsResponse>(`/event/${eventId}/lineups`);

      const addSide = (
        side: LineupsResponse["home"] | LineupsResponse["away"],
        teamName: string
      ) => {
        for (const entry of side?.players ?? []) {
          const p = entry.player;
          if (!players.has(p.id)) {
            players.set(p.id, {
              id: p.id,
              name: p.name,
              position: p.position ?? null,
              team: teamName,
            });
          }
        }
      };

      // We need team names — re-fetch event to get them (they're in lineups response too via teamId)
      // Actually lineups doesn't include team name, so we separately fetch the event
      const eventData = await sofaFetch<{ event: { homeTeam: { name: string }; awayTeam: { name: string } } }>(
        `/event/${eventId}`
      );

      addSide(data.home, eventData.event.homeTeam.name);
      addSide(data.away, eventData.event.awayTeam.name);

      console.log(`${(data.home?.players?.length ?? 0) + (data.away?.players?.length ?? 0)} players.`);
    } catch (err) {
      console.log(`skipped — ${(err as Error).message}`);
    }
  }

  return players;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Validate env
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // ── Step 1: Fetch all finished event IDs ──────────────────────────────────
  const eventIds = await fetchAllEventIds();
  console.log(`\nTotal finished events: ${eventIds.length}\n`);

  // ── Step 2: Fetch lineups for all events ──────────────────────────────────
  console.log("Fetching lineups...");
  const sofaPlayers = await fetchLineupsForEvents(eventIds);
  console.log(`\nUnique SofaScore players collected: ${sofaPlayers.size}\n`);

  // ── Step 3: Pull our players ──────────────────────────────────────────────
  console.log("Fetching our players from Supabase...");
  const { data: ourPlayersRaw, error } = await supabase
    .from("players")
    .select("id, name, position, team, sofascore_id");
  if (error) {
    console.error("Supabase error:", error.message);
    process.exit(1);
  }
  const ourPlayers = (ourPlayersRaw ?? []) as OurPlayer[];
  console.log(`Our players: ${ourPlayers.length}\n`);

  // ── Step 4: Exact name match ──────────────────────────────────────────────
  const ourByNorm = new Map<string, OurPlayer>();
  for (const p of ourPlayers) {
    ourByNorm.set(normalizeName(p.name), p);
  }

  const sofaArray = [...sofaPlayers.values()];
  const matchedSofaIds = new Set<number>();
  const matchedOurIds = new Set<string>();
  const updates: Array<{ id: string; sofascore_id: number }> = [];

  for (const sp of sofaArray) {
    const norm = normalizeName(sp.name);
    const ours = ourByNorm.get(norm);
    if (ours && ours.sofascore_id == null) {
      updates.push({ id: ours.id, sofascore_id: sp.id });
      matchedSofaIds.add(sp.id);
      matchedOurIds.add(ours.id);
    } else if (ours && ours.sofascore_id != null) {
      // Already mapped — just mark as matched
      matchedSofaIds.add(sp.id);
      matchedOurIds.add(ours.id);
    }
  }

  console.log(`Exact matches to write: ${updates.length}`);

  // ── Step 5: Write matches to Supabase ────────────────────────────────────
  if (updates.length > 0) {
    console.log("Writing sofascore_id values to players table...");
    const BATCH = 50;
    let written = 0;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      const { error: upsertErr } = await supabase.from("players").upsert(batch, { onConflict: "id" });
      if (upsertErr) {
        console.error(`Batch upsert error at offset ${i}:`, upsertErr.message);
      } else {
        written += batch.length;
        process.stdout.write(`  Written ${written}/${updates.length}\r`);
      }
    }
    console.log(`\nWrote ${written} rows.`);
  }

  // ── Step 6: Output unmatched CSVs ─────────────────────────────────────────
  const unmatchedSofa = sofaArray.filter((sp) => !matchedSofaIds.has(sp.id));
  const unmatchedOurs = ourPlayers.filter(
    (op) => !matchedOurIds.has(op.id) && op.sofascore_id == null
  );

  const sofaCsvPath = path.join(OUTPUT_DIR, "unmatched-sofascore.csv");
  writeCsv(
    sofaCsvPath,
    ["sofascore_id", "name", "position", "team"],
    unmatchedSofa.map((sp) => [sp.id, sp.name, sp.position, sp.team])
  );

  const oursCsvPath = path.join(OUTPUT_DIR, "unmatched-ours.csv");
  writeCsv(
    oursCsvPath,
    ["player_id", "name", "position", "team"],
    unmatchedOurs.map((op) => [op.id, op.name, op.position, op.team])
  );

  // ── Step 7: Produce manual-mapping.csv template ──────────────────────────
  // Pairs unmatched ours rows with empty sofascore fields for manual fill-in
  const manualPath = path.join(OUTPUT_DIR, "manual-mapping.csv");
  writeCsv(
    manualPath,
    ["our_player_id", "our_name", "sofascore_id", "sofascore_name"],
    unmatchedOurs.map((op) => [op.id, op.name, "", ""])
  );

  console.log(`\n── Results ─────────────────────────────────────────────`);
  console.log(`  Exact matches written:   ${updates.length}`);
  console.log(`  Unmatched (SofaScore):   ${unmatchedSofa.length}  → ${sofaCsvPath}`);
  console.log(`  Unmatched (ours):        ${unmatchedOurs.length}  → ${oursCsvPath}`);
  console.log(`  Manual mapping template: ${manualPath}`);
  console.log(`────────────────────────────────────────────────────────\n`);
  console.log(
    `Next: open scripts/output/manual-mapping.csv, fill in sofascore_id + sofascore_name for each row,\n` +
    `then run: npx tsx scripts/apply-sofascore-mappings.ts`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
