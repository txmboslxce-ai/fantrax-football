import Link from "next/link";
import { notFound } from "next/navigation";
import FixtureDetailClient from "@/app/portal/fixtures/FixtureDetailClient";
import { getUserLeagueRoster } from "@/lib/portal/leagueRoster";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const SEASON = "2025-26";

type PageProps = {
  params:
    | {
        id: string;
      }
    | Promise<{
        id: string;
      }>;
};

type FixtureRow = {
  id: string;
  gameweek: number;
  home_team: string;
  away_team: string;
  kickoff_at: string | null;
};

type TeamRow = {
  abbrev: string;
  full_name: string | null;
  name: string | null;
};

type PlayerRow = {
  id: string;
  name: string;
  team: string;
  position: string;
  fpl_player_data:
    | {
        chance_of_playing_next_round: number | null;
        status: string | null;
        news: string | null;
      }
    | Array<{
        chance_of_playing_next_round: number | null;
        status: string | null;
        news: string | null;
      }>
    | null;
};

type PlayerGameweekRow = {
  player_id: string;
  games_played: number;
  minutes_played: number;
  raw_fantrax_pts: number | string | null;
  ghost_pts: number | string | null;
  goals: number;
  assists: number;
  key_passes: number;
  accurate_crosses: number;
};

async function loadFixture(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  fixtureId: string
): Promise<FixtureRow | null> {
  const withKickoff = await supabase
    .from("fixtures")
    .select("id, gameweek, home_team, away_team, kickoff_at")
    .eq("season", SEASON)
    .eq("id", fixtureId)
    .limit(1);

  if (!withKickoff.error) {
    return ((withKickoff.data ?? []) as FixtureRow[])[0] ?? null;
  }

  if (!withKickoff.error.message.includes("kickoff_at")) {
    throw new Error(`Unable to load fixture: ${withKickoff.error.message}`);
  }

  const withoutKickoff = await supabase
    .from("fixtures")
    .select("id, gameweek, home_team, away_team")
    .eq("season", SEASON)
    .eq("id", fixtureId)
    .limit(1);

  if (withoutKickoff.error) {
    throw new Error(`Unable to load fixture: ${withoutKickoff.error.message}`);
  }

  const fixture = ((withoutKickoff.data ?? []) as Array<Omit<FixtureRow, "kickoff_at">>)[0];
  return fixture ? { ...fixture, kickoff_at: null } : null;
}

function formatKickoff(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const kickoff = new Date(value);
  if (Number.isNaN(kickoff.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(kickoff);
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function mapPosition(value: string): "GK" | "DEF" | "MID" | "FWD" {
  if (value === "G" || value === "GK") {
    return "GK";
  }
  if (value === "D" || value === "DEF") {
    return "DEF";
  }
  if (value === "M" || value === "MID") {
    return "MID";
  }
  return "FWD";
}

function positionOrder(position: "GK" | "DEF" | "MID" | "FWD"): number {
  if (position === "GK") {
    return 0;
  }
  if (position === "DEF") {
    return 1;
  }
  if (position === "MID") {
    return 2;
  }
  return 3;
}

export default async function FixtureDetailPage({ params }: PageProps) {
  const resolvedParams = params && typeof params === "object" && "then" in params ? await params : params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [fixture, { data: teamsData, error: teamsError }, leagueRoster] = await Promise.all([
    loadFixture(supabase, resolvedParams.id),
    supabase.from("teams").select("abbrev, full_name, name"),
    user ? getUserLeagueRoster(user.id) : Promise.resolve(null),
  ]);

  if (teamsError) {
    throw new Error(`Unable to load teams: ${teamsError.message}`);
  }

  if (!fixture) {
    notFound();
  }

  const teamNameByAbbrev = new Map<string, string>();
  for (const team of (teamsData ?? []) as TeamRow[]) {
    teamNameByAbbrev.set(team.abbrev, team.full_name || team.name || team.abbrev);
  }

  const homeTeam = teamNameByAbbrev.get(fixture.home_team) ?? fixture.home_team;
  const awayTeam = teamNameByAbbrev.get(fixture.away_team) ?? fixture.away_team;

  const { data: playersData, error: playersError } = await supabase
    .from("players")
    .select("id, name, team, position, fpl_player_data(chance_of_playing_next_round, status, news)")
    .in("team", [fixture.home_team, fixture.away_team]);

  if (playersError) {
    throw new Error(`Unable to load fixture players: ${playersError.message}`);
  }

  const players = (playersData ?? []) as PlayerRow[];
  const playerIds = players.map((player) => player.id);

  const { data: playerGameweeksData, error: playerGameweeksError } =
    playerIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("player_gameweeks")
          .select("player_id, games_played, minutes_played, raw_fantrax_pts, ghost_pts, goals, assists, key_passes, accurate_crosses")
          .eq("season", SEASON)
          .eq("gameweek", fixture.gameweek)
          .in("player_id", playerIds)
          .gt("games_played", 0);

  if (playerGameweeksError) {
    throw new Error(`Unable to load fixture player outputs: ${playerGameweeksError.message}`);
  }

  const playersById = new Map(players.map((player) => [player.id, player]));

  const rows = ((playerGameweeksData ?? []) as PlayerGameweekRow[])
    .map((row) => {
      const player = playersById.get(row.player_id);
      if (!player) {
        return null;
      }

      const availabilityRaw = Array.isArray(player.fpl_player_data) ? player.fpl_player_data[0] : player.fpl_player_data;

      return {
        id: player.id,
        name: player.name,
        team: player.team,
        position: mapPosition(player.position),
        minutesPlayed: Number(row.minutes_played ?? 0),
        rawFantraxPts: toNumber(row.raw_fantrax_pts),
        ghostPts: toNumber(row.ghost_pts),
        goals: Number(row.goals ?? 0),
        assists: Number(row.assists ?? 0),
        keyPasses: Number(row.key_passes ?? 0),
        accurateCrosses: Number(row.accurate_crosses ?? 0),
        chanceOfPlaying: availabilityRaw?.chance_of_playing_next_round ?? null,
        availabilityStatus: availabilityRaw?.status ?? null,
        availabilityNews: availabilityRaw?.news ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => {
      const positionDelta = positionOrder(a.position) - positionOrder(b.position);
      if (positionDelta !== 0) {
        return positionDelta;
      }

      if (b.minutesPlayed !== a.minutesPlayed) {
        return b.minutesPlayed - a.minutesPlayed;
      }

      return a.name.localeCompare(b.name);
    });

  const homePlayers = rows.filter((row) => row.team === fixture.home_team);
  const awayPlayers = rows.filter((row) => row.team === fixture.away_team);

  return (
    <div className="space-y-6">
      <Link
        href={`/portal/fixtures?gameweek=${fixture.gameweek}`}
        className="inline-flex items-center gap-2 rounded-full border border-brand-cream/35 bg-brand-dark px-4 py-2 text-sm font-semibold text-brand-cream transition-colors hover:bg-brand-greenDark"
      >
        Back to Fixtures
      </Link>

      <FixtureDetailClient
        gameweek={fixture.gameweek}
        kickoffLabel={formatKickoff(fixture.kickoff_at)}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        homePlayers={homePlayers}
        awayPlayers={awayPlayers}
        leagueRoster={leagueRoster}
      />
    </div>
  );
}
