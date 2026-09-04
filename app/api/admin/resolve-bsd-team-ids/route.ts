import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { bzzoiroGet } from "@/lib/bsd/client";
import { seasonDateBounds } from "@/lib/bsd/matchStatsBackfill";
import { FIXTURES_SEASON, PRIOR_SEASON } from "@/lib/season/fixtures";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// One-off diagnostic for filling gaps in BSD_ABBREV_TO_TEAM_ID (lib/bsd/teams.ts)
// when a team drops out of the current top flight: given a candidate numeric
// BSD team_id, find one event that team played in a season and read its name
// back off that event's lineups. There's no direct "team by id" endpoint in
// use elsewhere in this app, so this reuses the same events+lineups calls the
// backfill and fixture pages already make.

type RawEventRow = { id: number; home_team_id: number; away_team_id: number };
type RawEventListResponse = { results: RawEventRow[] };
type RawTeamLineup = { team_id: number; team_name: string };
type RawLineupsResponse = { lineups: { home: RawTeamLineup; away: RawTeamLineup } | null };

const BACKFILLABLE_SEASONS = [FIXTURES_SEASON, PRIOR_SEASON];

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
  const teamIds = Array.isArray(body?.teamIds) ? body.teamIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id)) : [];
  const season = typeof body?.season === "string" && body.season ? body.season : PRIOR_SEASON;

  if (teamIds.length === 0) {
    return NextResponse.json({ success: false, message: "Provide at least one numeric teamId" }, { status: 400 });
  }
  if (!BACKFILLABLE_SEASONS.includes(season)) {
    return NextResponse.json({ success: false, message: `Unsupported season '${season}'` }, { status: 400 });
  }

  const bounds = seasonDateBounds(season);
  if (!bounds) {
    return NextResponse.json({ success: false, message: `Season '${season}' didn't parse into a date window` }, { status: 400 });
  }

  const results: Array<{ teamId: number; teamName: string | null; eventId: number | null }> = [];

  for (const teamId of teamIds) {
    try {
      const events = await bzzoiroGet<RawEventListResponse>(
        "/events/",
        { team_id: String(teamId), date_from: bounds.dateFrom, date_to: bounds.dateTo },
        3600
      );
      const event = events.results[0];
      if (!event) {
        results.push({ teamId, teamName: null, eventId: null });
        continue;
      }

      const lineups = await bzzoiroGet<RawLineupsResponse>(`/events/${event.id}/lineups/`, {}, 3600);
      const side = [lineups.lineups?.home, lineups.lineups?.away].find((team) => team?.team_id === teamId);
      results.push({ teamId, teamName: side?.team_name ?? null, eventId: event.id });
    } catch (error) {
      results.push({ teamId, teamName: null, eventId: null });
      if (error instanceof Error) {
        results[results.length - 1] = { teamId, teamName: `error: ${error.message}`, eventId: null };
      }
    }
  }

  return NextResponse.json({ success: true, results });
}
