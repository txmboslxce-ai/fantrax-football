import Link from "next/link";
import { getCurrentGameweek } from "@/lib/fantrax/sync-scores";
import { FIXTURES_SEASON } from "@/lib/season/fixtures";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type PageProps = {
  searchParams?:
    | { gameweek?: string | string[] }
    | Promise<{ gameweek?: string | string[] }>;
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

type LineupRow = {
  status: "predicted" | "confirmed";
  fetched_at: string;
  players: { id: string; name: string; team: string; position: string } | Array<{ id: string; name: string; team: string; position: string }> | null;
};

type LineupPlayer = {
  id: string;
  name: string;
  position: string;
};

type FixtureLineup = {
  fixture: FixtureRow;
  homeTeamLabel: string;
  awayTeamLabel: string;
  homePlayers: LineupPlayer[];
  awayPlayers: LineupPlayer[];
  status: "predicted" | "confirmed" | null;
  fetchedAt: string | null;
};

const POSITION_ORDER: Record<string, number> = { G: 0, D: 1, M: 2, F: 3 };

function parseRequestedGameweek(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sortByPosition(players: LineupPlayer[]): LineupPlayer[] {
  return [...players].sort((a, b) => (POSITION_ORDER[a.position] ?? 9) - (POSITION_ORDER[b.position] ?? 9));
}

export default async function LineupsPage({ searchParams }: PageProps) {
  const resolvedSearchParams =
    searchParams && typeof searchParams === "object" && "then" in searchParams ? await searchParams : searchParams;

  const supabase = await createServerSupabaseClient();
  const season = FIXTURES_SEASON;

  const { data: fixturesData, error: fixturesError } = await supabase
    .from("fixtures")
    .select("id, gameweek, home_team, away_team, kickoff_at")
    .eq("season", season)
    .order("gameweek");

  if (fixturesError) {
    throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
  }

  const fixtures = (fixturesData ?? []) as FixtureRow[];
  const gameweeks = Array.from(new Set(fixtures.map((fixture) => fixture.gameweek))).sort((a, b) => a - b);

  let currentGameweek = 1;
  try {
    currentGameweek = await getCurrentGameweek();
  } catch {
    // Keep the page useful if the live FPL schedule is temporarily unavailable.
  }

  const requestedGameweek = parseRequestedGameweek(resolvedSearchParams?.gameweek);
  const gameweek = requestedGameweek && gameweeks.includes(requestedGameweek) ? requestedGameweek : currentGameweek;

  const { data: teamsData, error: teamsError } = await supabase.from("teams").select("abbrev, full_name, name");
  if (teamsError) {
    throw new Error(`Unable to load teams: ${teamsError.message}`);
  }

  const teamLabelByAbbrev = new Map<string, string>();
  for (const team of (teamsData ?? []) as TeamRow[]) {
    teamLabelByAbbrev.set(team.abbrev, team.full_name || team.name || team.abbrev);
  }

  const { data: lineupData, error: lineupError } = await supabase
    .from("player_lineups")
    .select("status, fetched_at, is_starter, players!inner(id, name, team, position)")
    .eq("season", season)
    .eq("gameweek", gameweek)
    .eq("is_starter", true);

  if (lineupError) {
    throw new Error(`Unable to load lineups: ${lineupError.message}`);
  }

  const gameweekFixtures = fixtures.filter((fixture) => fixture.gameweek === gameweek);

  const fixturesByTeamPair = new Map<string, FixtureLineup>();
  for (const fixture of gameweekFixtures) {
    fixturesByTeamPair.set(`${fixture.home_team}-${fixture.away_team}`, {
      fixture,
      homeTeamLabel: teamLabelByAbbrev.get(fixture.home_team) ?? fixture.home_team,
      awayTeamLabel: teamLabelByAbbrev.get(fixture.away_team) ?? fixture.away_team,
      homePlayers: [],
      awayPlayers: [],
      status: null,
      fetchedAt: null,
    });
  }

  for (const row of (lineupData ?? []) as unknown as LineupRow[]) {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;
    if (!player) continue;

    for (const fixtureLineup of fixturesByTeamPair.values()) {
      const isHome = fixtureLineup.fixture.home_team === player.team;
      const isAway = fixtureLineup.fixture.away_team === player.team;
      if (!isHome && !isAway) continue;

      const lineupPlayer: LineupPlayer = { id: player.id, name: player.name, position: player.position };
      if (isHome) {
        fixtureLineup.homePlayers.push(lineupPlayer);
      } else {
        fixtureLineup.awayPlayers.push(lineupPlayer);
      }

      fixtureLineup.status = row.status;
      if (!fixtureLineup.fetchedAt || row.fetched_at > fixtureLineup.fetchedAt) {
        fixtureLineup.fetchedAt = row.fetched_at;
      }
    }
  }

  const fixtureLineups = Array.from(fixturesByTeamPair.values()).sort(
    (a, b) => new Date(a.fixture.kickoff_at ?? 0).getTime() - new Date(b.fixture.kickoff_at ?? 0).getTime()
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-brand-dark sm:text-4xl">Predicted Lineups</h1>
        <p className="mt-2 text-sm text-brand-dark/70">
          Starting XIs sourced from RotoWire — shown as &quot;Predicted&quot; until each club officially confirms, usually
          around an hour before kickoff.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {gameweeks.map((gw) => (
          <Link
            key={gw}
            href={`/portal/lineups?gameweek=${gw}`}
            className={`rounded border px-2 py-1 text-xs font-semibold ${
              gw === gameweek
                ? "border-brand-green bg-brand-green text-brand-cream"
                : "border-slate-300 bg-white text-brand-dark hover:bg-slate-50"
            }`}
          >
            GW{gw}
          </Link>
        ))}
      </div>

      {fixtureLineups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">
          No fixtures found for gameweek {gameweek}.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {fixtureLineups.map((fixtureLineup) => (
            <div key={fixtureLineup.fixture.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="font-bold text-brand-dark">
                  {fixtureLineup.homeTeamLabel} vs {fixtureLineup.awayTeamLabel}
                </p>
                {fixtureLineup.status ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      fixtureLineup.status === "confirmed" ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {fixtureLineup.status === "confirmed" ? "Confirmed" : "Predicted"}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                    Not yet available
                  </span>
                )}
              </div>

              {fixtureLineup.fixture.kickoff_at ? (
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(fixtureLineup.fixture.kickoff_at).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              ) : null}

              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {fixtureLineup.homeTeamLabel}
                  </p>
                  <ul className="space-y-0.5">
                    {sortByPosition(fixtureLineup.homePlayers).map((player) => (
                      <li key={player.id} className="text-brand-dark">
                        {player.name}
                      </li>
                    ))}
                    {fixtureLineup.homePlayers.length === 0 ? <li className="text-slate-400">-</li> : null}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {fixtureLineup.awayTeamLabel}
                  </p>
                  <ul className="space-y-0.5">
                    {sortByPosition(fixtureLineup.awayPlayers).map((player) => (
                      <li key={player.id} className="text-brand-dark">
                        {player.name}
                      </li>
                    ))}
                    {fixtureLineup.awayPlayers.length === 0 ? <li className="text-slate-400">-</li> : null}
                  </ul>
                </div>
              </div>

              {fixtureLineup.fetchedAt ? (
                <p className="mt-3 text-[11px] italic text-slate-400">
                  Last updated {new Date(fixtureLineup.fetchedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
