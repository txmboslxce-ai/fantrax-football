import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { bzzoiroGet } from "@/lib/bsd/client";
import { findBsdEventId } from "@/lib/bsd/events";
import { BSD_ABBREV_TO_TEAM_ID } from "@/lib/bsd/teams";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Confirmed live: GET /api/v2/odds/ -- a flat list endpoint like /events/
// and /transfers/, not nested under an event. The filter param name and
// response shape are still unknown, so this tries several plausible
// variants (an id-style filter to a specific match, a team_id + date
// window like /events/ and /transfers/ use, and an unfiltered call to see
// the raw envelope/pagination shape) using the server's already-configured
// BZZOIRO_API_KEY, and surfaces the raw response (or error) for each.
function candidateRequests(
  eventId: number,
  homeTeamId: number | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined
): Array<{ label: string; path: string; params: Record<string, string> }> {
  const requests: Array<{ label: string; path: string; params: Record<string, string> }> = [
    { label: "?event_id=<event>", path: "/odds/", params: { event_id: String(eventId) } },
    { label: "?match_id=<event>", path: "/odds/", params: { match_id: String(eventId) } },
    { label: "?id=<event>", path: "/odds/", params: { id: String(eventId) } },
    { label: "(no params)", path: "/odds/", params: {} },
  ];
  if (homeTeamId && dateFrom && dateTo) {
    requests.push({ label: "?team_id=<home>&date_from&date_to", path: "/odds/", params: { team_id: String(homeTeamId), date_from: dateFrom, date_to: dateTo } });
  }
  return requests;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !isAdminEmail(user.email)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  let eventId: number | null = typeof body?.eventId === "number" && Number.isInteger(body.eventId) ? body.eventId : null;

  const homeAbbrev: string | undefined = typeof body?.homeAbbrev === "string" ? body.homeAbbrev : undefined;
  const awayAbbrev: string | undefined = typeof body?.awayAbbrev === "string" ? body.awayAbbrev : undefined;
  const kickoffAt: string | undefined = typeof body?.kickoffAt === "string" ? body.kickoffAt : undefined;

  if (!eventId && homeAbbrev && awayAbbrev && kickoffAt) {
    try {
      eventId = await findBsdEventId({ homeAbbrev, awayAbbrev, kickoffAt });
    } catch (error) {
      return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Failed to resolve event id" }, { status: 502 });
    }
  }

  if (!eventId) {
    return NextResponse.json(
      { success: false, message: "Provide eventId directly, or homeAbbrev/awayAbbrev/kickoffAt to resolve one" },
      { status: 400 }
    );
  }

  const homeTeamId = homeAbbrev ? BSD_ABBREV_TO_TEAM_ID[homeAbbrev] : undefined;
  let dateFrom: string | undefined;
  let dateTo: string | undefined;
  if (kickoffAt) {
    const kickoff = new Date(kickoffAt);
    if (!Number.isNaN(kickoff.getTime())) {
      dateFrom = new Date(kickoff.getTime() - ONE_DAY_MS).toISOString().slice(0, 10);
      dateTo = new Date(kickoff.getTime() + ONE_DAY_MS).toISOString().slice(0, 10);
    }
  }

  const results: Array<{ path: string; ok: boolean; body: unknown }> = [];

  for (const req of candidateRequests(eventId, homeTeamId, dateFrom, dateTo)) {
    try {
      const data = await bzzoiroGet<unknown>(req.path, req.params, 0);
      results.push({ path: req.label, ok: true, body: data });
    } catch (error) {
      results.push({ path: req.label, ok: false, body: error instanceof Error ? error.message : String(error) });
    }
  }

  return NextResponse.json({ success: true, eventId, results });
}
