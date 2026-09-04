import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMatchWinProbabilities, type MatchWinProbabilities } from "@/lib/bsd/odds";
import { fetchMatchExpectedGoals, type MatchExpectedGoals } from "@/lib/bsd/predictions";
import { findBsdEventId } from "@/lib/bsd/events";
import { calcGoalsAgainstPts, calcKeeperPts, calcOutfielderPts } from "@/lib/csv/transform";
import { computePlayerShotProfiles, type PlayerShotProfile } from "@/lib/projections/playerShotProfile";
import { computeTeamStrengthRatings, type TeamStatKey, type TeamStrengthProfile } from "@/lib/projections/teamStrength";
import { FIXTURES_SEASON, PRIOR_SEASON } from "@/lib/season/fixtures";

export type ProjectedStatLine = {
  goals: number;
  assists: number;
  // Expected value (0-1), not a realized 0/1 -- calcOutfielderPts/
  // calcKeeperPts just multiply this by a fixed weight, so a probability
  // plugs in as the correct expected-points contribution with no changes
  // to those functions needed.
  clean_sheet: number;
  key_passes: number;
  shots_on_target: number;
  tackles_won: number;
  interceptions: number;
  clearances: number;
  dribbles_succeeded: number;
  blocked_shots: number;
  accurate_crosses: number;
  penalties_drawn: number;
  aerials_won: number;
  dispossessed: number;
  yellow_cards: number;
  red_cards: number;
  penalties_missed: number;
  own_goals: number;
  saves: number;
  penalty_saves: number;
  high_claims: number;
  smothers: number;
  // Expected goals this player's own team concedes in this fixture (a
  // Poisson mean, not a projected input to the scoring formula directly --
  // see expectedGoalsAgainstPenalty below for why).
  expected_goals_against_team: number;
};

export type PlayerProjection = {
  fantraxId: string;
  playerName: string;
  team: string;
  position: "G" | "D" | "M" | "F";
  fixtureId: string;
  opponentAbbrev: string;
  isHome: boolean;
  expectedMinutes: number;
  statLine: ProjectedStatLine;
  projectedScore: number;
  // Same projection, but assuming this player starts and plays their usual
  // minutes regardless of what RotoWire currently predicts -- identical to
  // projectedScore for an actual predicted starter (or when no lineup
  // prediction exists yet), and shows the upside case for a rotation risk.
  // Not computed at all (left equal to projectedScore, both 0) for a player
  // FPL has flagged as out -- there's no "if starting" for someone injured
  // or suspended.
  projectedScoreIfStarting: number;
  // null = no RotoWire lineup prediction for this player's team yet (falls
  // back to their usual expected minutes, same as before this existed).
  isPredictedStarter: boolean | null;
  // Raw FPL status code ('a'/'d'/'i'/'s'/'u'), or null if never synced.
  injuryStatus: string | null;
};

type PlayerRow = { id: string; name: string; team: string; position: "G" | "D" | "M" | "F" };
type FixtureRow = { id: string; home_team: string; away_team: string; kickoff_at: string | null };
type FplStatusRow = { player_id: string; status: string | null };
type PlayerLineupRow = { player_id: string; is_starter: boolean };
type BsdMatchData = { expectedGoals: MatchExpectedGoals | null; winProbabilities: MatchWinProbabilities | null };

// FPL status codes that mean "will not play this week" -- see
// lib/portal/injuryStatus.ts for the same codes used on the injury page.
// 'd' (doubtful) deliberately isn't included here: a doubtful player might
// still play, so zeroing them out would just trade one wrong extreme for
// another -- chance_of_playing_next_round would be the right signal to
// incorporate for that case, not a hard cutoff, and isn't wired in yet.
const OUT_STATUS_CODES = new Set(["i", "s", "u"]);

// Fallback for a player RotoWire predicts to the bench who has no sub
// appearances of their own to go on yet (see subAvgMinutes below, which is
// preferred whenever it exists) -- caps their blended season average at a
// typical substitute cameo rather than handing them a start-sized expected
// minutes figure. This is deliberately a flat number, not derived from
// data, because the actual signal we have -- "not in the predicted XI" --
// doesn't itself say how long a run out they'd get; a starting value to
// revisit once there's enough of a season to check real bench-minute
// patterns against it.
const BENCH_FALLBACK_MINUTES = 20;

