import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const SOFASCORE_BASE = "https://api.sofascore.com/api/v1";
const DELAY_MS = 150;

// ─── helpers ──────────────────────────────────────────────────────────────────

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
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`SofaScore ${res.status} for ${url}`);
  return res.json() as T;
}

// ─── SofaScore types ──────────────────────────────────────────────────────────

const EPL_TOURNAMENT_ID = 17;
const EPL_SEASON_ID = 61627;

type RoundEvent = {
  id: number;
  status?: { type: string };
};

type RoundEventsResponse = { events?: RoundEvent[] };

type LineupsResponse = {
  confirmed?: boolean;
  home?: { players?: LineupsPlayer[] };
  away?: { players?: LineupsPlayer[] };
};

type LineupsPlayer = {
  player: { id: number; name: string };
  substitute: boolean;
};

// ─── DB types ────────────────────────────────────────────────────────────────

type PlayerRow = { id: string; sofascore_id: number | null };

type LineupUpsertRow = {
  player_id: string;
  season: string;
  gameweek: number;
  sofascore_event_id: number;
  status: "predicted" | "confirmed";
  is_starter: boolean;
  fetched_at: string;
};

// ─── route ────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const isCronInvocation = request.headers.get("x-vercel-cron") === "1";
  const supabase = await createServerSupabaseClient();

  if (!isCronInvocation) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
  }

  const db = createAdminSupabaseClient() ?? supabase;

  let season: string;
  let gameweek: number;

  if (isCronInvocation) {
    // Auto-determine: next GW after the latest uploaded GW
    season = "2025-26";

    const { data: latestGwData } = await db
      .from("player_gameweeks")
      .select("gameweek")
      .eq("season", season)
      .order("gameweek", { ascending: false })
      .limit(1);

    const latestGw: number = ((latestGwData ?? []) as { gameweek: number }[])[0]?.gameweek ?? 0;
    gameweek = latestGw + 1;
  } else {
    let body: { season?: string; gameweek?: number } = {};
    try {
      body = (await request.json()) as { season?: string; gameweek?: number };
    } catch {
      body = {};
    }
    season = String(body.season ?? "2025-26").trim() || "2025-26";
    const gwRaw = Number(body.gameweek);
    if (!Number.isInteger(gwRaw) || gwRaw <= 0) {
      return NextResponse.json({ success: false, message: "Invalid gameweek." }, { status: 400 });
    }
    gameweek = gwRaw;
  }

  // ── 1. Build sofascore_id → player_id lookup ──────────────────────────────
  const { data: playersRaw, error: playersError } = await db
    .from("players")
    .select("id, sofascore_id")
    .not("sofascore_id", "is", null);

  if (playersError) {
    return NextResponse.json({ success: false, message: playersError.message }, { status: 500 });
  }

  const playerBySofaId = new Map<number, string>();
  for (const p of (playersRaw ?? []) as PlayerRow[]) {
    if (p.sofascore_id != null) playerBySofaId.set(p.sofascore_id, p.id);
  }

  // ── 2. Fetch EPL events for the target round directly ─────────────────────
  // Uses the tournament/season/round endpoint (avoids scheduled-events which blocks server-side)
  let eplEventIds: number[];
  try {
    const data = await sofaFetch<RoundEventsResponse>(
      `/unique-tournament/${EPL_TOURNAMENT_ID}/season/${EPL_SEASON_ID}/events/round/${gameweek}`
    );
    eplEventIds = (data.events ?? []).map((e) => e.id);
  } catch (err) {
    return NextResponse.json(
      { success: false, message: `Failed to fetch EPL events for GW${gameweek}: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  if (eplEventIds.length === 0) {
    return NextResponse.json(
      { success: false, message: `No EPL events found for GW${gameweek} (round ${gameweek}).` },
      { status: 404 }
    );
  }

  // ── 3. Fetch lineups for each event ───────────────────────────────────────
  const upsertRows: LineupUpsertRow[] = [];
  const unmatched: string[] = [];
  const fetchedAt = new Date().toISOString();

  for (const eventId of eplEventIds) {
    try {
      const data = await sofaFetch<LineupsResponse>(`/event/${eventId}/lineups`);
      const status: "confirmed" | "predicted" = data.confirmed ? "confirmed" : "predicted";

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
            season,
            gameweek,
            sofascore_event_id: eventId,
            status,
            is_starter: !entry.substitute,
            fetched_at: fetchedAt,
          });
        }
      }
    } catch (err) {
      console.warn(`Lineups error for event ${eventId}:`, (err as Error).message);
    }
  }

  // ── 4. Upsert into sofascore_lineups ──────────────────────────────────────
  let synced = 0;
  if (upsertRows.length > 0) {
    const { error: upsertError } = await db.from("sofascore_lineups").upsert(upsertRows, {
      onConflict: "player_id,season,gameweek",
    });
    if (upsertError) {
      return NextResponse.json({ success: false, message: upsertError.message }, { status: 500 });
    }
    synced = upsertRows.length;
  }

  return NextResponse.json({
    success: true,
    status: "ok",
    gameweek,
    season,
    synced,
    unmatched,
    fetchedAt,
  });
}
