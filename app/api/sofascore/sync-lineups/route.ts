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
  console.log(`[sync-lineups] GET ${url}`);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.sofascore.com",
      "Origin": "https://www.sofascore.com",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    console.error(`[sync-lineups] SofaScore ${res.status} for ${url}`);
    throw new Error(`SofaScore ${res.status} for ${url}`);
  }
  return res.json() as T;
}

// ─── SofaScore types ──────────────────────────────────────────────────────────

type ScheduledEvent = {
  id: number;
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

// ─── DB types ────────────────────────────────────────────────────────────────

type FixtureRow = { kickoff_at: string | null };
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
  console.log("[sync-lineups] POST started");
  const isCronInvocation = request.headers.get("x-vercel-cron") === "1";
  console.log(`[sync-lineups] isCronInvocation=${isCronInvocation}`);

  const supabase = await createServerSupabaseClient();

  if (!isCronInvocation) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) {
      console.error("[sync-lineups] Unauthorized");
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
  }

  const db = createAdminSupabaseClient() ?? supabase;

  let season: string;
  let gameweek: number;

  if (isCronInvocation) {
    season = "2025-26";

    const { data: latestGwData, error: latestGwError } = await db
      .from("player_gameweeks")
      .select("gameweek")
      .eq("season", season)
      .order("gameweek", { ascending: false })
      .limit(1);

    if (latestGwError) {
      console.error("[sync-lineups] latestGw query error:", latestGwError.message);
      return NextResponse.json({ success: false, message: latestGwError.message }, { status: 500 });
    }

    const latestGw: number = ((latestGwData ?? []) as { gameweek: number }[])[0]?.gameweek ?? 0;
    gameweek = latestGw + 1;
    console.log(`[sync-lineups] cron auto-detected: season=${season} latestGw=${latestGw} targetGw=${gameweek}`);
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
    console.log(`[sync-lineups] manual: season=${season} gameweek=${gameweek}`);
  }

  // ── 1. Get fixture dates for the target GW ─────────────────────────────────
  console.log(`[sync-lineups] querying fixtures for season=${season} gameweek=${gameweek}`);
  const { data: fixtureRows, error: fixturesError } = await db
    .from("fixtures")
    .select("kickoff_at")
    .eq("season", season)
    .eq("gameweek", gameweek);

  if (fixturesError) {
    console.error("[sync-lineups] fixtures query error:", fixturesError.message);
    return NextResponse.json({ success: false, message: fixturesError.message }, { status: 500 });
  }

  console.log(`[sync-lineups] fixture rows returned: ${(fixtureRows ?? []).length}`);

  const kickoffDates = [
    ...new Set(
      ((fixtureRows ?? []) as FixtureRow[])
        .map((r) => r.kickoff_at?.slice(0, 10))
        .filter((d): d is string => Boolean(d))
    ),
  ];

  console.log(`[sync-lineups] unique kickoff dates: ${kickoffDates.join(", ") || "(none)"}`);

  if (kickoffDates.length === 0) {
    return NextResponse.json(
      {
        success: false,
        message: `No fixture dates found for GW${gameweek} (season ${season}). Ensure kickoff_at is populated.`,
      },
      { status: 400 }
    );
  }

  // ── 2. Build sofascore_id → player_id lookup ───────────────────────────────
  const { data: playersRaw, error: playersError } = await db
    .from("players")
    .select("id, sofascore_id")
    .not("sofascore_id", "is", null);

  if (playersError) {
    console.error("[sync-lineups] players query error:", playersError.message);
    return NextResponse.json({ success: false, message: playersError.message }, { status: 500 });
  }

  const playerBySofaId = new Map<number, string>();
  for (const p of (playersRaw ?? []) as PlayerRow[]) {
    if (p.sofascore_id != null) playerBySofaId.set(p.sofascore_id, p.id);
  }
  console.log(`[sync-lineups] players with sofascore_id: ${playerBySofaId.size}`);

  // ── 3. Fetch scheduled events for each date, filter to Premier League ───────
  const eplEventIds: number[] = [];

  for (const date of kickoffDates) {
    try {
      console.log(`[sync-lineups] fetching scheduled-events for ${date}`);
      const data = await sofaFetch<ScheduledEventsResponse>(`/sport/football/scheduled-events/${date}`);
      const total = data.events?.length ?? 0;
      console.log(`[sync-lineups] ${date}: ${total} events total`);

      for (const event of data.events ?? []) {
        const tName = event.tournament?.name ?? "";
        const utName = event.tournament?.uniqueTournament?.name ?? "";
        const utId = event.tournament?.uniqueTournament?.id;

        const isPL = tName === "Premier League" || utName === "Premier League" || utId === 17;
        if (isPL) {
          eplEventIds.push(event.id);
        }
      }

      console.log(`[sync-lineups] ${date}: ${eplEventIds.length} PL events so far`);
    } catch (err) {
      console.error(`[sync-lineups] scheduled-events error for ${date}:`, (err as Error).message);
    }
  }

  if (eplEventIds.length === 0) {
    return NextResponse.json(
      {
        success: false,
        message: `No Premier League events found for GW${gameweek} on dates: ${kickoffDates.join(", ")}`,
      },
      { status: 404 }
    );
  }

  console.log(`[sync-lineups] fetching lineups for ${eplEventIds.length} PL events`);

  // ── 4. Fetch lineups for each event ───────────────────────────────────────
  const upsertRows: LineupUpsertRow[] = [];
  const unmatched: string[] = [];
  const fetchedAt = new Date().toISOString();

  for (const eventId of eplEventIds) {
    try {
      const data = await sofaFetch<LineupsResponse>(`/event/${eventId}/lineups`);
      const status: "confirmed" | "predicted" = data.confirmed ? "confirmed" : "predicted";
      console.log(`[sync-lineups] event ${eventId}: status=${status} home=${data.home?.players?.length ?? 0} away=${data.away?.players?.length ?? 0}`);

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
      console.error(`[sync-lineups] lineups error for event ${eventId}:`, (err as Error).message);
    }
  }

  console.log(`[sync-lineups] upsert rows: ${upsertRows.length} matched, ${unmatched.length} unmatched`);

  // ── 5. Upsert into sofascore_lineups ──────────────────────────────────────
  let synced = 0;
  if (upsertRows.length > 0) {
    const { error: upsertError } = await db.from("sofascore_lineups").upsert(upsertRows, {
      onConflict: "player_id,season,gameweek",
    });
    if (upsertError) {
      console.error("[sync-lineups] upsert error:", upsertError.message);
      return NextResponse.json({ success: false, message: upsertError.message }, { status: 500 });
    }
    synced = upsertRows.length;
  }

  console.log(`[sync-lineups] done. synced=${synced}`);

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