type HistoryTotals = {
  gamesPlayed: number;
  minutes: number;
  // Split out from gamesPlayed/minutes so expected minutes can reflect
  // "what they get when they start" separately from "what they get as a
  // sub" -- see fullExpectedMinutes/subAvgMinutes below. A blended average
  // across both understates a confirmed starter's real minutes if any of
  // their appearances were substitute cameos, and overstates a bench
  // player's if any were starts.
  gamesStarted: number;
  minutesWhenStarted: number;
  goals: number;
  assists: number;
  keyPasses: number;
  shotsOnTarget: number;
  tacklesWon: number;
  interceptions: number;
  clearances: number;
  dribblesSucceeded: number;
  blockedShots: number;
  accurateCrosses: number;
  penaltiesDrawn: number;
  penaltiesMissed: number;
  aerialsWon: number;
  dispossessed: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  saves: number;
  penaltySaves: number;
  highClaims: number;
  smothers: number;
  goalsAgainst: number;
  goalsAgainstOutfield: number;
};

type PlayerGameweekRow = {
  player_id: string;
  games_played: number | null;
  games_started: number | null;
  minutes_played: number | null;
  goals: number | null;
  assists: number | null;
  key_passes: number | null;
  shots_on_target: number | null;
  tackles_won: number | null;
  interceptions: number | null;
  clearances: number | null;
  dribbles_succeeded: number | null;
  blocked_shots: number | null;
  accurate_crosses: number | null;
  penalties_drawn: number | null;
  penalties_missed: number | null;
  aerials_won: number | null;
  dispossessed: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  own_goals: number | null;
  saves: number | null;
  penalty_saves: number | null;
  high_claims: number | null;
  smothers: number | null;
  goals_against: number | null;
  goals_against_outfield: number | null;
};

function zeroHistory(): HistoryTotals {
  return {
    gamesPlayed: 0,
    minutes: 0,
    gamesStarted: 0,
    minutesWhenStarted: 0,
    goals: 0,
    assists: 0,
    keyPasses: 0,
    shotsOnTarget: 0,
    tacklesWon: 0,
    interceptions: 0,
    clearances: 0,
    dribblesSucceeded: 0,
    blockedShots: 0,
    accurateCrosses: 0,
    penaltiesDrawn: 0,
    penaltiesMissed: 0,
    aerialsWon: 0,
    dispossessed: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    saves: 0,
    penaltySaves: 0,
    highClaims: 0,
    smothers: 0,
    goalsAgainst: 0,
    goalsAgainstOutfield: 0,
  };
}

function num(value: number | null): number {
  return value ?? 0;
}

function accumulateHistory(rows: PlayerGameweekRow[]): Map<string, HistoryTotals> {
  const byPlayer = new Map<string, HistoryTotals>();
  for (const row of rows) {
    if (num(row.games_played) <= 0) continue;

    let totals = byPlayer.get(row.player_id);
    if (!totals) {
      totals = zeroHistory();
      byPlayer.set(row.player_id, totals);
    }

    totals.gamesPlayed += 1;
    totals.minutes += num(row.minutes_played);
    if (num(row.games_started) > 0) {
      totals.gamesStarted += 1;
      totals.minutesWhenStarted += num(row.minutes_played);
    }
    totals.goals += num(row.goals);
    totals.assists += num(row.assists);
    totals.keyPasses += num(row.key_passes);
    totals.shotsOnTarget += num(row.shots_on_target);
    totals.tacklesWon += num(row.tackles_won);
    totals.interceptions += num(row.interceptions);
    totals.clearances += num(row.clearances);
    totals.dribblesSucceeded += num(row.dribbles_succeeded);
    totals.blockedShots += num(row.blocked_shots);
    totals.accurateCrosses += num(row.accurate_crosses);
    totals.penaltiesDrawn += num(row.penalties_drawn);
    totals.penaltiesMissed += num(row.penalties_missed);
    totals.aerialsWon += num(row.aerials_won);
    totals.dispossessed += num(row.dispossessed);
    totals.yellowCards += num(row.yellow_cards);
    totals.redCards += num(row.red_cards);
    totals.ownGoals += num(row.own_goals);
    totals.saves += num(row.saves);
    totals.penaltySaves += num(row.penalty_saves);
    totals.highClaims += num(row.high_claims);
    totals.smothers += num(row.smothers);
    totals.goalsAgainst += num(row.goals_against);
    totals.goalsAgainstOutfield += num(row.goals_against_outfield);
  }
  return byPlayer;
}

