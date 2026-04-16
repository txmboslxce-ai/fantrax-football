/**
 * apply-sofascore-mappings.ts
 *
 * Reads the completed scripts/output/manual-mapping.csv and writes
 * sofascore_id to the players table for rows that have a sofascore_id filled in.
 *
 * CSV format (produced by map-sofascore-players.ts):
 *   our_player_id, our_name, sofascore_id, sofascore_name
 *
 * Run:
 *   npx tsx scripts/apply-sofascore-mappings.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

const MANUAL_CSV = path.join(process.cwd(), "scripts", "output", "manual-mapping.csv");

function parseSimpleCsv(content: string): Record<string, string>[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    // Basic CSV parse — handles quoted fields
    const fields: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === "," && !inQuote) {
        fields.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (fields[idx] ?? "").trim();
    });
    return row;
  });
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
    process.exit(1);
  }

  if (!fs.existsSync(MANUAL_CSV)) {
    console.error(`Cannot find ${MANUAL_CSV}. Run map-sofascore-players.ts first.`);
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rows = parseSimpleCsv(fs.readFileSync(MANUAL_CSV, "utf8"));
  console.log(`Read ${rows.length} rows from manual-mapping.csv`);

  const toApply = rows.filter((r) => r.our_player_id && r.sofascore_id && r.sofascore_id.trim() !== "");

  if (toApply.length === 0) {
    console.log("No rows have a sofascore_id filled in. Nothing to do.");
    return;
  }

  console.log(`Applying ${toApply.length} manual mappings...`);

  const BATCH = 50;
  let written = 0;
  let errors = 0;

  for (let i = 0; i < toApply.length; i += BATCH) {
    const batch = toApply
      .slice(i, i + BATCH)
      .map((r) => ({ id: r.our_player_id, sofascore_id: parseInt(r.sofascore_id, 10) }))
      .filter((r) => !isNaN(r.sofascore_id));

    if (batch.length === 0) continue;

    const results = await Promise.all(
      batch.map(({ id, sofascore_id }) =>
        supabase.from("players").update({ sofascore_id }).eq("id", id)
      )
    );
    for (const { error } of results) {
      if (error) {
        console.error(`  Update error:`, error.message);
        errors++;
      } else {
        written++;
      }
    }
    process.stdout.write(`  Written ${written}/${toApply.length}\r`);
  }

  console.log(`\n── Results ───────────────────────────────────`);
  console.log(`  Rows applied:  ${written}`);
  if (errors > 0) console.log(`  Batch errors:  ${errors}`);
  console.log(`─────────────────────────────────────────────\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
