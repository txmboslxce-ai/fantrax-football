import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEAGUE_ID_RE = /^[a-z0-9]+$/i;

export async function POST(request: Request) {
  let leagueId = "";
  let logConnection = false;
  try {
    const body = await request.json();
    leagueId = String(body?.leagueId ?? "").trim();
    logConnection = body?.logConnection === true;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!leagueId || !LEAGUE_ID_RE.test(leagueId)) {
    return NextResponse.json({ error: "Invalid leagueId" }, { status: 400 });
  }

  try {
    const res = await fetch(`https://www.fantrax.com/fxpa/req?leagueId=${leagueId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Referer: `https://www.fantrax.com/fantasy/league/${leagueId}/draft`,
        Origin: "https://www.fantrax.com",
      },
      body: JSON.stringify({ msgs: [{ method: "getDraftResults", data: { leagueId } }] }),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Fantrax responded ${res.status}` }, { status: 502 });
    }
    const json = await res.json();
    const data = json?.responses?.[0]?.data;
    const picks = Array.isArray(data?.draftPicksOrdered) ? data.draftPicksOrdered : null;
    if (!picks) {
      return NextResponse.json({ error: "No draft data — draft may not have started" }, { status: 404 });
    }
    const draftedScorerIds = picks
      .map((p: { scorerId?: unknown }) => p?.scorerId)
      .filter((s: unknown): s is string => typeof s === "string" && s.length > 0);
    if (logConnection) {
      try {
        const supabase = await createServerSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { error } = await supabase.from("live_draft_connections").insert({ user_id: user.id, league_id: leagueId });
          if (error) console.warn("[draft/live] Failed to log live draft connection:", error.message);
        }
      } catch (error) {
        console.warn("[draft/live] Failed to log live draft connection:", error);
      }
    }
    return NextResponse.json({
      draftedScorerIds,
      pickCount: draftedScorerIds.length,
      totalSlots: picks.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fantrax fetch failed" },
      { status: 502 }
    );
  }
}
