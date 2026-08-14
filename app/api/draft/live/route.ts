import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEAGUE_ID_RE = /^[a-z0-9]+$/i;

export async function POST(request: Request) {
  let leagueId = "";
  try {
    const body = await request.json();
    leagueId = String(body?.leagueId ?? "").trim();
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
