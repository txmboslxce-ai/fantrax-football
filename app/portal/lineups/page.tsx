import PredictedLineupPitch, {
  type PredictedInjuryPlayer,
  type PredictedLineupPlayer,
} from "@/components/portal/PredictedLineupPitch";
import { FIXTURES_SEASON } from "@/lib/season/fixtures";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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

type FplAvailability = {
  chance_of_playing_next_round: number | null;
  status: string | null;
  news: string | null;
};

type LineupRow = {
  status: "predicted" | "confirmed";
  fetched_at: string;
  position: string | null;
  is_starter: boolean;
  injury_status: string | null;
  rotowire_display_name: string | null;
  players:
    | { id: string; name: string; team: string; fpl_player_data: FplAvailability | FplAvailability[] | null }
    | Array<{ id: string; name: string; team: string; fpl_player_data: FplAvailability | FplAvailability[] | null }>
    | null;
};

type FixtureLineup = {
  fixture: FixtureRow;
  homeTeamLabel: string;
  awayTeamLabel: string;
  homePlayers: PredictedLineupPlayer[];
  awayPlayers: PredictedLineupPlayer[];
  homeInjuries: PredictedInjuryPlayer[];
  awayInjuries: PredictedInjuryPlayer[];
  status: "predicted" | "confirmed" | null;
  fetchedAt: string | null;
};

export default async function LineupsPage() {
  const supabase = await createServerSupabaseClient();
  const season = FIXTURES_SEASON;

  // No manual gameweek picker -- always the gameweek containing the
  // soonest fixture that hasn't kicked off yet. This deliberately isn't
  // lib/fantrax/sync-scores's getCurrentGameweek(): that one tracks FPL's
  // own "currently being played" gameweek, which stays on the *previous*
  // gameweek from the moment its last match finishes until the next one's
  // first match actually kicks off (FPL doesn't flip is_current early) --
  // exactly the multi-day window RotoWire's predicted lineups exist for.
  // Since this is computed fresh on every page load, it moves on to the
  // next gameweek by itself once every fixture in the current one has
  // kicked off, with no extra plumbing needed on the sync side.
  const { data: nextFixtureData, error: nextFixtureError } = await supabase
    .from("fixtures")
    .select("gameweek")
    .eq("season", season)
    .gt("kickoff_at", new Date().toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(1);

  if (nextFixtureError) {
    throw new Error(`Unable to resolve the upcoming gameweek: ${nextFixtureError.message}`);
  }

  let gameweek = nextFixtureData?.[0]?.gameweek as number | undefined;

  if (gameweek == null) {
    // Nothing left to kick off -- the season's over. Show the last
    // gameweek rather than resetting to GW1.
    const { data: lastFixtureData } = await supabase
      .from("fixtures")
      .select("gameweek")
      .eq("season", season)
      .order("gameweek", { ascending: false })
      .limit(1);
    gameweek = lastFixtureData?.[0]?.gameweek ?? 1;
  }

  const { data: fixturesData, error: fixturesError } = await supabase
    .from("fixtures")
    .select("id, gameweek, home_team, away_team, kickoff_at")
    .eq("season", season)
    .eq("gameweek", gameweek);

  if (fixturesError) {
    throw new Error(`Unable to load fixtures: ${fixturesError.message}`);
  }

  const gameweekFixtures = (fixturesData ?? []) as FixtureRow[];

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
    .select(
      "status, fetched_at, position, is_starter, injury_status, rotowire_display_name, players!inner(id, name, team, fpl_player_data(chance_of_playing_next_round, status, news))"
    )
    .eq("season", season)
    .eq("gameweek", gameweek);

  if (lineupError) {
    throw new Error(`Unable to load lineups: ${lineupError.message}`);
  }

  const fixturesByTeamPair = new Map<string, FixtureLineup>();
  for (const fixture of gameweekFixtures) {
    fixturesByTeamPair.set(`${fixture.home_team}-${fixture.away_team}`, {
      fixture,
      homeTeamLabel: teamLabelByAbbrev.get(fixture.home_team) ?? fixture.home_team,
      awayTeamLabel: teamLabelByAbbrev.get(fixture.away_team) ?? fixture.away_team,
      homePlayers: [],
      awayPlayers: [],
      homeInjuries: [],
      awayInjuries: [],
      status: null,
      fetchedAt: null,
    });
  }

  for (const row of (lineupData ?? []) as unknown as LineupRow[]) {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;
    if (!player) continue;

    const availability = Array.isArray(player.fpl_player_data) ? player.fpl_player_data[0] : player.fpl_player_data;

    for (const fixtureLineup of fixturesByTeamPair.values()) {
      const isHome = fixtureLineup.fixture.home_team === player.team;
      const isAway = fixtureLineup.fixture.away_team === player.team;
      if (!isHome && !isAway) continue;

      if (row.is_starter) {
        const lineupPlayer: PredictedLineupPlayer = {
          id: player.id,
          name: player.name,
          rotowireName: row.rotowire_display_name ?? player.name,
          position: row.position,
          chanceOfPlaying: availability?.chance_of_playing_next_round ?? null,
          availabilityStatus: availability?.status ?? null,
          availabilityNews: availability?.news ?? null,
        };
        (isHome ? fixtureLineup.homePlayers : fixtureLineup.awayPlayers).push(lineupPlayer);
      } else if (row.injury_status) {
        const injuryPlayer: PredictedInjuryPlayer = {
          id: player.id,
          name: player.name,
          rotowireName: row.rotowire_display_name ?? player.name,
          status: row.injury_status,
        };
        (isHome ? fixtureLineup.homeInjuries : fixtureLineup.awayInjuries).push(injuryPlayer);
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
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Gameweek {gameweek}</p>
        <p className="mt-2 text-sm text-brand-dark/70">Predicted line ups as per RotoWire.</p>
      </div>

      {fixtureLineups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">
          No fixtures found for gameweek {gameweek}.
        </div>
      ) : (
        <div className="grid gap-4">
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

              <div className="mt-3">
                <PredictedLineupPitch
                  home={{ teamLabel: fixtureLineup.homeTeamLabel, players: fixtureLineup.homePlayers, injuries: fixtureLineup.homeInjuries }}
                  away={{ teamLabel: fixtureLineup.awayTeamLabel, players: fixtureLineup.awayPlayers, injuries: fixtureLineup.awayInjuries }}
                />
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
