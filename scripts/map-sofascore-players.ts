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

// Fuzzy normalisation: strip accents, collapse hyphens to spaces
function fuzzyNorm(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/-/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function lastName(norm: string): string {
  const parts = norm.split(" ");
  return parts[parts.length - 1];
}

function firstLastWord(norm: string): string {
  const parts = norm.split(" ");
  if (parts.length <= 1) return norm;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

// Map SofaScore position codes to our GK/DEF/MID/FWD
function mapSofaPosition(pos: string | null): string | null {
  if (!pos) return null;
  const p = pos.toLowerCase();
  if (p === "g" || p.startsWith("goal")) return "GK";
  if (p === "d" || p.startsWith("def")) return "DEF";
  if (p === "m" || p.startsWith("mid")) return "MID";
  if (p === "f" || p === "a" || p.startsWith("for") || p.startsWith("att") || p.startsWith("str")) return "FWD";
  return null;
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
  rounds: Array<{ round: number; name: string; slug?: string }>;
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
  if (rounds.length > 0) {
    console.log("Raw rounds sample:", JSON.stringify(rounds[0], null, 2));
  }

  const eventIds: number[] = [];

  for (const round of rounds) {
    process.stdout.write(`  Round ${round.name}: fetching events... `);
    try {
      const eventsData = await sofaFetch<EventsResponse>(
        `/unique-tournament/${EPL_TOURNAMENT_ID}/season/${SEASON_ID}/events/round/${round.round}`
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

  // ── Step 4b: Fuzzy matching ───────────────────────────────────────────────
  // Build lookup structures over still-unmatched sofa players, keyed by
  // fuzzy-normalised name variants and position.
  const unmatchedSofaForFuzzy = sofaArray.filter((sp) => !matchedSofaIds.has(sp.id));
  const unmatchedOursForFuzzy = ourPlayers.filter(
    (op) => !matchedOurIds.has(op.id) && op.sofascore_id == null
  );

  type FuzzyMatch = {
    ourPlayerId: string;
    ourName: string;
    ourPosition: string;
    ourTeam: string;
    sofascoreId: number;
    sofascoreName: string;
    sofascorePosition: string | null;
    sofascoreTeam: string;
    matchRule: string;
  };

  const fuzzyMatches: FuzzyMatch[] = [];
  const fuzzyMatchedSofaIds = new Set<number>();
  const fuzzyMatchedOurIds = new Set<string>();

  // Index sofa players by position → array so we can find candidates
  const sofaByPosition = new Map<string, SofaPlayer[]>();
  for (const sp of unmatchedSofaForFuzzy) {
    const mappedPos = mapSofaPosition(sp.position) ?? "UNKNOWN";
    if (!sofaByPosition.has(mappedPos)) sofaByPosition.set(mappedPos, []);
    sofaByPosition.get(mappedPos)!.push(sp);
  }

  // Also build a flat fuzzy-norm → sofa player map for rule 1 (normalised exact)
  const sofaByFuzzyNorm = new Map<string, SofaPlayer[]>();
  for (const sp of unmatchedSofaForFuzzy) {
    const key = fuzzyNorm(sp.name);
    if (!sofaByFuzzyNorm.has(key)) sofaByFuzzyNorm.set(key, []);
    sofaByFuzzyNorm.get(key)!.push(sp);
  }

  for (const op of unmatchedOursForFuzzy) {
    if (fuzzyMatchedOurIds.has(op.id)) continue;

    const ourNorm = fuzzyNorm(op.name);
    let candidates: Array<{ sp: SofaPlayer; rule: string }> = [];

    // Rule 1: normalised exact match (handles accents / hyphens)
    const rule1 = (sofaByFuzzyNorm.get(ourNorm) ?? []).filter(
      (sp) => !fuzzyMatchedSofaIds.has(sp.id)
    );
    if (rule1.length === 1) {
      candidates = [{ sp: rule1[0], rule: "fuzzy-norm-exact" }];
    } else if (rule1.length > 1) {
      // Ambiguous — skip rule 1
    }

    // Rule 2: last-name match scoped to same position
    if (candidates.length === 0) {
      const ourLast = lastName(ourNorm);
      const posPool = (sofaByPosition.get(op.position) ?? []).filter(
        (sp) => !fuzzyMatchedSofaIds.has(sp.id)
      );
      const rule2 = posPool.filter((sp) => lastName(fuzzyNorm(sp.name)) === ourLast);
      if (rule2.length === 1) {
        candidates = [{ sp: rule2[0], rule: "last-name+position" }];
      }
    }

    // Rule 3: first-word + last-word match
    if (candidates.length === 0) {
      const ourFL = firstLastWord(ourNorm);
      const rule3 = unmatchedSofaForFuzzy.filter((sp) => {
        if (fuzzyMatchedSofaIds.has(sp.id)) return false;
        return firstLastWord(fuzzyNorm(sp.name)) === ourFL;
      });
      if (rule3.length === 1) {
        candidates = [{ sp: rule3[0], rule: "first+last-word" }];
      }
    }

    if (candidates.length === 1) {
      const { sp, rule } = candidates[0];
      fuzzyMatches.push({
        ourPlayerId: op.id,
        ourName: op.name,
        ourPosition: op.position,
        ourTeam: op.team,
        sofascoreId: sp.id,
        sofascoreName: sp.name,
        sofascorePosition: sp.position,
        sofascoreTeam: sp.team,
        matchRule: rule,
      });
      fuzzyMatchedSofaIds.add(sp.id);
      fuzzyMatchedOurIds.add(op.id);
    }
  }

  console.log(`Fuzzy matches (for review): ${fuzzyMatches.length}`);

  // ── Step 5: Write matches to Supabase ────────────────────────────────────
  if (updates.length > 0) {
    console.log("Writing sofascore_id values to players table...");
    const BATCH = 50;
    let written = 0;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(({ id, sofascore_id }) =>
          supabase.from("players").update({ sofascore_id }).eq("id", id)
        )
      );
      for (const { error } of results) {
        if (error) {
          console.error(`Update error:`, error.message);
        } else {
          written++;
        }
      }
      process.stdout.write(`  Written ${written}/${updates.length}\r`);
    }
    console.log(`\nWrote ${written} rows.`);
  }

  // ── Step 6: Output unmatched CSVs ─────────────────────────────────────────
  // Exclude both exact-matched and fuzzy-matched players from unmatched lists
  const allMatchedSofaIds = new Set([...matchedSofaIds, ...fuzzyMatchedSofaIds]);
  const allMatchedOurIds = new Set([...matchedOurIds, ...fuzzyMatchedOurIds]);

  const unmatchedSofa = sofaArray.filter((sp) => !allMatchedSofaIds.has(sp.id));
  const unmatchedOurs = ourPlayers.filter(
    (op) => !allMatchedOurIds.has(op.id) && op.sofascore_id == null
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

  // ── Step 7: Output fuzzy-matches.csv for review ───────────────────────────
  const fuzzyPath = path.join(OUTPUT_DIR, "fuzzy-matches.csv");
  writeCsv(
    fuzzyPath,
    ["our_player_id", "our_name", "our_position", "our_team", "sofascore_id", "sofascore_name", "sofascore_position", "sofascore_team", "match_rule"],
    fuzzyMatches.map((m) => [
      m.ourPlayerId, m.ourName, m.ourPosition, m.ourTeam,
      m.sofascoreId, m.sofascoreName, m.sofascorePosition, m.sofascoreTeam,
      m.matchRule,
    ])
  );

  // ── Step 8: Produce manual-mapping.csv template ───────────────────────────
  const manualPath = path.join(OUTPUT_DIR, "manual-mapping.csv");
  writeCsv(
    manualPath,
    ["our_player_id", "our_name", "sofascore_id", "sofascore_name"],
    unmatchedOurs.map((op) => [op.id, op.name, "", ""])
  );

  console.log(`\n── Results ─────────────────────────────────────────────`);
  console.log(`  Exact matches written:   ${updates.length}`);
  console.log(`  Fuzzy matches (review):  ${fuzzyMatches.length}  → ${fuzzyPath}`);
  console.log(`  Unmatched (SofaScore):   ${unmatchedSofa.length}  → ${sofaCsvPath}`);
  console.log(`  Unmatched (ours):        ${unmatchedOurs.length}  → ${oursCsvPath}`);
  console.log(`  Manual mapping template: ${manualPath}`);
  console.log(`────────────────────────────────────────────────────────\n`);
  console.log(
    `Next steps:\n` +
    `  1. Review scripts/output/fuzzy-matches.csv — approve rows by running apply-sofascore-mappings.ts\n` +
    `     (copy approved rows into manual-mapping.csv)\n` +
    `  2. Fill in sofascore_id + sofascore_name in manual-mapping.csv for remaining unmatched rows\n` +
    `  3. Run: npx tsx scripts/apply-sofascore-mappings.ts`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