// A handful of the ~20 scoring categories get a defensible opponent
// adjustment from team_match_stats (see the opponentFactor(...) calls
// below: shots on target, key passes via big chances conceded, crosses via
// box touches conceded, assists via expected goals conceded); the rest
// (dribbles, aerials, dispossessed, cards, penalties) are small/rare-event
// stats where a team-level BSD signal would be noise dressed up as
// precision, so they're projected from the player's own history only
// (no factor applied). Documented here rather than silently applied so the
// gap is visible, not hidden.

function poissonPmf(k: number, lambda: number): number {
  let logPmf = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logPmf -= Math.log(i);
  return Math.exp(logPmf);
}

// E[calcGoalsAgainstPts(goals conceded)] under a Poisson(lambda) model,
// computed by summing over the actual outcome distribution rather than
// plugging the mean into the (nonlinear -- no penalty for 0 or 1, then -2
// per goal beyond that) formula directly. The two aren't the same number:
// naively substituting the mean understates the true expected penalty,
// since bad blowout-loss scenarios contribute a disproportionate share of
// it. Truncated at 12 goals; the Poisson tail beyond that is negligible
// for any realistic single-match lambda.
function expectedGoalsAgainstPenalty(lambda: number): number {
  let expected = 0;
  for (let goals = 0; goals <= 12; goals++) {
    expected += poissonPmf(goals, lambda) * calcGoalsAgainstPts(goals);
  }
  return expected;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// One BSD event lookup + one prediction fetch + one odds fetch per fixture
// (not per team-side -- both sides of the same match share one answer).
// Fixtures with no kickoff_at, no resolvable BSD event, or no active
// prediction/odds market for either endpoint just get a null entry, which
// every caller below already treats as "fall back to the stats-only
// signal" -- this feature is additive, never a hard requirement.
async function resolveBsdMatchData(fixtures: FixtureRow[]): Promise<Map<string, BsdMatchData>> {
  const byFixtureId = new Map<string, BsdMatchData>();

  await Promise.all(
    fixtures.map(async (fixture) => {
      if (!fixture.kickoff_at) return;

      let eventId: number | null;
      try {
        eventId = await findBsdEventId({ homeAbbrev: fixture.home_team, awayAbbrev: fixture.away_team, kickoffAt: fixture.kickoff_at });
      } catch {
        eventId = null;
      }
      if (!eventId) return;

      const [expectedGoals, winProbabilities] = await Promise.all([fetchMatchExpectedGoals(eventId), fetchMatchWinProbabilities(eventId)]);
      byFixtureId.set(fixture.id, { expectedGoals, winProbabilities });
    })
  );

  return byFixtureId;
}

export async function computeGameweekProjections(supabase: SupabaseClient, gameweek: number): Promise<PlayerProjection[]> {
  const { data: fixtureRows, error: fixtureError } = await supabase
    .from("fixtures")
    .select("id, home_team, away_team, kickoff_at")
    .eq("season", FIXTURES_SEASON)
    .eq("gameweek", gameweek);

  if (fixtureError) {
    throw new Error(`Unable to load fixtures: ${fixtureError.message}`);
  }

  const fixtures = (fixtureRows ?? []) as FixtureRow[];
  if (fixtures.length === 0) {
    return [];
  }

  const teamAbbrevs = Array.from(new Set(fixtures.flatMap((fixture) => [fixture.home_team, fixture.away_team])));

  const [
    { profiles: teamStrength, leagueAvgPerMatch },
    { profiles: shotProfiles },
    bsdMatchDataByFixtureId,
    { data: playerRows, error: playerError },
    { data: fplStatusRows, error: fplStatusError },
    { data: lineupRows, error: lineupError },
  ] = await Promise.all([
    computeTeamStrengthRatings(supabase),
    computePlayerShotProfiles(supabase),
    resolveBsdMatchData(fixtures),
    supabase.from("players").select("id, name, team, position").in("team", teamAbbrevs),
    // Small table (one row per FPL-tracked player league-wide) -- fetched
    // whole rather than filtered by player_id for the same URL-length
    // reason as player_gameweeks below.
    supabase.from("fpl_player_data").select("player_id, status"),
    // RotoWire only ever writes a row for a predicted starter or an
    // injury-flagged player (see comment below on teamsWithKnownLineup) --
    // there's no "confirmed bench" row to distinguish from "no prediction
    // yet", so this is read as booleans purely on row presence.
    supabase.from("player_lineups").select("player_id, is_starter").eq("season", FIXTURES_SEASON).eq("gameweek", gameweek).eq("is_starter", true),
  ]);

  if (playerError) {
    throw new Error(`Unable to load players: ${playerError.message}`);
  }
  if (fplStatusError) {
    throw new Error(`Unable to load fpl_player_data: ${fplStatusError.message}`);
  }
  if (lineupError) {
    throw new Error(`Unable to load player_lineups: ${lineupError.message}`);
  }

  const players = (playerRows ?? []) as PlayerRow[];
  const playerById = new Map(players.map((player) => [player.id, player]));

  const statusByPlayerId = new Map<string, string | null>();
  for (const row of (fplStatusRows ?? []) as FplStatusRow[]) {
    statusByPlayerId.set(row.player_id, row.status);
  }

  const startersByPlayerId = new Set<string>();
  // A team having ANY predicted starter row for this gameweek is the only
  // way to tell "RotoWire has a lineup for this match" apart from "no
  // prediction posted yet" -- a plain bench player never gets a row either
  // way, so their absence alone is ambiguous without this.
  const teamsWithKnownLineup = new Set<string>();
  for (const row of (lineupRows ?? []) as PlayerLineupRow[]) {
    startersByPlayerId.add(row.player_id);
    const team = playerById.get(row.player_id)?.team;
    if (team) teamsWithKnownLineup.add(team);
  }

  // A full gameweek round involves every team, so `players` here is
  // basically the whole league's squad list (500+ players) -- filtering
  // player_gameweeks by an .in("player_id", ...) list that long builds a
  // GET request whose query string blows past a URL length limit
  // somewhere in the stack (confirmed live: a plain "Bad Request" with no
  // more specific error). Fetching by season/gameweek range alone and
  // keeping only the players we need in memory avoids that entirely --
  // even a full season's worth of rows across the whole league is a few
  // thousand, trivial for a single query.
  const PLAYER_GAMEWEEK_COLUMNS =
    "player_id, games_played, games_started, minutes_played, goals, assists, key_passes, shots_on_target, tackles_won, interceptions, clearances, dribbles_succeeded, blocked_shots, accurate_crosses, penalties_drawn, penalties_missed, aerials_won, dispossessed, yellow_cards, red_cards, own_goals, saves, penalty_saves, high_claims, smothers, goals_against, goals_against_outfield";

  const [{ data: pgRows, error: pgError }, { data: priorSeasonRows, error: priorSeasonError }] = await Promise.all([
    supabase.from("player_gameweeks").select(PLAYER_GAMEWEEK_COLUMNS).eq("season", FIXTURES_SEASON).lt("gameweek", gameweek).limit(50000),
    // Last season's rows for the same player -- used below as a personalized
    // prior (their own established per-90 rate) in place of a generic
    // position average, for whoever has one. Not filtered by player_id for
    // the same URL-length reason as above.
    supabase.from("player_gameweeks").select(PLAYER_GAMEWEEK_COLUMNS).eq("season", PRIOR_SEASON).limit(50000),
  ]);

  if (pgError) {
    throw new Error(`Unable to load player_gameweeks: ${pgError.message}`);
  }
  if (priorSeasonError) {
    throw new Error(`Unable to load prior-season player_gameweeks: ${priorSeasonError.message}`);
  }

  const historyByPlayer = accumulateHistory((pgRows ?? []) as PlayerGameweekRow[]);
  const priorSeasonByPlayer = accumulateHistory((priorSeasonRows ?? []) as PlayerGameweekRow[]);

  const shotProfileByFantraxId = new Map<string, PlayerShotProfile>();
  for (const profile of shotProfiles) {
    shotProfileByFantraxId.set(profile.fantraxId, profile);
  }

  // Team strength ratings and the shot-profile finishing factor both use
  // empirical-Bayes shrinkage (PRIOR_GAMES/PRIOR_XG) because a couple of
  // games of history isn't enough sample to trust at face value. The
  // remaining per-player counting stats below need the same treatment: with
  // only 1-2 gameweeks of history this early in the season, a single busy
  // match (a fluky high clearance or key-pass count) gets extrapolated at
  // full weight into every future projection, and since ~15 of these
  // categories sum into one player's score simultaneously, that noise
  // compounds into exactly the kind of standout-player blowup a naive
  // stat-line model would produce -- the opposite of the edge this is
  // supposed to provide. Shrinking each player's per-90 rate toward a prior
  // mean, weighted by PRIOR_MINUTES of assumed average performance, tempers
  // that without waiting for a full season to accumulate. That prior mean is
  // the player's own rate from last season (PRIOR_SEASON) when they have
  // one -- a far more informative starting point than a generic position
  // average, and it fades out on its own as this season's minutes overtake
  // PRIOR_MINUTES -- falling back to the position's league-average per-90
  // only for players with no prior-season row (promoted-team signings,
  // players new to the league). A starting value (five matches' worth) to
  // revisit once there's more of a season to check calibration against.
  const PRIOR_MINUTES = 450;

  // A per-90 rate computed from a tiny minutes sample is extreme by
  // construction, independent of anything else going on: one clearance in
  // a 2-minute cameo is a real event, but "clearances per 90" from it is
  // nonsense, and PRIOR_MINUTES-weighting doesn't fix that -- it only
  // controls how much the prior counts for once computed, not how extreme
  // the prior's own rate can be beforehand. Confirmed live: exactly this,
  // from a PRIOR_SEASON row with only a couple of minutes attached, is what
  // blew a defender's projected goal rate into the double digits (see the
  // identical guard in playerShotProfile.ts, which hit the same bug on the
  // BSD-shot-derived rates). Below this many minutes, a sample isn't
  // trusted as a per-90 rate at all.
  const MIN_SAMPLE_MINUTES = 90;

  const STAT_KEYS = [
    "goals",
    "assists",
    "keyPasses",
    "shotsOnTarget",
    "tacklesWon",
    "interceptions",
    "clearances",
    "dribblesSucceeded",
    "blockedShots",
    "accurateCrosses",
    "penaltiesDrawn",
    "penaltiesMissed",
    "aerialsWon",
    "dispossessed",
    "yellowCards",
    "redCards",
    "ownGoals",
    "saves",
    "penaltySaves",
    "highClaims",
    "smothers",
  ] as const satisfies ReadonlyArray<keyof HistoryTotals>;

  const positionMinutes: Record<string, number> = { G: 0, D: 0, M: 0, F: 0 };
  const positionStatTotals: Record<string, Record<string, number>> = {
    G: {},
    D: {},
    M: {},
    F: {},
  };
  for (const position of ["G", "D", "M", "F"]) {
    for (const key of STAT_KEYS) positionStatTotals[position][key] = 0;
  }

  for (const player of players) {
    const history = historyByPlayer.get(player.id);
    if (!history || history.minutes === 0) continue;
    positionMinutes[player.position] += history.minutes;
    for (const key of STAT_KEYS) {
      positionStatTotals[player.position][key] += history[key];
    }
  }

  function positionAvgPer90(position: string, key: (typeof STAT_KEYS)[number]): number {
    const minutes = positionMinutes[position];
    return minutes > 0 ? (positionStatTotals[position][key] / minutes) * 90 : 0;
  }

  function shrunkPer90(history: HistoryTotals, key: (typeof STAT_KEYS)[number], position: string, priorSeason: HistoryTotals | undefined): number {
    const priorMean =
      priorSeason && priorSeason.minutes >= MIN_SAMPLE_MINUTES
        ? (priorSeason[key] * 90) / priorSeason.minutes
        : positionAvgPer90(position, key);
    return (history[key] * 90 + PRIOR_MINUTES * priorMean) / (history.minutes + PRIOR_MINUTES);
  }

  function opponentFactor(team: TeamStrengthProfile | undefined, key: TeamStatKey): number {
    return team?.concededFactor[key] ?? 1;
  }
  function attackFactor(team: TeamStrengthProfile | undefined, key: TeamStatKey): number {
    return team?.createdFactor[key] ?? 1;
  }

  // How lopsided a match is expected to be, from BSD's consensus odds (see
  // lib/bsd/odds.ts for why odds rather than a re-derived expected-goals
  // number). Multiplies only the attacking-output categories below (goals,
  // assists, shots on target, key passes, crosses) -- a team that's a big
  // favourite plausibly sees more of the ball and creates proportionally
  // more chances, but the equivalent relationship for defensive volume
  // (tackles, clearances, interceptions) is likely non-monotonic -- a team
  // defending a lead sees a spell of pressure, then a stretch of game
  // management -- and isn't calibrated here, so it's deliberately left
  // alone. 1 = evenly matched (no adjustment); >1 = this team is the
  // favourite; <1 = this team is the underdog. Clamped so a near-certain
  // scoreline doesn't produce an unbounded multiplier from what's ultimately
  // a rough proxy, not a fitted model.
  const GAME_SCRIPT_SENSITIVITY = 0.3;
  const GAME_SCRIPT_MIN = 0.7;
  const GAME_SCRIPT_MAX = 1.3;

  function gameScriptFactor(winProbabilities: MatchWinProbabilities | null | undefined, isHome: boolean): number {
    if (!winProbabilities) return 1;
    const ownWinProb = isHome ? winProbabilities.home : winProbabilities.away;
    const oppWinProb = isHome ? winProbabilities.away : winProbabilities.home;
    const favouriteMargin = ownWinProb - oppWinProb;
    const factor = 1 + GAME_SCRIPT_SENSITIVITY * favouriteMargin;
    return Math.min(GAME_SCRIPT_MAX, Math.max(GAME_SCRIPT_MIN, factor));
  }

  const projections: PlayerProjection[] = [];

  for (const fixture of fixtures) {
    const bsdMatchData = bsdMatchDataByFixtureId.get(fixture.id);

    for (const [teamAbbrev, opponentAbbrev, isHome] of [
      [fixture.home_team, fixture.away_team, true],
      [fixture.away_team, fixture.home_team, false],
    ] as const) {
      const ownTeamStrength = teamStrength.get(teamAbbrev);
      const opponentStrength = teamStrength.get(opponentAbbrev);

      const statsExpectedGoalsAgainst =
        leagueAvgPerMatch.expected_goals * opponentFactor(ownTeamStrength, "expected_goals") * attackFactor(opponentStrength, "expected_goals");

      // Blend in BSD's own predicted expected goals for this match, weighted
      // by its own reported confidence (see lib/bsd/predictions.ts) --
      // that's one AI model's read on this specific match, ours is a
      // shrinkage-based read of both teams' season-long tendencies, and
      // neither should fully override the other.
      let expectedGoalsAgainstTeam = statsExpectedGoalsAgainst;
      if (bsdMatchData?.expectedGoals) {
        const bsdExpectedGoalsAgainst = isHome ? bsdMatchData.expectedGoals.away : bsdMatchData.expectedGoals.home;
        const confidence = bsdMatchData.expectedGoals.confidence;
        expectedGoalsAgainstTeam = confidence * bsdExpectedGoalsAgainst + (1 - confidence) * statsExpectedGoalsAgainst;
      }

      const cleanSheetProbability = Math.exp(-expectedGoalsAgainstTeam);
      const goalsAgainstPenalty = expectedGoalsAgainstPenalty(expectedGoalsAgainstTeam);
      const scriptFactor = gameScriptFactor(bsdMatchData?.winProbabilities, isHome);

      for (const player of players.filter((p) => p.team === teamAbbrev)) {
        const injuryStatus = statusByPlayerId.get(player.id) ?? null;

        // FPL says this player won't feature at all -- no history lookup,
        // no minutes, no score, but still emitted (rather than skipped
        // entirely) so the output says *why* a rostered player reads 0
        // instead of just going quiet on them.
        if (injuryStatus && OUT_STATUS_CODES.has(injuryStatus)) {
          const zeroStatLine: ProjectedStatLine = {
            goals: 0,
            assists: 0,
            clean_sheet: round(cleanSheetProbability),
            key_passes: 0,
            shots_on_target: 0,
            tackles_won: 0,
            interceptions: 0,
            clearances: 0,
            dribbles_succeeded: 0,
            blocked_shots: 0,
            accurate_crosses: 0,
            penalties_drawn: 0,
            aerials_won: 0,
            dispossessed: 0,
            yellow_cards: 0,
            red_cards: 0,
            penalties_missed: 0,
            own_goals: 0,
            saves: 0,
            penalty_saves: 0,
            high_claims: 0,
            smothers: 0,
            expected_goals_against_team: round(expectedGoalsAgainstTeam),
          };
          projections.push({
            fantraxId: player.id,
            playerName: player.name,
            team: player.team,
            position: player.position,
            fixtureId: fixture.id,
            opponentAbbrev,
            isHome,
            expectedMinutes: 0,
            statLine: zeroStatLine,
            projectedScore: 0,
            projectedScoreIfStarting: 0,
            isPredictedStarter: false,
            injuryStatus,
          });
          continue;
        }

        const history = historyByPlayer.get(player.id);
        if (!history || history.gamesPlayed === 0 || history.minutes === 0) continue;
        const priorSeason = priorSeasonByPlayer.get(player.id);

        function buildStatLineAndScore(expectedMinutesForCalc: number): { statLine: ProjectedStatLine; projectedScore: number } {
          const minutesScale = expectedMinutesForCalc / 90;

          const shotProfile = shotProfileByFantraxId.get(player.id);
          const goalsRatePer90 = shotProfile
            ? shotProfile.projectedGoalRatePer90
            : shrunkPer90(history!, "goals", player.position, priorSeason);
          const shotsOnTargetRatePer90 = shotProfile
            ? shotProfile.shotsOnTargetPer90
            : shrunkPer90(history!, "shotsOnTarget", player.position, priorSeason);

          // scriptFactor (how big a favourite/underdog this team is, from
          // consensus odds -- see gameScriptFactor above) scales these five
          // attacking categories alongside the existing opponent-strength
          // factor: more expected territory and service for a favourite,
          // less for an underdog.
          const projectedGoals = goalsRatePer90 * opponentFactor(opponentStrength, "expected_goals") * scriptFactor * minutesScale;
          const projectedShotsOnTarget =
            shotsOnTargetRatePer90 * opponentFactor(opponentStrength, "shots_on_target") * scriptFactor * minutesScale;
          const projectedKeyPasses =
            shrunkPer90(history!, "keyPasses", player.position, priorSeason) *
            opponentFactor(opponentStrength, "big_chances") *
            scriptFactor *
            minutesScale;
          const projectedCrosses =
            shrunkPer90(history!, "accurateCrosses", player.position, priorSeason) *
            opponentFactor(opponentStrength, "touches_in_penalty_area") *
            scriptFactor *
            minutesScale;
          const projectedAssists =
            shrunkPer90(history!, "assists", player.position, priorSeason) *
            opponentFactor(opponentStrength, "expected_goals") *
            scriptFactor *
            minutesScale;

          // No defensible opponent signal for these (see OPPONENT_FACTOR_KEY
          // comment) -- projected from the player's own rate, shrunk toward
          // their prior-season rate (or position average -- see PRIOR_MINUTES
          // above).
          const projectedTacklesWon = shrunkPer90(history!, "tacklesWon", player.position, priorSeason) * minutesScale;
          const projectedInterceptions = shrunkPer90(history!, "interceptions", player.position, priorSeason) * minutesScale;
          const projectedClearances = shrunkPer90(history!, "clearances", player.position, priorSeason) * minutesScale;
          const projectedDribbles = shrunkPer90(history!, "dribblesSucceeded", player.position, priorSeason) * minutesScale;
          const projectedBlockedShots = shrunkPer90(history!, "blockedShots", player.position, priorSeason) * minutesScale;
          const projectedPenaltiesDrawn = shrunkPer90(history!, "penaltiesDrawn", player.position, priorSeason) * minutesScale;
          const projectedPenaltiesMissed = shrunkPer90(history!, "penaltiesMissed", player.position, priorSeason) * minutesScale;
          const projectedAerials = shrunkPer90(history!, "aerialsWon", player.position, priorSeason) * minutesScale;
          const projectedDispossessed = shrunkPer90(history!, "dispossessed", player.position, priorSeason) * minutesScale;
          const projectedYellows = shrunkPer90(history!, "yellowCards", player.position, priorSeason) * minutesScale;
          const projectedReds = shrunkPer90(history!, "redCards", player.position, priorSeason) * minutesScale;
          const projectedOwnGoals = shrunkPer90(history!, "ownGoals", player.position, priorSeason) * minutesScale;

          // Shots faced (and so saves) scale with how much the opponent
          // attacks; goals_against/goals_against_outfield use the same
          // Poisson expectation computed once per team above.
          const projectedSaves =
            shrunkPer90(history!, "saves", player.position, priorSeason) *
            attackFactor(opponentStrength, "shots_on_target") *
            minutesScale;
          const projectedPenaltySaves = shrunkPer90(history!, "penaltySaves", player.position, priorSeason) * minutesScale;
          const projectedHighClaims = shrunkPer90(history!, "highClaims", player.position, priorSeason) * minutesScale;
          const projectedSmothers = shrunkPer90(history!, "smothers", player.position, priorSeason) * minutesScale;

          const statLine: ProjectedStatLine = {
            goals: round(projectedGoals),
            assists: round(projectedAssists),
            clean_sheet: round(cleanSheetProbability),
            key_passes: round(projectedKeyPasses),
            shots_on_target: round(projectedShotsOnTarget),
            tackles_won: round(projectedTacklesWon),
            interceptions: round(projectedInterceptions),
            clearances: round(projectedClearances),
            dribbles_succeeded: round(projectedDribbles),
            blocked_shots: round(projectedBlockedShots),
            accurate_crosses: round(projectedCrosses),
            penalties_drawn: round(projectedPenaltiesDrawn),
            aerials_won: round(projectedAerials),
            dispossessed: round(projectedDispossessed),
            yellow_cards: round(projectedYellows),
            red_cards: round(projectedReds),
            penalties_missed: round(projectedPenaltiesMissed),
            own_goals: round(projectedOwnGoals),
            saves: round(projectedSaves),
            penalty_saves: round(projectedPenaltySaves),
            high_claims: round(projectedHighClaims),
            smothers: round(projectedSmothers),
            expected_goals_against_team: round(expectedGoalsAgainstTeam),
          };

          // goals_against/goals_against_outfield are deliberately passed as 0
          // here -- calcGoalsAgainstPts(0) is 0, so this cleanly removes that
          // one component from the formula's own (mean-based) calculation,
          // and the properly Poisson-averaged value is added back afterward.
          const formulaRow = {
            position: player.position,
            goals: statLine.goals,
            assists: statLine.assists,
            clean_sheet: statLine.clean_sheet,
            key_passes: statLine.key_passes,
            shots_on_target: statLine.shots_on_target,
            tackles_won: statLine.tackles_won,
            interceptions: statLine.interceptions,
            clearances: statLine.clearances,
            dribbles_succeeded: statLine.dribbles_succeeded,
            blocked_shots: statLine.blocked_shots,
            accurate_crosses: statLine.accurate_crosses,
            penalties_drawn: statLine.penalties_drawn,
            aerials_won: statLine.aerials_won,
            dispossessed: statLine.dispossessed,
            yellow_cards: statLine.yellow_cards,
            red_cards: statLine.red_cards,
            penalties_missed: statLine.penalties_missed,
            own_goals: statLine.own_goals,
            goals_against_outfield: 0,
            goals_against: 0,
            saves: statLine.saves,
            penalty_saves: statLine.penalty_saves,
            high_claims: statLine.high_claims,
            smothers: statLine.smothers,
          };

          const baseScore = player.position === "G" ? calcKeeperPts(formulaRow) : calcOutfielderPts(formulaRow);
          return { statLine, projectedScore: round(baseScore + goalsAgainstPenalty) };
        }

        // Starts and sub appearances get tracked separately (see
        // HistoryTotals.gamesStarted/minutesWhenStarted) so a predicted
        // starter's expected minutes come from their own starts, not a
        // blended average dragged down by any sub cameos mixed in -- and,
        // symmetrically, a predicted bench player's fallback comes from their
        // own sub cameos, not a blended average inflated by any starts mixed
        // in.
        const startsAvgMinutes = history.gamesStarted > 0 ? history.minutesWhenStarted / history.gamesStarted : null;
        const subGames = history.gamesPlayed - history.gamesStarted;
        const subAvgMinutes = subGames > 0 ? (history.minutes - history.minutesWhenStarted) / subGames : null;
        const blendedAvgMinutes = history.minutes / history.gamesPlayed;
        const fullExpectedMinutes = startsAvgMinutes ?? blendedAvgMinutes;

        // Only trust "not in the predicted lineup" when RotoWire actually
        // has a lineup for this player's team this gameweek (see
        // teamsWithKnownLineup above) -- otherwise there's no signal yet and
        // this falls back to exactly the pre-existing behavior.
        const teamHasKnownLineup = teamsWithKnownLineup.has(player.team);
        const isPredictedStarter = teamHasKnownLineup ? startersByPlayerId.has(player.id) : null;
        const actualExpectedMinutes =
          isPredictedStarter === false
            ? (subAvgMinutes ?? Math.min(blendedAvgMinutes, BENCH_FALLBACK_MINUTES))
            : fullExpectedMinutes;

        const actual = buildStatLineAndScore(actualExpectedMinutes);
        const ifStarting = actualExpectedMinutes === fullExpectedMinutes ? actual : buildStatLineAndScore(fullExpectedMinutes);

        projections.push({
          fantraxId: player.id,
          playerName: player.name,
          team: player.team,
          position: player.position,
          fixtureId: fixture.id,
          opponentAbbrev,
          isHome,
          expectedMinutes: round(actualExpectedMinutes),
          statLine: actual.statLine,
          projectedScore: actual.projectedScore,
          projectedScoreIfStarting: ifStarting.projectedScore,
          isPredictedStarter,
          injuryStatus,
        });
      }
    }
  }

  projections.sort((a, b) => b.projectedScore - a.projectedScore);
  return projections;
}
