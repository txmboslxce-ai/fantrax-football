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

type ScheduledEvent = {
  id: number;
  tournament: { name: string };
  homeTeam: { name: string };
  awayTeam: { name: string };
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

    const { data: nextGwData } = await db
      .from("fixtures")
      .select("gameweek")
      .eq("season", season)
      .gt("gameweek", latestGw)
      .order("gameweek", { ascending: true })
      .limit(1);

    const nextGw = ((nextGwData ?? []) as { gameweek: number }[])[0]?.gameweek ?? null;
    if (!nextGw) {
      return NextResponse.json({ success: false, message: "No upcoming gameweek found." }, { status: 400 });
    }
    gameweek = nextGw;
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

  // ── 1. Get fixture dates for the target GW ─────────────────────────────────
  const { data: fixtureRows, error: fixturesError } = await db
    .from("fixtures")
    .select("kickoff_at")
    .eq("season", season)
    .eq("gameweek", gameweek);

  if (fixturesError) {
    return NextResponse.json({ success: false, message: fixturesError.message }, { status: 500 });
  }

  const kickoffDates = [
    ...new Set(
      ((fixtureRows ?? []) as FixtureRow[])
        .map((r) => r.kickoff_at?.slice(0, 10))
        .filter((d): d is string => Boolean(d))
    ),
  ];

  if (kickoffDates.length === 0) {
    return NextResponse.json(
      { success: false, message: `No fixture dates found for GW${gameweek}. Ensure kickoff_at is populated.` },
      { status: 400 }
    );
  }

  // ── 2. Build sofascore_id → player_id lookup ───────────────────────────────
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

  // ── 3. Fetch scheduled events for each date, filter to Premier League ───────
  const eplEventIds: number[] = [];

  for (const date of kickoffDates) {
    try {
      const data = await sofaFetch<ScheduledEventsResponse>(`/sport/football/scheduled-events/${date}`);
      for (const event of data.events ?? []) {
        if (event.tournament?.name === "Premier League") {
          eplEventIds.push(event.id);
        }
      }
    } catch (err) {
      console.warn(`SofaScore scheduled-events error for ${date}:`, (err as Error).message);
    }
  }

  if (eplEventIds.length === 0) {
    return NextResponse.json(
      { success: false, message: `No Premier League events found for GW${gameweek} on dates: ${kickoffDates.join(", ")}` },
      { status: 404 }
    );
  }

  // ── 4. Fetch lineups for each event ───────────────────────────────────────
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

  // ── 5. Upsert into sofascore_lineups ──────────────────────────────────────
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
