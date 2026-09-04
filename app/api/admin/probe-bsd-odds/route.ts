import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { bzzoiroGet } from "@/lib/bsd/client";
import { findBsdEventId } from "@/lib/bsd/events";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// One-off diagnostic: nothing in this codebase has ever touched BSD's odds
// data, so the actual endpoint path and response shape are unknown. Rather
// than guess at expected-goals conversion math blind (or need the API
// token pasted into chat again), this tries a handful of plausible paths
// -- following the same /events/{id}/<resource>/ pattern already
// established for stats/incidents/lineups -- using the server's already-
// configured BZZOIRO_API_KEY, and returns whatever comes back (including
// the error) for each so the real shape can be read off directly.
function candidatePaths(eventId: number): string[] {
  return [
    `/events/${eventId}/odds/`,
    `/events/${eventId}/consensus-odds/`,
    `/events/${eventId}/consensus/`,
    `/events/${eventId}/markets/`,
    `/events/${eventId}/`,
  ];
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

  if (!eventId && body?.homeAbbrev && body?.awayAbbrev && body?.kickoffAt) {
    try {
      eventId = await findBsdEventId({ homeAbbrev: body.homeAbbrev, awayAbbrev: body.awayAbbrev, kickoffAt: body.kickoffAt });
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

  const results: Array<{ path: string; ok: boolean; body: unknown }> = [];

  for (const path of candidatePaths(eventId)) {
    try {
      const data = await bzzoiroGet<unknown>(path, {}, 0);
      results.push({ path, ok: true, body: data });
    } catch (error) {
      results.push({ path, ok: false, body: error instanceof Error ? error.message : String(error) });
    }
  }

  return NextResponse.json({ success: true, eventId, results });
}
